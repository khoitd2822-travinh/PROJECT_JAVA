package com.swiftletcare.backend.modules.actuation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.actuation.dto.OverrideRequestDTO;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;

@Service
public class ActuationService {
    private static final Logger log = LoggerFactory.getLogger(ActuationService.class);

    @Value("${mqtt.broker-url}")
    private String brokerUrl;

    private final ObjectMapper objectMapper;
    public ActuationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public boolean sendOverrideCommand(OverrideRequestDTO dto) {
        String topic = String.format("swiftlet/command/%d/%d", dto.getFarmId(), dto.getZoneId());
        try {
            // Đóng gói nội dung lệnh gửi xuống ESP32
            Map<String, Object> commandMap = new HashMap<>();
            commandMap.put("action", "OVERRIDE");
            commandMap.put("target", dto.getDeviceType());
            commandMap.put("state", dto.getState() ? 1 : 0);
            String jsonPayload = objectMapper.writeValueAsString(commandMap);

            // Kết nối nhanh tới EMQX để bắn lệnh xuống topic điều khiển
            MqttClient client = new MqttClient(brokerUrl, MqttClient.generateClientId());
            client.connect();

            MqttMessage message = new MqttMessage(jsonPayload.getBytes());
            message.setQos(1);
            client.publish(topic, message);
            client.disconnect();
            client.close();

            log.info("[MQTT Command Outbound] Đã bắn lệnh tới [{}]: {}", topic, jsonPayload);
            return true;
        } catch (Exception e) {
            log.error("❌ Lỗi khi bắn lệnh MQTT Override: {}", e.getMessage());
            return false;
        }
    }
}