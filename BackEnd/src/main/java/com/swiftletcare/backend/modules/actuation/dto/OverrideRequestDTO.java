package com.swiftletcare.backend.modules.actuation.dto;

public class OverrideRequestDTO {
    private Long farmId;
    private Long zoneId;
    private String deviceType; // fan, mist, heat, alarm...
    private boolean state; // on/off

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

    public String getDeviceType() {
        return deviceType;
    }

    public void setDeviceType(String deviceType) {
        this.deviceType = deviceType;
    }

    public boolean getState() {
        return state;
    }

    public void setState(boolean state) {
        this.state = state;
    }

}
