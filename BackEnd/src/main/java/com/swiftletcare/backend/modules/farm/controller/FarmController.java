package com.swiftletcare.backend.modules.farm.controller;

import com.swiftletcare.backend.modules.farm.dto.DeviceControlRequest;
import com.swiftletcare.backend.modules.farm.entity.Device;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/farm")
@CrossOrigin(origins = "*")
public class FarmController {

    @GetMapping("/devices")
    public ResponseEntity<Map<String, Object>> getDevices(
            @RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) {

        List<Device> devices = new ArrayList<>();

        Map<String, Object> response = new HashMap<>();
        response.put("status", 200);
        response.put("message", "Lấy danh sách thiết bị thành công");
        response.put("data", devices);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/devices/control")
    public ResponseEntity<Map<String, Object>> controlDevice(@RequestBody DeviceControlRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        response.put("status", 200);
        response.put("message", "Đã gửi lệnh " + request.getCommand() + " thành công");
        response.put("data", request);

        return ResponseEntity.ok(response);
    }
}