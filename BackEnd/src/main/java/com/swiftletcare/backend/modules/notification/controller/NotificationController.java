package com.swiftletcare.backend.modules.notification.controller;

import com.swiftletcare.backend.modules.notification.service.TelegramNotificationService;
import com.swiftletcare.backend.modules.notification.service.TelegramLinkService;
import com.swiftletcare.backend.modules.auth.security.UserDetailsImpl;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notification")
@CrossOrigin(origins = "*")
public class NotificationController {
    private final TelegramNotificationService telegramService;
    private final TelegramLinkService telegramLinkService;

    public NotificationController(TelegramNotificationService telegramService,
                                  TelegramLinkService telegramLinkService) {
        this.telegramService = telegramService;
        this.telegramLinkService = telegramLinkService;
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

    @GetMapping("/telegram/link-status")
    public ResponseEntity<?> getTelegramLinkStatus(@AuthenticationPrincipal UserDetailsImpl user) {
        return ResponseEntity.ok(java.util.Map.of("linked", telegramLinkService.isLinked(user.getId())));
    }

    @PostMapping("/telegram/link-code")
    public ResponseEntity<?> createTelegramLinkCode(@AuthenticationPrincipal UserDetailsImpl user) {
        String code = telegramLinkService.createLinkCode(user.getId());
        return ResponseEntity.ok(java.util.Map.of(
                "code", code,
                "expiresInSeconds", TelegramLinkService.LINK_CODE_TTL_SECONDS));
    }

    @DeleteMapping("/telegram/link")
    public ResponseEntity<?> unlinkTelegram(@AuthenticationPrincipal UserDetailsImpl user) {
        telegramLinkService.unlinkUser(user.getId());
        return ResponseEntity.ok(java.util.Map.of("linked", false));
    }
}