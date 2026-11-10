package com.swiftletcare.backend.modules.actuation.controller;

import com.swiftletcare.backend.modules.actuation.dto.CommandResponse;
import com.swiftletcare.backend.modules.actuation.service.CommandService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/actuation")
@CrossOrigin(origins = "*")
public class ActuationController {
    private final CommandService commandService;

    public ActuationController(CommandService commandService) {
        this.commandService = commandService;
    }

    @GetMapping("/commands/{commandId}")
    public ResponseEntity<Map<String, Object>> getCommand(@PathVariable UUID commandId) {
        CommandResponse command = commandService.get(commandId);
        return ResponseEntity.ok(Map.of(
                "status", 200,
                "message", "Lấy kết quả lệnh thành công",
                "data", command));
    }

    @PostMapping("/override")
    public void oldOverride() {
        throw new ResponseStatusException(HttpStatus.GONE, "Dùng POST /api/v1/farm/devices/control");
    }
}