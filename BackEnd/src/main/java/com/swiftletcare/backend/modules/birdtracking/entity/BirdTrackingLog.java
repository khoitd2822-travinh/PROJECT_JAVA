package com.swiftletcare.backend.modules.birdtracking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "bird_tracking_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BirdTrackingLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long farmId;
    private Long zoneId;

    private int birdCount;      // Số lượng chim đếm được qua AI camera
    private String eventType;   // "INFO_COUNT" hoặc "THREAT_ALERT"
    private String description; // Mô tả chi tiết

    private LocalDateTime timestamp;

    @PrePersist
    public void prePersist() {
        if (this.timestamp == null) {
            this.timestamp = LocalDateTime.now();
        }
    }
}