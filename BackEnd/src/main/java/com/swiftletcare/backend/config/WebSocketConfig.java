package com.swiftletcare.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry){
        // Bật Simple Broker với tiền tố "/topic" để Client Đăng ký lắng nghe
        registry.enableSimpleBroker("/topic");
        // Tiền tố "/app" cho các request gửi từ Client lên Server
        registry.setApplicationDestinationPrefixes("/app");
    }
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Cổng kết nối WebSocket tại địa chỉ: ws://localhost:8080/ws-swiftlet
        registry.addEndpoint("/ws-swiftlet")
                .setAllowedOriginPatterns("*"); // Cho phép Frontend Next.js gọi cross-origin không bị chặn CORS
                //.withSockJS(); // Dự phòng nếu trình duyệt cũ không hỗ trợ WebSocket thuần
    }

}
