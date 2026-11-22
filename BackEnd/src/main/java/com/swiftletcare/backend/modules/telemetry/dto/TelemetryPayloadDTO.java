package com.swiftletcare.backend.modules.telemetry.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.HashMap;
import java.util.Map;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryPayloadDTO {

    private String boardId;
    private String deviceId;
    private String bootId;

    private Long farmId;
    private Long zoneId;

    private Boolean clockReady;

    @JsonProperty("temp")
    @JsonAlias("temperature")
    private Double temperature;

    @JsonProperty("hum")
    @JsonAlias("humidity")
    private Double humidity;

    private Integer co2;
    private Integer light;
    private Integer gasRaw;

    private Map<String, Integer> relays = new HashMap<>();
    private Map<String, String> modes = new HashMap<>();
    private Map<String, Boolean> valid = new HashMap<>();
}