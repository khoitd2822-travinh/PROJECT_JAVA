package com.swiftletcare.backend.modules.birdtracking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "bird_tracking_logs", uniqueConstraints = @UniqueConstraint(name = "uk_bird_tracking_event_id", columnNames = "event_id"))
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

    @Column(name = "event_id", unique = true, length = 36)
    private String eventId;

    private String cameraId;
    private Long trackId;
    private Integer inCount;
    private Integer outCount;
    private Integer currentCount;
    private String snapshotKey;
    private boolean telegramTextNotified;
    private boolean telegramNotified;
    private int telegramAttempts;
    @Column(length = 500)
    private String telegramLastResult;

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
