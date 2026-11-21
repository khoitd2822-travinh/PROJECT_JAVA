package com.swiftletcare.backend.modules.telemetry.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.notification.service.WebSocketBroadcaster;
import com.swiftletcare.backend.modules.telemetry.dto.TelemetryPayloadDTO;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import com.swiftletcare.backend.modules.telemetry.repository.TelemetryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class TelemetryProcessingService {

    private static final Logger log =
            LoggerFactory.getLogger(TelemetryProcessingService.class);

    private final TelemetryRepository telemetryRepository;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final WebSocketBroadcaster webSocketBroadcaster;

    public TelemetryProcessingService(
            TelemetryRepository telemetryRepository,
            StringRedisTemplate stringRedisTemplate,
            ObjectMapper objectMapper,
            WebSocketBroadcaster webSocketBroadcaster) {

        this.telemetryRepository = telemetryRepository;
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.webSocketBroadcaster = webSocketBroadcaster;
    }

    public void processTelemetryMessage(String topic, String payload) {
        try {
            // 1. Chuyển JSON thành DTO
            TelemetryPayloadDTO dto =
                    objectMapper.readValue(payload, TelemetryPayloadDTO.class);

            // 2. Kiểm tra dữ liệu bắt buộc
            if (dto.getDeviceId() == null || dto.getDeviceId().isBlank()) {
                log.warn("Telemetry bị từ chối: thiếu deviceId. Topic={}", topic);
                return;
            }

            if (dto.getTemperature() == null || dto.getHumidity() == null) {
                log.warn("Telemetry bị từ chối: thiếu temperature hoặc humidity. Topic={}", topic);
                return;
            }

            // 3. Xác định Farm và Zone
            Long farmId = dto.getFarmId() != null ? dto.getFarmId() : 1L;
            Long zoneId = dto.getZoneId() != null ? dto.getZoneId() : 1L;
            String deviceId = dto.getDeviceId();

            if (farmId <= 0 || zoneId <= 0) {
                log.warn("Telemetry bị từ chối: farmId hoặc zoneId không hợp lệ. Topic={}", topic);
                return;
            }

            Instant now = Instant.now();

            // 4. Tạo Entity và ánh xạ dữ liệu
            SensorTelemetry telemetry = new SensorTelemetry();

            telemetry.setId(new SensorTelemetryId(now, deviceId));
            telemetry.setFarmId(farmId);
            telemetry.setZoneId(zoneId);

            telemetry.setTemperature(dto.getTemperature());
            telemetry.setHumidity(dto.getHumidity());
            telemetry.setCo2Level(dto.getCo2());
            telemetry.setLightLevel(dto.getLight());

            // Nếu không có sound thì sử dụng giá trị mặc định 65 dB
            telemetry.setSoundDb(
                    dto.getSound() != null ? dto.getSound() : 65.0
            );

            telemetry.setFanState(dto.getFan() != null && dto.getFan() == 1);
            telemetry.setMistState(dto.getMist() != null && dto.getMist() == 1);
            telemetry.setHeaterState(dto.getHeat() != null && dto.getHeat() == 1);
            telemetry.setAlarmState(dto.getAlarm() != null && dto.getAlarm() == 1);

            // 5. Lưu vào Database
            telemetryRepository.save(telemetry);

            // 6. Lưu dữ liệu mới nhất vào Redis (5 phút)
            String redisKey =
                    String.format("telemetry:latest:%d:%d", farmId, zoneId);

            stringRedisTemplate.opsForValue().set(
                    redisKey,
                    payload,
                    Duration.ofMinutes(5)
            );

            // 7. Gửi dữ liệu realtime qua WebSocket
            webSocketBroadcaster.broadcastTelemetry(farmId, zoneId, dto);

            // 8. Log kết quả
            log.info(
                    "Lưu Telemetry thành công | Topic={} | Device={} | Temp={} | Hum={}",
                    topic,
                    deviceId,
                    dto.getTemperature(),
                    dto.getHumidity()
            );

        } catch (JsonProcessingException e) {
            log.error("Payload Telemetry không hợp lệ | Topic={}", topic, e);

        } catch (RuntimeException e) {
            log.error("Lỗi xử lý Telemetry | Topic={}", topic, e);
        }
    }
}