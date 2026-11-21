package com.swiftletcare.backend.modules.notification.controller;

import com.swiftletcare.backend.modules.notification.service.ZaloNotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notification")
@CrossOrigin(origins = "*")
public class NotificationController {
    private final ZaloNotificationService zaloService;

    public NotificationController(ZaloNotificationService zaloService) {
        this.zaloService = zaloService;
    }

    @PostMapping("/test-alert")
    public ResponseEntity<?> testAlert(@RequestParam String message, @RequestParam String imageUrl) {
        zaloService.sendAlertWithImage(message, imageUrl);
        return ResponseEntity.ok("Lệnh gửi Zalo đã được kích hoạt thành công!");
    }
}