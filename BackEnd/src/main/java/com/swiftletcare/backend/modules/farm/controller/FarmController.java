package com.swiftletcare.backend.modules.farm.controller;

import com.swiftletcare.backend.modules.actuation.dto.OverrideRequestDTO;
import com.swiftletcare.backend.modules.actuation.service.ActuationService;
import com.swiftletcare.backend.modules.farm.dto.DeviceControlRequest;
import com.swiftletcare.backend.modules.farm.entity.Device;
import com.swiftletcare.backend.modules.farm.repository.DeviceRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/farm")
@CrossOrigin(origins = "*")
public class FarmController {

    private final DeviceRepository deviceRepository;
    private final ActuationService actuationService;

    public FarmController(DeviceRepository deviceRepository, ActuationService actuationService) {
        this.deviceRepository = deviceRepository;
        this.actuationService = actuationService;
    }

    @GetMapping("/devices")
    public ResponseEntity<Map<String, Object>> getDevices(@RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) {

        List<Device> devices = deviceRepository.findByFarmIdAndZoneId(farmId, zoneId);

        Map<String, Object> response = new HashMap<>();
        response.put("status", 200);
        response.put("message", "Lấy danh sách thiết bị thành công");
        response.put("data", devices);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/devices/control")
    public ResponseEntity<Map<String, Object>> controlDevice(@RequestBody DeviceControlRequest request) {
        Map<String, Object> response = new HashMap<>();

        Device device = deviceRepository.findById(request.getDeviceId()).orElse(null);
        if (device == null) {
            response.put("status", 404);
            response.put("message", "Không tìm thấy thiết bị");
            return ResponseEntity.status(404).body(response);
        }

        boolean turnOn = "ON".equalsIgnoreCase(request.getCommand());

        OverrideRequestDTO command = new OverrideRequestDTO();
        command.setFarmId(device.getFarmId());
        command.setZoneId(device.getZoneId());
        command.setDeviceType(toMqttTarget(device.getDeviceType()));
        command.setState(turnOn);

        boolean sent = actuationService.sendOverrideCommand(command);
        if (!sent) {
            response.put("status", 500);
            response.put("message", "Gửi lệnh MQTT thất bại");
            return ResponseEntity.status(500).body(response);
        }

        device.setStatus(turnOn ? "ON" : "OFF");
        device.setLastActive(LocalDateTime.now());
        deviceRepository.save(device);

        response.put("status", 200);
        response.put("message", "Đã gửi lệnh " + request.getCommand() + " tới " + device.getName());
        response.put("data", device);
        return ResponseEntity.ok(response);
    }

    /** Bảng devices lưu FAN/HUMIDIFIER/HEATER. ESP32 nhận fan/mist/heat. */
    private String toMqttTarget(String deviceType) {
        if (deviceType == null) {
            return "fan";
        }
        return switch (deviceType.toUpperCase()) {
            case "FAN" -> "fan";
            case "HUMIDIFIER", "MIST" -> "mist";
            case "HEATER", "HEAT" -> "heat";
            case "ALARM" -> "alarm";
            default -> deviceType.toLowerCase();
        };
    }
}