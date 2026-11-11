#pragma once
#include <Arduino.h>

// Tự điền, không commit mật khẩu thật.
constexpr char WIFI_SSID[] = "Haibon7979 T3";
constexpr char WIFI_PASSWORD[] = "79797979";

constexpr char MQTT_HOST[] = "192.168.103.51";
constexpr uint16_t MQTT_PORT = 1883;

constexpr char BOARD_ID[] = "ESP32_ZONE_1";

constexpr char TELEMETRY_TOPIC[] = "swiftlet/telemetry/1/1";
constexpr char COMMAND_TOPIC[] = "swiftlet/command/1/1";
constexpr char ACK_TOPIC[] = "swiftlet/ack/1/1";
constexpr char HEARTBEAT_TOPIC[] = "swiftlet/heartbeat/1/1";
constexpr char STATUS_TOPIC[] = "swiftlet/status/1/1";

// Tạm chỉ dùng Wi-Fi router.
// Bật lại AP riêng khi cần; không coi việc tắt AP là sửa lỗi nguồn.
constexpr bool ENABLE_LOCAL_AP = true;
constexpr char AP_SSID[] = "To yen vippro";
constexpr char AP_PASSWORD[] = "12345678";

constexpr char WEB_USER[] = "admin";
constexpr char WEB_PASSWORD[] = "876543210";

constexpr bool BOOT_AUTO = true;

constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;
constexpr uint8_t MQ135_PIN = 34;

// Thứ tự: fan, fan_smoke, mist, heat, alarm.
constexpr uint8_t OUTPUT_PINS[] = {26, 14, 27, 18, 19};

// Giữ HIGH=bật như bản bạn đã test.
// Nếu relay thực tế kích LOW phải sửa đúng từng phần tử.
constexpr uint8_t OUTPUT_ON_LEVELS[] = {
    HIGH, HIGH, HIGH, HIGH, HIGH
};

constexpr unsigned long SAMPLE_INTERVAL_MS = 2000;
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 5000;
constexpr unsigned long WIFI_RETRY_MS = 15000;
constexpr unsigned long MQTT_RETRY_MS = 5000;