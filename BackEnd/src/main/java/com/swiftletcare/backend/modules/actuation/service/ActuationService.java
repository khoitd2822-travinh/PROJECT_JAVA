package com.swiftletcare.backend.modules.actuation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.actuation.entity.ActuationCommand;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ActuationService {

    private static final Logger log = LoggerFactory.getLogger(ActuationService.class);

    private final ObjectMapper objectMapper;

    @Value("${mqtt.broker-url}")
    private String brokerUrl;

    public ActuationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public boolean publishCommand(ActuationCommand command) {
        MqttClient client = null;

        try {
            Map<String, Object> data = new LinkedHashMap<>();

            data.put("commandId", command.getId().toString());
            data.put("boardId", command.getBoardId());
            data.put("target", command.getTarget());
            data.put("expiresAt", command.getExpiresAt().toEpochMilli());

            String requestedMode = command.getRequestedMode() == null ? "MANUAL" : command.getRequestedMode();

            data.put("mode", requestedMode);

            if (command.getRequestedState() != null) {
                // ON/OFF: chuyển sang MANUAL và áp dụng trạng thái.
                data.put("action", "OVERRIDE");
                data.put("state", command.getRequestedState());
            } else {
                // AUTO/MANUAL: đổi chế độ, không yêu cầu state cụ thể.
                data.put("action", "SET_MODE");
            }

            String payload = objectMapper.writeValueAsString(data);

            client = new MqttClient(brokerUrl, MqttClient.generateClientId(), new MemoryPersistence());

            client.setTimeToWait(3000);

            MqttConnectOptions options = new MqttConnectOptions();
            options.setCleanSession(true);
            options.setConnectionTimeout(3);

            client.connect(options);

            MqttMessage message = new MqttMessage(payload.getBytes(StandardCharsets.UTF_8));
            message.setQos(1);
            message.setRetained(false);

            client.publish("swiftlet/command/1/1", message);

            log.info("Published commandId={}", command.getId());
            return true;

        } catch (Exception exception) {
            log.error("Publish failed commandId={}: {}",
                    command.getId(),
                    exception.getMessage());
            return false;

        } finally {
            if (client != null) {
                try {
                    if (client.isConnected()) {
                        client.disconnect(1000);
                    }
                } catch (MqttException ignored) {
                }

                try {
                    client.close();
                } catch (MqttException ignored) {
                }
            }
        }
    }
}