package com.swiftletcare.backend.modules.notification.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.swiftletcare.backend.modules.notification.service.TelegramBotUpdateService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/v1/telegram")
public class TelegramWebhookController {
    private final TelegramBotUpdateService updateService;
    private final String webhookSecret;

    public TelegramWebhookController(TelegramBotUpdateService updateService,
                                     @Value("${telegram.webhook-secret:}") String webhookSecret) {
        this.updateService = updateService;
        this.webhookSecret = webhookSecret;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Void> receiveUpdate(
            @RequestHeader(name = "X-Telegram-Bot-Api-Secret-Token", required = false) String suppliedSecret,
            @RequestBody JsonNode update) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
        if (suppliedSecret == null || !MessageDigest.isEqual(
                webhookSecret.getBytes(StandardCharsets.UTF_8),
                suppliedSecret.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        updateService.process(update);
        return ResponseEntity.ok().build();
    }
}
