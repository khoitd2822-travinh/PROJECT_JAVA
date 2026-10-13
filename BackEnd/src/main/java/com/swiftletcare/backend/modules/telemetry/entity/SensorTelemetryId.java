package com.swiftletcare.backend.modules.telemetry.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

@Embeddable
public class SensorTelemetryId implements Serializable {
    @Column(name = "time", nullable = false)
    private Instant time;

    @Column(name = "device_id", nullable = false)
    private String deviceId;

    public SensorTelemetryId(){

    }
    public SensorTelemetryId(Instant time, String deviceId){
        this.time = time;
        this.deviceId = deviceId;
    }

    public Instant getTime() {
        return time;
    }

    public void setTime(Instant time) {
        this.time = time;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SensorTelemetryId that = (SensorTelemetryId) o;
        return Objects.equals(time, that.time) && Objects.equals(deviceId, that.deviceId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(time, deviceId);
    }
}
