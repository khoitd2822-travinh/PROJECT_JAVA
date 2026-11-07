package com.swiftletcare.backend.modules.notification.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class WebSocketBroadcaster {
    private static final Logger log = LoggerFactory.getLogger(WebSocketBroadcaster.class);
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

     //Đẩy dữ liệu vi khí hậu real-time xuống Web qua channel WebSocket
    public void broadcastTelemetry(Long farmId, Long zoneId, Object data) {
        String destination = String.format("/topic/telemetry/%d/%d", farmId, zoneId);
        messagingTemplate.convertAndSend(destination, data);
        log.info("📢 [WebSocket Realtime] Đã phát dữ liệu tới topic: {}", destination);
    }

     //Đẩy cảnh báo đếm chim / thú hại real-time xuống Web
    public void broadcastAlert(Object alertData) {
        messagingTemplate.convertAndSend("/topic/alerts", alertData);
        log.info("🚨 [WebSocket Realtime] Đã phát cảnh báo tới topic: /topic/alerts");
    }
}