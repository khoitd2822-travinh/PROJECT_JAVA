package com.swiftletcare.backend.modules.telemetry.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryPayloadDTO {
    private String deviceId;
    private Long farmId;
    private Long zoneId;
    
    private Double temperature;
    private Double humidity;
    private Integer co2;
    private Integer light;
    private Double sound;
    private Integer fan;
    private Integer mist;
    private Integer heat;
    private Integer alarm;
}