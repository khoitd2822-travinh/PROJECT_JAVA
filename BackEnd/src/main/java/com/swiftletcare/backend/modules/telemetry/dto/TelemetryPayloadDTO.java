package com.swiftletcare.backend.modules.telemetry.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Map;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryPayloadDTO {
    private String deviceId;
    private Long farmId;
    private Long zoneId;

    @JsonProperty("temp")
    private Double temperature;

    @JsonProperty("hum")
    private Double humidity;

    @JsonProperty("co2")
    private Integer co2;

    @JsonProperty("light")
    private Integer light;

    @JsonProperty("sound")
    private Double sound;

    private Integer fan;
    private Integer mist;
    private Integer heat;
    private Integer alarm;

    @JsonProperty("relays")
    private void unpackRelays(Map<String, Integer> relays) {
        if (relays != null) {
            this.mist = relays.get("mist");
            this.fan = relays.get("fan");
            this.heat = relays.get("heat");
            this.alarm = relays.get("alarm");
        }
    }
}