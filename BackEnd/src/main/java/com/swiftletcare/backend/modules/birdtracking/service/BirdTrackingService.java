package com.swiftletcare.backend.modules.birdtracking.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingLog;
import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingCameraState;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingCameraStateRepository;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingRepository;
import com.swiftletcare.backend.modules.notification.service.WebSocketBroadcaster;
import com.swiftletcare.backend.modules.notification.service.ZaloNotificationService;
import com.swiftletcare.backend.modules.storage.service.MinioStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Receives the contract emitted by the edge AI. eventId is the idempotency key. */
@Service
public class BirdTrackingService {
    private static final Logger log = LoggerFactory.getLogger(BirdTrackingService.class);
    private final BirdTrackingRepository repository;
    private final ObjectMapper objectMapper;
    private final BirdTrackingCameraStateRepository stateRepository;
    private final WebSocketBroadcaster broadcaster;
    private final ZaloNotificationService zalo;
    private final MinioStorageService storageService;
    private final ConcurrentHashMap<String, String> pendingImages = new ConcurrentHashMap<>();

    public BirdTrackingService(BirdTrackingRepository repository, ObjectMapper objectMapper,
                               BirdTrackingCameraStateRepository stateRepository,
                               WebSocketBroadcaster broadcaster, ZaloNotificationService zalo,
                               MinioStorageService storageService) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.stateRepository = stateRepository;
        this.broadcaster = broadcaster;
        this.zalo = zalo;
        this.storageService = storageService;
    }

    public void process(String topic, String payload) {
        try {
            String[] parts = topic.split("/");
            if (parts.length != 4 || !"swiftletcare".equals(parts[0])) {
                log.warn("Ignoring unsupported bird tracking topic {}", topic);
                return;
            }
            JsonNode body = objectMapper.readTree(payload);
            switch (parts[3]) {
                case "count" -> saveCount(parts[1], parts[2], body);
                case "alert" -> saveAlert(parts[1], parts[2], body);
                case "alert-image" -> updateImage(body);
                case "heartbeat" -> updateHeartbeat(parts[1], parts[2], body);
                case "status" -> updateStatus(parts[1], parts[2], body);
                default -> log.warn("Ignoring unsupported bird tracking message type {}", parts[3]);
            }
        } catch (Exception e) {
            log.error("Cannot process bird tracking MQTT message on {}: {}", topic, e.getMessage());
        }
    }

    private void saveCount(String houseId, String cameraId, JsonNode body) {
        String eventId = requiredEventId(body);
        if (repository.findByEventId(eventId).isPresent()) return;
        int current = requiredInt(body, "current");
        BirdTrackingLog logEntry = base(houseId, cameraId, eventId, body);
        logEntry.setTrackId(body.path("trackId").isLong() ? body.path("trackId").asLong() : null);
        logEntry.setInCount(requiredInt(body, "in"));
        logEntry.setOutCount(requiredInt(body, "out"));
        logEntry.setCurrentCount(current);
        logEntry.setBirdCount(current);
        logEntry.setEventType("COUNT_" + body.path("event").asText("UNKNOWN"));
        logEntry.setDescription("AI bird count event");
        if (saveIdempotently(logEntry)) {
            updateState(houseId, cameraId, body, true);
            broadcaster.broadcastBirdTracking(houseId, cameraId, Map.of("type", "count", "data", logEntry));
        }
    }

    private void saveAlert(String houseId, String cameraId, JsonNode body) {
        String eventId = requiredEventId(body);
        if (repository.findByEventId(eventId).isPresent()) return;
        BirdTrackingLog logEntry = base(houseId, cameraId, eventId, body);
        logEntry.setEventType("THREAT_ALERT");
        logEntry.setDescription(body.path("class").asText("unknown") + " confidence=" + body.path("confidence").asText(""));
        String payloadKey = body.path("snapshotKey").isNull() ? null : body.path("snapshotKey").asText(null);
        logEntry.setSnapshotKey(payloadKey != null ? payloadKey : pendingImages.remove(eventId));
        if (saveIdempotently(logEntry)) {
            broadcaster.broadcastAlert(logEntry);
            broadcaster.broadcastBirdTracking(houseId, cameraId, Map.of("type", "alert", "data", logEntry));
            notifyZaloIfReady(logEntry);
        }
    }

    private void updateImage(JsonNode body) {
        String eventId = requiredEventId(body);
        String snapshotKey = body.path("snapshotKey").asText(null);
        if (snapshotKey == null || snapshotKey.isBlank()) throw new IllegalArgumentException("snapshotKey is required");
        repository.findByEventId(eventId).ifPresentOrElse(event -> {
            event.setSnapshotKey(snapshotKey);
            repository.save(event);
            notifyZaloIfReady(event);
            broadcaster.broadcastBirdTracking(houseFor(event.getCameraId()), event.getCameraId(),
                    Map.of("type", "alert-image", "data", event));
        }, () -> {
            // MQTT can redeliver or clients can reconnect. Retain the image until its
            // alert arrives; the alert path consumes it without creating another event.
            pendingImages.put(eventId, snapshotKey);
            log.info("Stored pending alert image for eventId={}", eventId);
        });
    }

    private BirdTrackingLog base(String houseId, String cameraId, String eventId, JsonNode body) {
        // Until a camera registry is introduced, the existing defaults remain explicit.
        Long farmId = body.path("farmId").asLong(1L);
        Long zoneId = body.path("zoneId").asLong(1L);
        return BirdTrackingLog.builder().farmId(farmId).zoneId(zoneId).cameraId(cameraId)
                .eventId(eventId).timestamp(parseTimestamp(body.path("ts").asText(null))).build();
    }

    private boolean saveIdempotently(BirdTrackingLog event) {
        try {
            repository.saveAndFlush(event);
            return true;
        } catch (DataIntegrityViolationException duplicate) {
            // Database unique constraint is authoritative when two consumers race.
            log.info("Duplicate bird event ignored: {}", event.getEventId());
            return false;
        }
    }

    private void updateHeartbeat(String houseId, String cameraId, JsonNode body) {
        updateState(houseId, cameraId, body, true);
        broadcaster.broadcastBirdTracking(houseId, cameraId, Map.of("type", "heartbeat", "data", body));
    }

    private void updateStatus(String houseId, String cameraId, JsonNode body) {
        updateState(houseId, cameraId, body, body.path("online").asBoolean(false));
        broadcaster.broadcastBirdTracking(houseId, cameraId, Map.of("type", "status", "data", body));
    }

    private void updateState(String houseId, String cameraId, JsonNode body, boolean online) {
        BirdTrackingCameraState state = stateRepository.findByCameraId(cameraId)
                .orElseGet(() -> BirdTrackingCameraState.builder().cameraId(cameraId).build());
        state.setHouseId(houseId);
        state.setFarmId(body.path("farmId").asLong(1L));
        state.setZoneId(body.path("zoneId").asLong(1L));
        state.setOnline(online);
        if (body.has("fps")) state.setFps(body.path("fps").asDouble());
        if (body.has("in")) state.setInCount(body.path("in").asInt());
        if (body.has("out")) state.setOutCount(body.path("out").asInt());
        if (body.has("current")) state.setCurrentCount(body.path("current").asInt());
        state.setLastSeen(parseTimestamp(body.path("ts").asText(null)));
        stateRepository.save(state);
    }

    private String houseFor(String cameraId) {
        return stateRepository.findByCameraId(cameraId).map(BirdTrackingCameraState::getHouseId).orElse("unknown");
    }

    /** One alert has at most three delivery attempts and at most one successful Zalo send. */
    private synchronized void notifyZaloIfReady(BirdTrackingLog event) {
        if (!"THREAT_ALERT".equals(event.getEventType()) || event.isZaloNotified()
                || event.getZaloAttempts() >= 3 || event.getSnapshotKey() == null) {
            return;
        }
        String imageUrl = storageService.getPresignedImageUrl(event.getSnapshotKey());
        if (imageUrl == null) {
            event.setZaloLastResult("S3 presigned URL unavailable");
            repository.save(event);
            log.warn("Cannot notify Zalo for {}: presigned URL unavailable", event.getEventId());
            return;
        }
        event.setZaloAttempts(event.getZaloAttempts() + 1);
        boolean sent = zalo.sendAlertWithImage(event.getDescription(), imageUrl);
        event.setZaloNotified(sent);
        event.setZaloLastResult(sent ? "accepted by Zalo" : "Zalo rejected or request failed");
        repository.save(event);
        if (!sent) log.warn("Zalo delivery failed for eventId={} (attempt {})", event.getEventId(), event.getZaloAttempts());
    }

    private static int requiredInt(JsonNode body, String field) {
        if (!body.has(field) || !body.path(field).canConvertToInt()) throw new IllegalArgumentException(field + " is required");
        return body.path(field).asInt();
    }

    private static String requiredEventId(JsonNode body) {
        String value = body.path("eventId").asText(null);
        if (value == null) throw new IllegalArgumentException("eventId is required");
        UUID.fromString(value);
        return value;
    }

    private static LocalDateTime parseTimestamp(String value) {
        if (value == null || value.isBlank()) return LocalDateTime.now();
        try { return OffsetDateTime.parse(value).toLocalDateTime(); }
        catch (Exception ignored) { return LocalDateTime.now(); }
    }
}
