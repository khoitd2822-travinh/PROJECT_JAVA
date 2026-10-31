
package com.swiftletcare.backend.modules.telemetry.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/telemetry")
@CrossOrigin(origins = "*") // Cho phép FrontEnd / TV6 gọi API không bị chặn CORS
public class TelemetryController {


    private StringRedisTemplate redisTemplate;

    public TelemetryController(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @GetMapping("/latest")

    public ResponseEntity<Map<String, Object>> getLatestTelemetry(@RequestParam(defaultValue = "1") Long farmId, @RequestParam(defaultValue = "1") Long zoneId) {
        //đọc đúng cái key phân tầng đã lưu ở TelemetryProccessingService
        String redisKey = String.format("telemetry:latest:%d:%d", farmId, zoneId);
        //Đọc trực tiếp chuỗi JSON vi khí hậu mới nhất lưu trong Redis RAM
        String cachedData = redisTemplate.opsForValue().get(redisKey);

        Map<String, Object> response = new HashMap<>();
        if (cachedData != null) {
            response.put("status", 200);
            response.put("message", "lấy dữ liệu vi khí hậu mới nhất thành công");
            response.put("data", cachedData);
            return ResponseEntity.ok(response);
        } else {
            response.put("status", 404);
            response.put("message", "Chưa có dữ liệu telemetry nào được ghi nhận cho nhà yến này");
            return ResponseEntity.status(404).body(response);
        }
    }
}