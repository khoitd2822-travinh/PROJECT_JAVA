package com.swiftletcare.backend.modules.telemetry.mqtt;

import com.swiftletcare.backend.modules.telemetry.service.TelemetryProcessingService;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

@Component
public class TelemetryMqttReceiver {
    public final TelemetryProcessingService telemetryProcessingService;

    public TelemetryMqttReceiver(TelemetryProcessingService telemetryProcessingService) {
        this.telemetryProcessingService = telemetryProcessingService;
    }
    @ServiceActivator(inputChannel = "telemetryInboundChannel")
    public void handleTelemetryMessage(Message<?> message){
        String topic = (String) message.getHeaders().get(MqttHeaders.RECEIVED_TOPIC);
        String payload = (String) message.getPayload();
        telemetryProcessingService.processTelemetryMessage(topic, payload);

    }
}
