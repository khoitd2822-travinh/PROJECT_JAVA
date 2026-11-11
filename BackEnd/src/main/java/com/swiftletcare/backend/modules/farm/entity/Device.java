package com.swiftletcare.backend.modules.farm.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "devices")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Device {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String deviceType; // HUMIDIFIER, FAN, LIGHT, SOUND

    @Column(nullable = false)
    private String status; // ON, OFF

    @Column(name = "control_mode", length = 16)
    private String controlMode;

    private Long zoneId; 
    private Long farmId; 

    private LocalDateTime lastActive;

    
    @Column(name = "last_command_time")
    private LocalDateTime lastCommandTime; // Mốc thời gian gửi lệnh để tính timeout

    // --- Bổ sung để hiển thị kết quả ACK real-time ---
    @Column(name = "last_ack_status", length = 32)
    private String lastAckStatus; // SUCCESS, FAILED, PENDING

    @Column(name = "last_message", columnDefinition = "TEXT")
    private String lastMessage;   // Thông điệp phản hồi từ thiết bị phần cứng
}