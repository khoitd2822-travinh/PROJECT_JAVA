
package com.swiftletcare.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/telemetry")
@CrossOrigin(origins = "*") // Cho phép FrontEnd / TV6 gọi API không bị chặn CORS
public class TelemetryController {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @GetMapping("/latest")
    public ResponseEntity<String> getLatestTelemetry() {
        // Đọc giá trị mới nhất đang lưu trong Redis
        String latestData = redisTemplate.opsForValue().get("telemetry:latest");

        if (latestData == null) {
            return ResponseEntity.status(404).body("{\"message\": \"Chưa có dữ liệu telemetry nào được ghi nhận từ MQTT.\"}");
        }

        // Trả về dữ liệu JSON cho phía client (TV6 / FrontEnd)
        return ResponseEntity.ok()
                .header("Content-Type", "application/json")
                .body(latestData);
    }
}