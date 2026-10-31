package com.swiftletcare.backend.modules.birdtracking.controller;

import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingLog;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/bird-tracking")
@CrossOrigin(origins = "*")
public class BirdTrackingController {

    @GetMapping("/logs")
    public ResponseEntity<Map<String, Object>> getTrackingLogs(
            @RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) {

        List<BirdTrackingLog> logs = new ArrayList<>();

        Map<String, Object> response = new HashMap<>();
        response.put("status", 200);
        response.put("message", "Lấy lịch sử đếm chim thành công");
        response.put("data", logs);

        return ResponseEntity.ok(response);
    }
}