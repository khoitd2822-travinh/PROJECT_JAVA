package com.swiftletcare.backend.modules.birdtracking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "bird_tracking_camera_states", uniqueConstraints = @UniqueConstraint(name = "uk_bird_camera_state", columnNames = "camera_id"))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BirdTrackingCameraState {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "camera_id", nullable = false, unique = true)
    private String cameraId;
    private String houseId;
    private Long farmId;
    private Long zoneId;
    private boolean online;
    private Double fps;
    private Integer inCount;
    private Integer outCount;
    private Integer currentCount;
    private LocalDateTime lastSeen;
}
