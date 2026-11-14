package com.swiftletcare.backend.modules.farm.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class DeviceResponse {
    private Long id;
    private String name;
    private String deviceType;
    private String status;
    private Long zoneId;
    private Long farmId;
    private LocalDateTime lastActive;

    private String controlMode;
}