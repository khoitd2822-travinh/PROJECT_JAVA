package com.swiftletcare.backend.modules.actuation.dto;

import java.util.Locale;

public enum DeviceTarget {
    FAN("fan"),
    FAN_SMOKE("fan_smoke"),
    MIST("mist"),
    HEAT("heat"),
    ALARM("alarm");

    private final String mqttTarget;
    DeviceTarget(String mqttTarget) {
        this.mqttTarget = mqttTarget;
    }

    public String getMqttTarget() {
        return mqttTarget;
    }

    public static DeviceTarget fromDeviceType(String deviceType) {
        if (deviceType == null || deviceType.isBlank()) {
            throw new IllegalArgumentException("Thiết bị chưa được cấu hình deviceType");
        }

        return switch (deviceType.trim().toUpperCase(Locale.ROOT)) {
            case "FAN", "FAN1" -> FAN;
            case "FAN_SMOKE", "FAN2", "SMOKE_FAN" -> FAN_SMOKE;
            case "MIST", "HUMIDIFIER" -> MIST;
            case "HEAT", "HEATER" -> HEAT;
            case "ALARM", "BUZZER" -> ALARM;
            default -> throw new IllegalArgumentException("Loại thiết bị chưa được hỗ trợ: " + deviceType);
        };
    }
}
