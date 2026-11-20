package com.swiftletcare.backend.modules.telemetry.service;

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
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;

@Service
public class TelemetryProcessingService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryProcessingService.class);

    private static final String BOARD = "ESP32_ZONE_1";
    private static final String LIVE_KEY = "board:live:1:1";
    private static final String LATEST_KEY = "telemetry:latest:1:1";

    private final TelemetryRepository telemetryRepository;
    private final DeviceRepository devices;
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final WebSocketBroadcaster broadcaster;
    private final TransactionTemplate transaction;

    public TelemetryProcessingService(TelemetryRepository telemetryRepository, DeviceRepository devices,
            StringRedisTemplate redis, ObjectMapper mapper, WebSocketBroadcaster broadcaster,
            PlatformTransactionManager transactionManager) {
        this.telemetryRepository = telemetryRepository;
        this.devices = devices;
        this.redis = redis;
        this.mapper = mapper;
        this.broadcaster = broadcaster;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public void processTelemetryMessage(String topic, String payload) {
        try {
            // Last Will / trạng thái kết nối MQTT.
            if ("swiftlet/status/1/1".equals(topic)) {
                JsonNode status = mapper.readTree(payload);

                if (!BOARD.equals(status.path("boardId").asText()))
                    return;
                if (!status.path("online").isBoolean())
                    return;

                // Retained online không chứng minh board đang gửi dữ liệu mới.
                if (!status.path("online").asBoolean()) {
                    String boot = status.path("bootId").asText();
                    String liveBoot = redis.opsForValue().get(LIVE_KEY);

                    if (!boot.isBlank() && boot.equals(liveBoot)) {
                        redis.delete(LIVE_KEY);
                    }
                }
                return;
            }
            boolean history = "swiftlet/telemetry/1/1".equals(topic);

            if (!history && !"swiftlet/heartbeat/1/1".equals(topic)) {
                return;
            }

            TelemetryPayloadDTO dto = mapper.readValue(payload, TelemetryPayloadDTO.class);

            String board = dto.getBoardId() != null ? dto.getBoardId() : dto.getDeviceId();
            if (!BOARD.equals(board) || !Objects.equals(dto.getFarmId(), 1L) || !Objects.equals(dto.getZoneId(), 1L)
                    || dto.getBootId() == null || dto.getBootId().isBlank()) {
                log.warn("Bo qua snapshot sai board/farm/zone/boot");
                return;
            }

            if (dto.getRelays() == null)
                dto.setRelays(Map.of());
            if (dto.getModes() == null)
                dto.setModes(Map.of());
            if (dto.getValid() == null)
                dto.setValid(Map.of());

            dto.setDeviceId(BOARD);
            dto.setBoardId(BOARD);

            // Không dùng số đo mà firmware đánh dấu không hợp lệ.
            if (!valid(dto, "temp") || !finite(dto.getTemperature(), -40, 125)) {
                dto.setTemperature(null);
            }

            if (!valid(dto, "hum") || !finite(dto.getHumidity(), 0, 100)) {
                dto.setHumidity(null);
            }

            if (!valid(dto, "light") || dto.getLight() == null || dto.getLight() < 0) {
                dto.setLight(null);
            }

            if (!valid(dto, "co2") || dto.getCo2() == null || dto.getCo2() < 0) {
                dto.setCo2(null);
            }

            if (dto.getGasRaw() != null && (dto.getGasRaw() < 0 || dto.getGasRaw() > 4095)) {
                dto.setGasRaw(null);
            }

            dto.setValid(Map.of(
                    "temp", dto.getTemperature() != null,
                    "hum", dto.getHumidity() != null,
                    "light", dto.getLight() != null,
                    "co2", dto.getCo2() != null));

            Instant now = Instant.now();

            transaction.executeWithoutResult(tx -> {
                // Chỉ telemetry ghi lịch sử; heartbeat không ghi trùng lịch sử.
                if (history) {
                    SensorTelemetry row = new SensorTelemetry();

                    row.setId(new SensorTelemetryId(now, BOARD));
                    row.setFarmId(1L);
                    row.setZoneId(1L);

                    row.setTemperature(dto.getTemperature());
                    row.setHumidity(dto.getHumidity());
                    row.setCo2Level(dto.getCo2());
                    row.setLightLevel(dto.getLight());
                    row.setGasRaw(dto.getGasRaw());

                    // Đã bỏ cảm biến âm thanh.
                    row.setSoundDb(null);

                    row.setFanState(state(dto, "fan"));
                    row.setFanSmokeState(state(dto, "fan_smoke"));
                    row.setMistState(state(dto, "mist"));
                    row.setHeaterState(state(dto, "heat"));
                    row.setAlarmState(state(dto, "alarm"));

                    telemetryRepository.save(row);
                }

                // Đồng bộ trạng thái/mode thực tế ESP32 báo về.
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

                                    // Không đổi lastAckStatus tại đây.
                                    // Telemetry không xác nhận kết quả command.
                                }));
            });
            ObjectNode data = mapper.valueToTree(dto);
            data.put("timestamp", now.toString());

            redis.opsForValue().set(LATEST_KEY,
                    mapper.writeValueAsString(data),
                    Duration.ofMinutes(5));

            redis.opsForValue().set(LIVE_KEY,
                    dto.getBootId(),
                    Duration.ofSeconds(15));

            data.put("online", true);
            data.put("stale", false);

            broadcaster.broadcastTelemetry(1L, 1L, data);

        } catch (Exception exception) {
            log.error(
                    "Khong xu ly duoc telemetry/status: {}",
                    topic,
                    exception);
        }
    }

    private boolean valid(TelemetryPayloadDTO dto, String key) {
        return Boolean.TRUE.equals(dto.getValid().get(key));
    }

    private boolean finite(Double value, double min, double max) {
        return value != null && Double.isFinite(value) && value >= min && value <= max;
    }

    private Boolean state(TelemetryPayloadDTO dto, String target) {
        Integer value = dto.getRelays().get(target);
        return value == null || (value != 0 && value != 1) ? null : value == 1;
    }
}