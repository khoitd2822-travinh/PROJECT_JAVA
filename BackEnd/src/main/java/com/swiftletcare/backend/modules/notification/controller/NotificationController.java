package com.swiftletcare.backend.modules.notification.controller;

import com.swiftletcare.backend.modules.notification.service.TelegramNotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notification")
@CrossOrigin(origins = "*")
public class NotificationController {
    private final TelegramNotificationService telegramService;

    public NotificationController(TelegramNotificationService telegramService) {
        this.telegramService = telegramService;
    }

    @PostMapping("/test-alert")
    public ResponseEntity<?> testAlert(@RequestParam String message, @RequestParam String imageUrl) {
        boolean sent = telegramService.sendAlertWithImage(message, imageUrl);
        if (!sent) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(java.util.Map.of("success", false, "message", "Telegram did not accept the alert"));
        }
        return ResponseEntity.ok(java.util.Map.of("success", true, "message", "Telegram accepted the alert"));
    }
}