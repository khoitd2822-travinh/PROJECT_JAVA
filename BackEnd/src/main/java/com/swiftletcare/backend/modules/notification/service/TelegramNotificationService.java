package com.swiftletcare.backend.modules.notification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.auth.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class TelegramNotificationService {
    private static final Logger log = LoggerFactory.getLogger(TelegramNotificationService.class);
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String botToken;
    private final UserRepository userRepository;

    public TelegramNotificationService(@Qualifier("telegramRestTemplate") RestTemplate restTemplate,
                                       ObjectMapper objectMapper,
                                       @Value("${telegram.bot.token:}") String botToken,
                                       UserRepository userRepository) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.botToken = botToken;
        this.userRepository = userRepository;
    }

    public boolean sendAlertWithImage(String text, String imageUrl) {
        if (!isPublicHttpsUrl(imageUrl)) {
            log.warn("Telegram alert was not sent because its image URL is not a public HTTPS URL");
            return false;
        }
        return sendText(text) && sendImage(imageUrl);
    }

    public boolean sendText(String text) {
        if (text == null || text.isBlank()) {
            log.warn("Telegram alert text was empty; message was not sent");
            return false;
        }
        return sendToLinkedUsers("sendMessage", "text", text);
    }

    public boolean sendImage(String imageUrl) {
        if (!isPublicHttpsUrl(imageUrl)) {
            log.warn("Telegram alert image was not sent because its URL is not a public HTTPS URL");
            return false;
        }
        return sendToLinkedUsers("sendPhoto", "photo", imageUrl);
    }

    public boolean sendTextToChat(String chatId, String text) {
        if (chatId == null || chatId.isBlank() || text == null || text.isBlank()) {
            log.warn("Telegram reply had an empty chat ID or text; message was not sent");
            return false;
        }
        if (!botTokenConfigured()) return false;
        return sendMessage("sendMessage", Map.of("chat_id", chatId, "text", text));
    }

    private boolean sendToLinkedUsers(String method, String contentKey, String content) {
        if (!botTokenConfigured()) return false;
        List<String> chatIds = new ArrayList<>(userRepository.findAllTelegramChatIds());
        if (chatIds.isEmpty()) {
            log.warn("No Telegram users are linked; alert was not sent");
            return false;
        }

        int sent = 0;
        int failures = 0;
        for (String chatId : chatIds) {
            if (chatId == null || chatId.isBlank()
                    || !sendMessage(method, Map.of("chat_id", chatId, contentKey, content))) {
                failures++;
            } else {
                sent++;
            }
        }
        if (failures > 0) log.warn("Telegram delivery failed for {} linked chat(s)", failures);
        return sent > 0;
    }

    private boolean botTokenConfigured() {
        if (botToken == null || botToken.isBlank()) {
            log.warn("Telegram bot token is absent; message was not sent");
            return false;
        }
        return true;
    }

    private boolean sendMessage(String method, Map<String, Object> body) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            URI endpoint = URI.create("https://api.telegram.org/bot" + botToken + "/" + method);
            ResponseEntity<String> response = restTemplate.exchange(endpoint, HttpMethod.POST,
                    new HttpEntity<>(body, headers), String.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.error("Telegram returned an unsuccessful or empty response for {}", method);
                return false;
            }
            JsonNode result = objectMapper.readTree(response.getBody());
            if (!result.path("ok").asBoolean(false)) {
                log.error("Telegram rejected {}: {}", method, result.path("description").asText("no description"));
                return false;
            }
            log.info("Telegram accepted {}", method);
            return true;
        } catch (HttpStatusCodeException exception) {
            log.error("Telegram rejected {} with HTTP {}", method, exception.getStatusCode());
            return false;
        } catch (RestClientException | JsonProcessingException | IllegalArgumentException exception) {
            log.error("Telegram {} request failed ({})", method, exception.getClass().getSimpleName(), exception);
            return false;
        }
    }

    private boolean isPublicHttpsUrl(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            return "https".equalsIgnoreCase(uri.getScheme()) && host != null && isPublicHost(host);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean isPublicHost(String host) {
        String normalized = host.toLowerCase(java.util.Locale.ROOT);
        if (normalized.equals("localhost") || normalized.endsWith(".localhost")
                || normalized.endsWith(".local") || normalized.endsWith(".lan")
                || normalized.endsWith(".internal")) {
            return false;
        }
        String address = normalized.replace("[", "").replace("]", "");
        if (!address.matches("[0-9.]+") && !address.contains(":")) return true;
        try {
            var ip = java.net.InetAddress.getByName(address);
            return !ip.isAnyLocalAddress() && !ip.isLoopbackAddress()
                    && !ip.isLinkLocalAddress() && !ip.isSiteLocalAddress();
        } catch (java.net.UnknownHostException exception) {
            return false;
        }
    }
}
