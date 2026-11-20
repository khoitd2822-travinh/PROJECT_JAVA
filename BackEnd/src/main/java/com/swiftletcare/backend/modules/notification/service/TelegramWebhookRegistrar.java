package com.swiftletcare.backend.modules.notification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.Map;

@Component
public class TelegramWebhookRegistrar {
    private static final Logger log = LoggerFactory.getLogger(TelegramWebhookRegistrar.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String botToken;
    private final String webhookUrl;
    private final String webhookSecret;

    public TelegramWebhookRegistrar(@Qualifier("telegramRestTemplate") RestTemplate restTemplate,
                                    ObjectMapper objectMapper,
                                    @Value("${telegram.bot.token:}") String botToken,
                                    @Value("${telegram.webhook-url:}") String webhookUrl,
                                    @Value("${telegram.webhook-secret:}") String webhookSecret) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.botToken = botToken;
        this.webhookUrl = webhookUrl;
        this.webhookSecret = webhookSecret;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void registerWebhook() {
        if (botToken == null || botToken.isBlank()) {
            log.warn("Telegram bot token is not configured; webhook registration was skipped");
            return;
        }
        if (webhookUrl == null || webhookUrl.isBlank()
                || webhookSecret == null || !webhookSecret.matches("[A-Za-z0-9_-]{1,256}")) {
            log.warn("Telegram webhook requires a public HTTPS URL and a valid webhook secret");
            return;
        }

        try {
            URI callback = URI.create(webhookUrl);
            if (!"https".equalsIgnoreCase(callback.getScheme()) || callback.getHost() == null) {
                log.error("Telegram webhook URL must be an absolute HTTPS URL");
                return;
            }

            URI endpoint = URI.create("https://api.telegram.org/bot" + botToken + "/setWebhook");
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<String> response = restTemplate.exchange(endpoint, HttpMethod.POST,
                    new HttpEntity<>(Map.of("url", webhookUrl, "secret_token", webhookSecret), headers),
                    String.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.error("Telegram webhook registration returned an unsuccessful or empty response");
                return;
            }
            JsonNode result = objectMapper.readTree(response.getBody());
            if (!result.path("ok").asBoolean(false)) {
                log.error("Telegram webhook registration failed: {}",
                        result.path("description").asText("unsuccessful Telegram response"));
                return;
            }
            log.info("Telegram webhook registered");
        } catch (RestClientException | JsonProcessingException | IllegalArgumentException exception) {
            log.error("Telegram webhook registration failed ({})",
                    exception.getClass().getSimpleName());
        }
    }
}
