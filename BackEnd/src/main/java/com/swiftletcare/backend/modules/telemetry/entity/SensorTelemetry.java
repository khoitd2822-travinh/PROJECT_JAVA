package com.swiftletcare.backend.modules.telemetry.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "sensor_telemetry")
public class SensorTelemetry {
    @EmbeddedId
    private SensorTelemetryId id;

    @Column(name = "farm_id")
    private Long farmId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "temperature")
    private Double temperature;

    @Column(name = "humidity")
    private Double humidity;

    @Column(name = "co2_level")
    private Integer co2Level;

    @Column(name = "light_level")
    private Integer lightLevel;

    @Column(name = "sound_db")
    private Double soundDb;

    @Column(name = "fan_state")
    private Boolean fanState;

    @Column(name = "mist_state")
    private Boolean mistState;

    @Column(name = "heater_state")
    private Boolean heaterState;

    @Column(name = "alarm_state")
    private Boolean alarmState;

    public SensorTelemetryId getId() {
        return id;
    }

    public void setId(SensorTelemetryId id) {
        this.id = id;
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

    public Integer getCo2Level() {
        return co2Level;
    }

    public void setCo2Level(Integer co2Level) {
        this.co2Level = co2Level;
    }

    public Integer getLightLevel() {
        return lightLevel;
    }

    public void setLightLevel(Integer lightLevel) {
        this.lightLevel = lightLevel;
    }

    public Double getSoundDb() {
        return soundDb;
    }

    public void setSoundDb(Double soundDb) {
        this.soundDb = soundDb;
    }

    public Boolean getFanState() {
        return fanState;
    }

    public void setFanState(Boolean fanState) {
        this.fanState = fanState;
    }

    public Boolean getMistState() {
        return mistState;
    }

    public void setMistState(Boolean mistState) {
        this.mistState = mistState;
    }

    public Boolean getHeaterState() {
        return heaterState;
    }

    public void setHeaterState(Boolean heaterState) {
        this.heaterState = heaterState;
    }

    public Boolean getAlarmState() {
        return alarmState;
    }

    public void setAlarmState(Boolean alarmState) {
        this.alarmState = alarmState;
    }
}
