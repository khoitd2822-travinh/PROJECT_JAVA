
package com.swiftletcare.backend.modules.telemetry.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.swiftletcare.backend.modules.actuation.dto.DeviceTarget;
import com.swiftletcare.backend.modules.farm.repository.DeviceRepository;
import com.swiftletcare.backend.modules.notification.service.WebSocketBroadcaster;
import com.swiftletcare.backend.modules.telemetry.dto.TelemetryPayloadDTO;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import com.swiftletcare.backend.modules.telemetry.repository.TelemetryRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

@Service
public class TelemetryProcessingService {

    private static final Logger log =
            LoggerFactory.getLogger(TelemetryProcessingService.class);

    private static final String BOARD = "ESP32_ZONE_1";

    private static final String LIVE_KEY = "board:live:1:1";
    private static final String LATEST_KEY = "telemetry:latest:1:1";

    private static final String STATUS_TOPIC = "swiftlet/status/1/1";
    private static final String TELEMETRY_TOPIC = "swiftlet/telemetry/1/1";
    private static final String HEARTBEAT_TOPIC = "swiftlet/heartbeat/1/1";

    private static final Duration LATEST_TTL = Duration.ofMinutes(5);
    private static final Duration LIVE_TTL = Duration.ofSeconds(15);

    private final TelemetryRepository telemetryRepository;
    private final DeviceRepository devices;
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final WebSocketBroadcaster broadcaster;
    private final TransactionTemplate transaction;

    public TelemetryProcessingService(
            TelemetryRepository telemetryRepository,
            DeviceRepository devices,
            StringRedisTemplate redis,
            ObjectMapper mapper,
            WebSocketBroadcaster broadcaster,
            PlatformTransactionManager transactionManager) {

        this.telemetryRepository = telemetryRepository;
        this.devices = devices;
        this.redis = redis;
        this.mapper = mapper;
        this.broadcaster = broadcaster;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public void processTelemetryMessage(String topic, String payload) {

        // 1. Phan loai topic.
        if (STATUS_TOPIC.equals(topic)) {
            processStatusMessage(payload);
            return;
        }

        boolean history = TELEMETRY_TOPIC.equals(topic);

        if (!history && !HEARTBEAT_TOPIC.equals(topic)) {
            return;
        }

        // 2. Parse JSON.
        TelemetryPayloadDTO dto;

        try {
            dto = mapper.readValue(payload, TelemetryPayloadDTO.class);
        } catch (JsonProcessingException exception) {
            log.warn("Telemetry JSON khong hop le, topic={}", topic, exception);
            return;
        } catch (RuntimeException exception) {
            log.error("Loi khi doc telemetry payload, topic={}", topic, exception);
            return;
        }

        // 3. Kiem tra dinh danh board.
        String board = dto.getBoardId() != null
                ? dto.getBoardId()
                : dto.getDeviceId();

        if (!BOARD.equals(board)
                || !Objects.equals(dto.getFarmId(), 1L)
                || !Objects.equals(dto.getZoneId(), 1L)
                || dto.getBootId() == null
                || dto.getBootId().isBlank()) {

            log.warn("Bo qua telemetry sai board/farm/zone/boot");
            return;
        }

        if (dto.getRelays() == null) {
            dto.setRelays(Map.of());
        }

        if (dto.getModes() == null) {
            dto.setModes(Map.of());
        }

        if (dto.getValid() == null) {
            dto.setValid(new HashMap<>());
        }

        dto.setDeviceId(BOARD);
        dto.setBoardId(BOARD);

        // 4. Kiem tra chat luong du lieu.
        validateMeasurements(dto);

        // Backend ghi nhan thoi diem nhan.
        // Chua co measuredAt dang tin cay tu firmware.
        Instant receivedAt = Instant.now();

        // 5. Luu PostgreSQL trong transaction rieng.
        // Heartbeat khong ghi lich su nhung van dong bo trang thai device.
        try {
            transaction.executeWithoutResult(status -> {

                if (history) {
                    saveHistory(dto, receivedAt);
                }

                syncDeviceStates(dto);
            });

        } catch (DataAccessException exception) {
            log.error(
                    "Loi PostgreSQL khi xu ly telemetry, topic={}",
                    topic,
                    exception);
            return;

        } catch (RuntimeException exception) {
            log.error(
                    "Loi transaction khi xu ly telemetry, topic={}",
                    topic,
                    exception);
            return;
        }

        // 6. Tao du lieu realtime.
        ObjectNode data;
        String json;

        try {
            data = mapper.valueToTree(dto);

            data.put("receivedAt", receivedAt.toString());

            // Giu timestamp de tuong thich Frontend hien tai.
            data.put("timestamp", receivedAt.toString());

            json = mapper.writeValueAsString(data);

        } catch (JsonProcessingException | IllegalArgumentException exception) {
            log.error("Loi JSON khi tao latest telemetry", exception);
            return;

        } catch (RuntimeException exception) {
            log.error("Loi khi chuan bi realtime telemetry", exception);
            return;
        }

        // 7. Cap nhat Redis latest.
        try {
            redis.opsForValue().set(
                    LATEST_KEY,
                    json,
                    LATEST_TTL);

        } catch (RuntimeException exception) {
            log.error("Loi Redis khi cap nhat latest telemetry", exception);
        }

        // 8. Cap nhat Redis online rieng.
        try {
            redis.opsForValue().set(
                    LIVE_KEY,
                    dto.getBootId(),
                    LIVE_TTL);

        } catch (RuntimeException exception) {
            log.error("Loi Redis khi cap nhat trang thai online", exception);
        }

        // 9. WebSocket doc lap voi Redis.
        data.put("online", true);
        data.put("stale", false);

        try {
            broadcaster.broadcastTelemetry(1L, 1L, data);

        } catch (RuntimeException exception) {
            log.error("Loi WebSocket khi broadcast telemetry", exception);
        }
    }

    private void processStatusMessage(String payload) {

        JsonNode status;

        try {
            status = mapper.readTree(payload);

        } catch (JsonProcessingException exception) {
            log.warn("Status JSON khong hop le", exception);
            return;

        } catch (RuntimeException exception) {
            log.error("Loi khi doc status payload", exception);
            return;
        }

        if (!BOARD.equals(status.path("boardId").asText())) {
            return;
        }

        if (!status.path("online").isBoolean()) {
            return;
        }

        // Chi xu ly Last Will offline.
        if (!status.path("online").asBoolean()) {

            String boot = status.path("bootId").asText();

            if (boot.isBlank()) {
                return;
            }

            try {
                String liveBoot = redis.opsForValue().get(LIVE_KEY);

                if (boot.equals(liveBoot)) {
                    redis.delete(LIVE_KEY);
                }

            } catch (RuntimeException exception) {
                log.error("Loi Redis khi xu ly Last Will offline", exception);
            }
        }
    }

    private void validateMeasurements(TelemetryPayloadDTO dto) {

        Map<String, Boolean> valid =
                new HashMap<>(dto.getValid());

        boolean tempValid =
                Boolean.TRUE.equals(valid.get("temp"))
                        && finite(dto.getTemperature(), -40, 125);

        boolean humValid =
                Boolean.TRUE.equals(valid.get("hum"))
                        && finite(dto.getHumidity(), 0, 100);

        boolean lightValid =
                Boolean.TRUE.equals(valid.get("light"))
                        && dto.getLight() != null
                        && dto.getLight() >= 0;

        boolean co2Valid =
                Boolean.TRUE.equals(valid.get("co2"))
                        && dto.getCo2() != null
                        && dto.getCo2() >= 0;

        if (!tempValid) {
            dto.setTemperature(null);
        }

        if (!humValid) {
            dto.setHumidity(null);
        }

        if (!lightValid) {
            dto.setLight(null);
        }

        if (!co2Valid) {
            dto.setCo2(null);
        }

        if (dto.getGasRaw() != null
                && (dto.getGasRaw() < 0 || dto.getGasRaw() > 4095)) {
            dto.setGasRaw(null);
        }

        // Bao toan cac flag khac do firmware gui.
        valid.put("temp", tempValid);
        valid.put("hum", humValid);
        valid.put("light", lightValid);
        valid.put("co2", co2Valid);

        dto.setValid(valid);
    }

    private void saveHistory(
            TelemetryPayloadDTO dto,
            Instant receivedAt) {

        SensorTelemetry row = new SensorTelemetry();

        row.setId(new SensorTelemetryId(receivedAt, BOARD));
        row.setFarmId(1L);
        row.setZoneId(1L);

        row.setTemperature(dto.getTemperature());
        row.setHumidity(dto.getHumidity());
        row.setCo2Level(dto.getCo2());
        row.setLightLevel(dto.getLight());
        row.setGasRaw(dto.getGasRaw());

        // Khong su dung cam bien am thanh.
        row.setSoundDb(null);

        row.setFanState(state(dto, "fan"));
        row.setFanSmokeState(state(dto, "fan_smoke"));
        row.setMistState(state(dto, "mist"));
        row.setHeaterState(state(dto, "heat"));
        row.setAlarmState(state(dto, "alarm"));

        telemetryRepository.save(row);
    }

    private void syncDeviceStates(TelemetryPayloadDTO dto) {

        devices.findIdsByFarmIdAndZoneId(1L, 1L)
                .forEach(id -> devices.findForUpdate(id)
                        .ifPresent(device -> {

                            final String target;

                            try {
                                target = DeviceTarget.fromDeviceType(
                                        device.getDeviceType()).getMqttTarget();

                            } catch (IllegalArgumentException unsupported) {
                                return;
                            }

                            Boolean actual = state(dto, target);
                            String mode = dto.getModes().get(target);

                            if (actual != null) {
                                device.setStatus(actual ? "ON" : "OFF");
                                device.setLastActive(LocalDateTime.now());
                            }

                            if ("AUTO".equals(mode)
                                    || "MANUAL".equals(mode)) {
                                device.setControlMode(mode);
                            }

                            // Telemetry khong xac nhan command ACK.
                        }));
    }

    private boolean finite(
            Double value,
            double min,
            double max) {

        return value != null
                && Double.isFinite(value)
                && value >= min
                && value <= max;
    }

    private Boolean state(
            TelemetryPayloadDTO dto,
            String target) {

        Integer value = dto.getRelays().get(target);

        return value == null || (value != 0 && value != 1)
                ? null
                : value == 1;
    }
}
