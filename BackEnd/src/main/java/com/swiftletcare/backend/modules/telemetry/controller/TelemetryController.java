
package com.swiftletcare.backend.modules.telemetry.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.swiftletcare.backend.modules.telemetry.repository.TelemetryRepository;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryController {

    private final StringRedisTemplate redis;
    private final TelemetryRepository repository;
    private final ObjectMapper mapper;

    public TelemetryController(
            StringRedisTemplate redis,
            TelemetryRepository repository,
            ObjectMapper mapper) {
        this.redis = redis;
        this.repository = repository;
        this.mapper = mapper;
    }

    @GetMapping("/latest")
    public ResponseEntity<Map<String, Object>> latest(
            @RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) throws Exception {

        scope(farmId, zoneId);

        String cached = redis.opsForValue().get("telemetry:latest:1:1");

        if (cached == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Chua co telemetry");
        }

        ObjectNode data = (ObjectNode) mapper.readTree(cached);

        String liveBoot = redis.opsForValue().get("board:live:1:1");

        boolean online = liveBoot != null
                && liveBoot.equals(data.path("bootId").asText());

        boolean fresh = false;

        try {
            Instant received = Instant.parse(
                    data.path("timestamp").asText());

            long age = Duration.between(
                    received,
                    Instant.now()).toMillis();

            fresh = age >= 0 && age <= 15000;

        } catch (RuntimeException ignored) {
            // Cache thiếu timestamp được xem là dữ liệu cũ.
        }

        data.put("online", online);
        data.put("stale", !online || !fresh);

        data.remove(List.of("sound", "soundDb"));

        return ResponseEntity.ok(Map.of(
                "status", 200,
                "data", data));
    }

    @GetMapping("/history")
    public ResponseEntity<Map<String, Object>> history(
            @RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId,
            @RequestParam(defaultValue = "24h") String range) {

        scope(farmId, zoneId);

        long hours = switch (range) {
            case "1h" -> 1;
            case "6h" -> 6;
            case "12h" -> 12;
            case "24h" -> 24;
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "range: 1h, 6h, 12h hoac 24h");
        };

        Instant from = Instant.now().minus(
                Duration.ofHours(hours));

        // Lấy mẫu dữ liệu trực tiếp từ PostgreSQL,
        // giới hạn tối đa 500 điểm.
        var rows = repository.findSampledHistory(
                farmId,
                zoneId,
                from);

        List<Map<String, Object>> points = new ArrayList<>();

        for (var row : rows) {
            Map<String, Object> point = new LinkedHashMap<>();

            point.put("time", row.getId().getTime().toString());
            point.put("temperature", row.getTemperature());
            point.put("humidity", row.getHumidity());
            point.put("co2", row.getCo2Level());
            point.put("light", row.getLightLevel());
            point.put("gasRaw", row.getGasRaw());

            points.add(point);
        }

        return ResponseEntity.ok(Map.of(
                "status", 200,
                "data", points));
    }

    private void scope(Long farmId, Long zoneId) {
        if (!Objects.equals(farmId, 1L)
                || !Objects.equals(zoneId, 1L)) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chi ho tro farmId=1, zoneId=1");
        }
    }
}
