package com.swiftletcare.backend.modules.birdtracking.mqtt;

import com.swiftletcare.backend.modules.birdtracking.service.BirdTrackingService;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

@Component
public class BirdTrackingMqttReceiver {
    private final BirdTrackingService service;
    public BirdTrackingMqttReceiver(BirdTrackingService service) { this.service = service; }

    @ServiceActivator(inputChannel = "birdTrackingInboundChannel")
    public void receive(Message<?> message) {
        service.process((String) message.getHeaders().get(MqttHeaders.RECEIVED_TOPIC),
                String.valueOf(message.getPayload()));
    }
}
