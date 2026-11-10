package com.swiftletcare.backend.modules.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import java.util.HashMap;
import java.util.Map;

@Service
public class ZaloNotificationService {
    private static final Logger log = LoggerFactory.getLogger(ZaloNotificationService.class);
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();
    @Value("${zalo.oa.access-token}") private String accessToken;
    @Value("${zalo.oa.user-id}") private String userId;

    /** Sends once for a newly persisted alert. False means no delivery may be reported. */
    public boolean sendAlertWithImage(String text, String imageUrl) {
        if (accessToken == null || accessToken.isBlank() || userId == null || userId.isBlank()) {
            log.warn("Zalo credentials are absent; alert was not sent");
            return false;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("access_token", accessToken);
            Map<String, Object> message = new HashMap<>();
            message.put("text", text);
            if (imageUrl != null && !imageUrl.isBlank()) {
                message.put("attachment", Map.of("type", "image", "payload", Map.of("url", imageUrl)));
            }
            Map<String, Object> body = Map.of("recipient", Map.of("user_id", userId), "message", message);
            ResponseEntity<String> response = restTemplate.exchange("https://openapi.zalo.me/v2.0/oa/message",
                    HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                log.error("Zalo rejected alert with HTTP {}", response.getStatusCode());
                return false;
            }
            if (response.getBody() == null || objectMapper.readTree(response.getBody()).path("error").asInt(-1) != 0) {
                log.error("Zalo business response reports failure: {}", response.getBody());
                return false;
            }
            log.info("Zalo alert accepted: {}", response.getBody());
            return true;
        } catch (Exception exception) {
            log.error("Zalo alert failed: {}", exception.getMessage());
            return false;
        }
    }
}
