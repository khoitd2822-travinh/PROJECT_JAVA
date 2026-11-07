package com.swiftletcare.backend.modules.farm.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class DeviceResponse {
    private Long id;
    private String name;
    private String deviceType;
    private String status;
    private Long zoneId;
    private Long farmId;
}