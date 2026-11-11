package com.swiftletcare.backend.modules.birdtracking.controller;

import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingLog;
import com.swiftletcare.backend.modules.birdtracking.dto.BirdTrackingDTO;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingRepository;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingCameraStateRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/bird-tracking")
@CrossOrigin(origins = "*")
public class BirdTrackingController {

    private final BirdTrackingRepository birdTrackingRepository;
    private final BirdTrackingCameraStateRepository stateRepository;

    public BirdTrackingController(BirdTrackingRepository birdTrackingRepository,
                                  BirdTrackingCameraStateRepository stateRepository) {
        this.birdTrackingRepository = birdTrackingRepository;
        this.stateRepository = stateRepository;
    }

    @GetMapping("/cameras/{cameraId}/state")
    public ResponseEntity<Map<String, Object>> getCameraState(@PathVariable String cameraId) {
        return stateRepository.findByCameraId(cameraId)
                .<ResponseEntity<Map<String, Object>>>map(state -> ResponseEntity.ok(Map.of("status", 200, "data", state)))
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("status", 404, "message", "Camera state not found")));
    }

    @GetMapping("/logs")
    public ResponseEntity<Map<String, Object>> getTrackingLogs(@RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) {

        List<BirdTrackingLog> logs = birdTrackingRepository
                .findByFarmIdAndZoneIdOrderByTimestampDesc(farmId, zoneId);

        Map<String, Object> response = new HashMap<>();
        response.put("status", 200);
        response.put("message", "Lấy lịch sử đếm chim thành công");
        response.put("data", logs.stream().map(this::toDto).collect(Collectors.toList()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/current")
    public ResponseEntity<Map<String, Object>> getCurrent(@RequestParam(defaultValue = "1") Long farmId,
            @RequestParam(defaultValue = "1") Long zoneId) {
        var cameraState = stateRepository.findTopByFarmIdAndZoneIdOrderByLastSeenDesc(farmId, zoneId);
        if (cameraState.isPresent()) {
            return ResponseEntity.ok(Map.of("status", 200, "data", cameraState.get()));
        }
        List<BirdTrackingLog> logs = birdTrackingRepository.findByFarmIdAndZoneIdOrderByTimestampDesc(farmId, zoneId);
        BirdTrackingLog latest = logs.stream().filter(log -> log.getCurrentCount() != null).findFirst().orElse(null);
        return ResponseEntity.ok(Map.of("status", 200, "data", latest == null ? Map.of("current", 0) : toDto(latest)));
    }

    private BirdTrackingDTO toDto(BirdTrackingLog log) {
        return BirdTrackingDTO.builder().id(log.getId()).farmId(log.getFarmId()).zoneId(log.getZoneId())
                .eventId(log.getEventId()).cameraId(log.getCameraId()).trackId(log.getTrackId())
                .inCount(log.getInCount()).outCount(log.getOutCount()).currentCount(log.getCurrentCount())
                .snapshotKey(log.getSnapshotKey()).birdCount(log.getBirdCount()).eventType(log.getEventType())
                .zaloNotified(log.isZaloNotified()).zaloAttempts(log.getZaloAttempts()).zaloLastResult(log.getZaloLastResult())
                .description(log.getDescription()).timestamp(log.getTimestamp()).build();
    }
}
