package com.swiftletcare.service;

import org.eclipse.paho.client.mqttv3.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

@Service
public class MqttSubscriberService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private static final String BROKER_URL = "tcp://localhost:1883"; // Hoặc địa chỉ IP của MQTT Broker
    private static final String CLIENT_ID = "SwiftletCare_Backend_Subscriber";
    private static final String TOPIC = "swiftletcare/telemetry";

    @PostConstruct
    public void init() {
        // Chạy ngầm tiến trình lắng nghe MQTT để không block luồng khởi động của Spring Boot
        new Thread(this::connectAndSubscribe).start();
    }

    private void connectAndSubscribe() {
        try {
            MqttClient client = new MqttClient(BROKER_URL, CLIENT_ID);
            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(true);

            client.setCallback(new MqttCallback() {
                @Override
                public void connectionLost(Throwable cause) {
                    System.out.println("Mất kết nối MQTT Broker: " + cause.getMessage());
                }

                @Override
                public void messageArrived(String topic, MqttMessage message) {
                    String payload = new String(message.getPayload());
                    System.out.println("Nhận dữ liệu từ ESP32 qua topic [" + topic + "]: " + payload);

                    // Lưu dữ liệu telemetry mới nhất vào Redis với key là "telemetry:latest"
                    redisTemplate.opsForValue().set("telemetry:latest", payload);
                }

                @Override
                public void deliveryComplete(IMqttDeliveryToken token) {
                    // Không dùng cho subscriber
                }
            });

            client.connect(options);
            client.subscribe(TOPIC, 1);
            System.out.println("Đã kết nối và đăng ký lắng nghe topic MQTT: " + TOPIC);

        } catch (MqttException e) {
            e.printStackTrace();
        }
    }
}