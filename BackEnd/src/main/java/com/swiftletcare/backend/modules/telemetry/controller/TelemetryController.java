
package com.swiftletcare.backend.modules.telemetry.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.repository.TelemetryRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/telemetry")
@CrossOrigin(origins = "*") // Cho phép FrontEnd / TV6 gọi API không bị chặn CORS
public class TelemetryController {

    private StringRedisTemplate redisTemplate;
    private final TelemetryRepository telemetryRepository;

    public TelemetryController(StringRedisTemplate redisTemplate, TelemetryRepository telemetryRepository) {
        this.redisTemplate = redisTemplate;
        this.telemetryRepository = telemetryRepository;
    }

    @GetMapping("/latest")

    public ResponseEntity<Map<String, Object>> getLatestTelemetry(@RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) {
        // đọc đúng cái key phân tầng đã lưu ở TelemetryProccessingService
        String redisKey = String.format("telemetry:latest:%d:%d", farmId, zoneId);
        // Đọc trực tiếp chuỗi JSON vi khí hậu mới nhất lưu trong Redis RAM
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

    @GetMapping("/history")
    public ResponseEntity<Map<String, Object>> getHistory(@RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId, @RequestParam(defaultValue = "24h") String range) {
        long hours = 24;
        if (range != null && range.endsWith("h")) {
            try {
                hours = Long.parseLong(range.substring(0, range.length() - 1));
            } catch (NumberFormatException ignored) {
                hours = 24;
            }
        }
        Instant from = Instant.now().minus(Duration.ofHours(hours));
        List<SensorTelemetry> rows = telemetryRepository
                .findByFarmIdAndZoneIdAndId_TimeAfterOrderById_TimeAsc(farmId, zoneId, from);
        List<Map<String, Object>> points = new ArrayList<>();
        for (SensorTelemetry row : rows) {
            Map<String, Object> point = new HashMap<>();
            point.put("time", row.getId().getTime().toString());
            point.put("temperature", row.getTemperature());
            point.put("humidity", row.getHumidity());
            point.put("co2", row.getCo2Level());
            point.put("sound", row.getSoundDb());
            
            points.add(point);
        }
        Map<String, Object> response = new HashMap<>();
        response.put("status", 200);
        response.put("message", "Lấy lịch sử vi khí hậu thành công");
        response.put("data", points);
        return ResponseEntity.ok(response);
    }
}