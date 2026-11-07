package com.swiftletcare.backend.modules.notification.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Service
public class ZaloNotificationService {
    private static final Logger log = LoggerFactory.getLogger(ZaloNotificationService.class);
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${zalo.oa.access-token}")
    private String accessToken;

    @Value("${zalo.oa.user-id}")
    private String userId;

    public void sendAlertWithImage(String messageText, String imageUrl) {
        try {
            String url = "https://openapi.zalo.me/v2.0/oa/message";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("access_token", accessToken);

            Map<String, Object> body = new HashMap<>();
            Map<String, Object> recipient = new HashMap<>();
            recipient.put("user_id", userId);
            body.put("recipient", recipient);

            Map<String, Object> message = new HashMap<>();
            message.put("text", messageText);

            Map<String, Object> attachment = new HashMap<>();
            attachment.put("type", "image");
            Map<String, Object> payload = new HashMap<>();
            payload.put("url", imageUrl);
            attachment.put("payload", payload);

            message.put("attachment", attachment);
            body.put("message", message);

            //HttpEntity> entity = new HttpEntity<>(body, headers);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            log.info("Đã bắn thông báo Zalo khẩn cấp thành công!");

        } catch (Exception e) {
            log.error("Lỗi khi bắn thông báo Zalo: {}", e.getMessage());
        }
    }
}