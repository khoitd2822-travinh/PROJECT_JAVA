package com.swiftletcare.backend.modules.birdtracking.dto;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class BirdTrackingDTO {
    private Long id;
    private Long farmId;
    private Long zoneId;
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
    private String telegramLastResult;
    private int birdCount;
    private String eventType;
    private String description;
    private LocalDateTime timestamp;
}
