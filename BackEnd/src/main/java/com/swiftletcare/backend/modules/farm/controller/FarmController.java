package com.swiftletcare.backend.modules.farm.controller;

import com.swiftletcare.backend.modules.farm.dto.DeviceControlRequest;
import com.swiftletcare.backend.modules.farm.dto.DeviceResponse;
import com.swiftletcare.backend.modules.farm.service.FarmService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import com.swiftletcare.backend.modules.actuation.dto.CommandResponse;
import com.swiftletcare.backend.modules.actuation.entity.CommandStatus;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/farm")
@CrossOrigin(origins = "*")
public class FarmController {
    private final FarmService farmService;
    public FarmController(FarmService farmService) {
        this.farmService = farmService;
    }
    @GetMapping("/devices")
    public ResponseEntity<Map<String, Object>> getDevices(@RequestParam(defaultValue = "1") Long farmId, @RequestParam(defaultValue = "1") Long zoneId) {
        List<DeviceResponse> devices = farmService.getDevices(farmId, zoneId);
        return ResponseEntity.ok(Map.of(
                "status", 200,
                "message", "Lấy danh sách thiết bị thành công",
                "data", devices));
    }

    @PostMapping("/devices/control")
    public ResponseEntity<Map<String, Object>> controlDevice(@Valid @RequestBody DeviceControlRequest request) {
        CommandResponse result = farmService.sendCommand(request);
        int httpStatus = result.status() == CommandStatus.PUBLISH_FAILED ? 502 : 202;
        return ResponseEntity.status(httpStatus).body(Map.of(
                "status", httpStatus,
                "message", "Kiểm tra data.status để biết kết quả lệnh",
                "data", result));
    }
}