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

    private Long zoneId; 
    private Long farmId; 

    private LocalDateTime lastActive;
}