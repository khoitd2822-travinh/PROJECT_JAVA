package com.swiftletcare.backend.modules.birdtracking.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingLog;
import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingCameraState;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingCameraStateRepository;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingRepository;
import com.swiftletcare.backend.modules.notification.service.WebSocketBroadcaster;
import com.swiftletcare.backend.modules.notification.service.TelegramNotificationService;
import com.swiftletcare.backend.modules.storage.service.MinioStorageService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;

/** Receives the contract emitted by the edge AI. eventId is the idempotency key. */
@Service
public class BirdTrackingService {
    private static final Logger log = LoggerFactory.getLogger(BirdTrackingService.class);
    private final BirdTrackingRepository repository;
    private final ObjectMapper objectMapper;
    private final BirdTrackingCameraStateRepository stateRepository;
    private final WebSocketBroadcaster broadcaster;
    private final TelegramNotificationService telegram;
    private final MinioStorageService storageService;
    private final TaskExecutor notificationExecutor;
    private final ConcurrentHashMap<String, String> pendingImages = new ConcurrentHashMap<>();
    private final Set<String> telegramInFlight = ConcurrentHashMap.newKeySet();

    public BirdTrackingService(BirdTrackingRepository repository, ObjectMapper objectMapper,
                               BirdTrackingCameraStateRepository stateRepository,
                               WebSocketBroadcaster broadcaster, TelegramNotificationService telegram,
                               MinioStorageService storageService,
                               @Qualifier("notificationTaskExecutor") TaskExecutor notificationExecutor) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.stateRepository = stateRepository;
        this.broadcaster = broadcaster;
        this.telegram = telegram;
        this.storageService = storageService;
        this.notificationExecutor = notificationExecutor;
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
        } catch (JsonProcessingException | RuntimeException exception) {
            log.error("Cannot process bird tracking MQTT message on {}", topic, exception);
        }
    }

    private void saveCount(String houseId, String cameraId, JsonNode body) {
        String eventId = requiredEventId(body);
        if (repository.findByEventId(eventId).isPresent()) return;
        int current = requiredInt(body, "current");
        BirdTrackingLog logEntry = base(cameraId, eventId, body);
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
        BirdTrackingLog logEntry = base(cameraId, eventId, body);
        logEntry.setEventType("THREAT_ALERT");
        logEntry.setDescription(body.path("class").asText("unknown") + " confidence=" + body.path("confidence").asText(""));
        String payloadKey = body.path("snapshotKey").isNull() ? null : body.path("snapshotKey").asText(null);
        logEntry.setSnapshotKey(payloadKey != null ? payloadKey : pendingImages.remove(eventId));
        if (saveIdempotently(logEntry)) {
            broadcaster.broadcastAlert(logEntry);
            broadcaster.broadcastBirdTracking(houseId, cameraId, Map.of("type", "alert", "data", logEntry));
            notifyTelegramIfReady(logEntry);
        }
    }

    private void updateImage(JsonNode body) {
        String eventId = requiredEventId(body);
        String snapshotKey = body.path("snapshotKey").asText(null);
        if (snapshotKey == null || snapshotKey.isBlank()) throw new IllegalArgumentException("snapshotKey is required");
        repository.findByEventId(eventId).ifPresentOrElse(event -> {
            event.setSnapshotKey(snapshotKey);
            repository.save(event);
            notifyTelegramIfReady(event);
            broadcaster.broadcastBirdTracking(houseFor(event.getCameraId()), event.getCameraId(),
                    Map.of("type", "alert-image", "data", event));
        }, () -> {
            // MQTT can redeliver or clients can reconnect. Retain the image until its
            // alert arrives; the alert path consumes it without creating another event.
            pendingImages.put(eventId, snapshotKey);
            log.info("Stored pending alert image for eventId={}", eventId);
        });
    }

    private BirdTrackingLog base(String cameraId, String eventId, JsonNode body) {
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
        BirdTrackingCameraState state = stateRepository.findByCameraId(cameraId).orElse(null);
        return state == null || state.getHouseId() == null ? "unknown" : state.getHouseId();
    }

    /** One alert has at most three delivery attempts and at most one successful Telegram send. */
    private void notifyTelegramIfReady(BirdTrackingLog event) {
        if (!"THREAT_ALERT".equals(event.getEventType()) || event.isTelegramNotified()
                || event.getTelegramAttempts() >= 3 || event.getSnapshotKey() == null) {
            return;
        }
        String eventId = event.getEventId();
        if (!telegramInFlight.add(eventId)) return;
        try {
            notificationExecutor.execute(() -> sendTelegramAlert(eventId));
        } catch (RuntimeException exception) {
            telegramInFlight.remove(eventId);
            event.setTelegramLastResult("Notification queue unavailable");
            repository.save(event);
            log.error("Could not queue Telegram delivery for eventId={}: {}",
                    eventId, exception.getClass().getSimpleName());
        }
    }

    private void sendTelegramAlert(String eventId) {
        try {
            BirdTrackingLog event = repository.findByEventId(eventId).orElse(null);
            if (event == null || !"THREAT_ALERT".equals(event.getEventType())
                    || event.isTelegramNotified() || event.getTelegramAttempts() >= 3
                    || event.getSnapshotKey() == null) return;

            event.setTelegramAttempts(event.getTelegramAttempts() + 1);
            event.setTelegramLastResult("Sending");
            repository.save(event);

            String imageUrl = storageService.getPresignedImageUrl(event.getSnapshotKey());
            if (imageUrl == null) {
                event.setTelegramLastResult("S3 presigned URL unavailable");
                repository.save(event);
                log.warn("Cannot notify Telegram for eventId={} (attempt {})",
                        eventId, event.getTelegramAttempts());
                return;
            }

            if (!event.isTelegramTextNotified()) {
                if (!telegram.sendText(event.getDescription())) {
                    event.setTelegramLastResult("Telegram rejected alert text");
                    repository.save(event);
                    log.warn("Telegram text delivery failed for eventId={} (attempt {})",
                            eventId, event.getTelegramAttempts());
                    return;
                }
                event.setTelegramTextNotified(true);
                repository.save(event);
            }

            boolean imageSent = telegram.sendImage(imageUrl);
            event.setTelegramNotified(imageSent);
            event.setTelegramLastResult(imageSent ? "text and image accepted by Telegram"
                    : "text accepted; Telegram rejected image");
            repository.save(event);
            if (!imageSent) log.warn("Telegram image delivery failed for eventId={} (attempt {})",
                    eventId, event.getTelegramAttempts());
        } catch (RuntimeException exception) {
            log.error("Telegram delivery processing failed for eventId={}: {}",
                    eventId, exception.getClass().getSimpleName());
            try {
                repository.findByEventId(eventId).ifPresent(event -> {
                    event.setTelegramNotified(false);
                    event.setTelegramLastResult("Delivery processing failed");
                    repository.save(event);
                });
            } catch (RuntimeException persistenceException) {
                log.error("Could not save Telegram failure result for eventId={}: {}",
                        eventId, persistenceException.getClass().getSimpleName());
            }
        } finally {
            telegramInFlight.remove(eventId);
        }
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
        catch (DateTimeParseException ignored) { return LocalDateTime.now(); }
    }
}
