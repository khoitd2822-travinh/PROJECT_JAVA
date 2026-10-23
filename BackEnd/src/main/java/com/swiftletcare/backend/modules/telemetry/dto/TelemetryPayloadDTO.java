package com.swiftletcare.backend.modules.telemetry.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;

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

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public Long getFarmId() {
        return farmId;
    }

    public void setFarmId(Long farmId) {
        this.farmId = farmId;
    }

    public Long getZoneId() {
        return zoneId;
    }

    public void setZoneId(Long zoneId) {
        this.zoneId = zoneId;
    }

    public Double getTemperature() {
        return temperature;
    }

    public void setTemperature(Double temperature) {
        this.temperature = temperature;
    }

    public Double getHumidity() {
        return humidity;
    }

    public void setHumidity(Double humidity) {
        this.humidity = humidity;
    }

    public Integer getCo2() {
        return co2;
    }

    public void setCo2(Integer co2) {
        this.co2 = co2;
    }

    public Integer getLight() {
        return light;
    }

    public void setLight(Integer light) {
        this.light = light;
    }

    public Double getSound() {
        return sound;
    }

    public void setSound(Double sound) {
        this.sound = sound;
    }

    public Integer getFan() {
        return fan;
    }

    public void setFan(Integer fan) {
        this.fan = fan;
    }

    public Integer getMist() {
        return mist;
    }

    public void setMist(Integer mist) {
        this.mist = mist;
    }

    public Integer getHeat() {
        return heat;
    }

    public void setHeat(Integer heat) {
        this.heat = heat;
    }

    public Integer getAlarm() {
        return alarm;
    }

    public void setAlarm(Integer alarm) {
        this.alarm = alarm;
    }
}
