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
    private int birdCount;
    private String eventType;
    private String description;
    private LocalDateTime timestamp;
}