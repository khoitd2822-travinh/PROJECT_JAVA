package com.swiftletcare.backend.modules.telemetry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.telemetry.dto.TelemetryPayloadDTO;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import com.swiftletcare.backend.modules.telemetry.repository.SensorTelemetryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;


import java.time.Duration;
import java.time.Instant;

@Service
public class TelemetryProcessingService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryProcessingService.class);

    private final SensorTelemetryRepository telemetryRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public TelemetryProcessingService(SensorTelemetryRepository telemetryRepository,
                                      StringRedisTemplate redisTemplate,
                                      ObjectMapper objectMapper) {
        this.telemetryRepository = telemetryRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public void processTelemetryMessage(String topic, String payload) {
        try {
            TelemetryPayloadDTO dto = objectMapper.readValue(payload, TelemetryPayloadDTO.class);

            String deviceId = (dto.getDeviceId() != null) ? dto.getDeviceId() : "ESP32_ZONE_1";
            Long farmId = (dto.getFarmId() != null) ? dto.getFarmId() : 1L;
            Long zoneId = (dto.getZoneId() != null) ? dto.getZoneId() : 1L;

            Instant now = Instant.now();

            // 1. Ghi vào TimescaleDB Hypertable
            SensorTelemetry telemetry = new SensorTelemetry();
            telemetry.setId(new SensorTelemetryId(now, deviceId));
            telemetry.setFarmId(farmId);
            telemetry.setZoneId(zoneId);
            telemetry.setTemperature(dto.getTemperature());
            telemetry.setHumidity(dto.getHumidity());
            telemetry.setCo2Level(dto.getCo2());
            telemetry.setLightLevel(dto.getLight());
            telemetry.setSoundDb(dto.getSound() != null ? dto.getSound() : 65.0);
            telemetry.setFanState(dto.getFan() != null && dto.getFan() == 1);
            telemetry.setMistState(dto.getMist() != null && dto.getMist() == 1);
            telemetry.setHeaterState(dto.getHeat() != null && dto.getHeat() == 1);
            telemetry.setAlarmState(dto.getAlarm() != null && dto.getAlarm() == 1);

            telemetryRepository.save(telemetry);

            String redisKey = String.format("telemetry:latest:%d:%d", farmId, zoneId);
            redisTemplate.opsForValue().set(redisKey, payload, Duration.ofMinutes(5));

            redisTemplate.opsForValue().set("telemetry:latest", payload, Duration.ofMinutes(5));

            log.info("Lưu thành công Telemetry từ Topic [{}]: Temp={}°C, Hum={}%", topic, dto.getTemperature(), dto.getHumidity());

        } catch (Exception e) {
            log.error("Lỗi khi giải mã và lưu gói tin Telemetry: {}", e.getMessage());
        }
    }
}