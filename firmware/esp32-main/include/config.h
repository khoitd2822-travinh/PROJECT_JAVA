#pragma once
#include <Arduino.h>

// Cau hinh Wi-Fi / LAN cho may dang build duoc tu dong sinh vao file local bi git-ignore:
//   firmware/esp32-main/include/config.local.h
// (sinh boi `pio run` pre-build hook hoac `python firmware/scripts/setup_local_config.py`).
// Gia tri ben duoi chi la fallback an toan cho Wokwi / CI, khong chua mat khau that.
#if defined(__has_include)
#if __has_include("config.local.h")
#include "config.local.h"
#endif
#endif

#ifndef WIFI_SSID
#define WIFI_SSID "Wokwi-GUEST"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

#ifndef MQTT_HOST
#define MQTT_HOST "localhost"
#endif

#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif

constexpr char BOARD_ID[] = "ESP32_ZONE_1";

constexpr char TELEMETRY_TOPIC[] = "swiftlet/telemetry/1/1";
constexpr char COMMAND_TOPIC[] = "swiftlet/command/1/1";
constexpr char ACK_TOPIC[] = "swiftlet/ack/1/1";
constexpr char HEARTBEAT_TOPIC[] = "swiftlet/heartbeat/1/1";
constexpr char STATUS_TOPIC[] = "swiftlet/status/1/1";

// Tạm chỉ dùng Wi-Fi router.
// Bật lại AP riêng khi cần; không coi việc tắt AP là sửa lỗi nguồn.
constexpr bool ENABLE_LOCAL_AP = true;
#ifndef AP_SSID
#define AP_SSID "SwiftletCare-Zone1"
#endif
#ifndef AP_PASSWORD
#define AP_PASSWORD "swiftlet1234"
#endif

#ifndef WEB_USER
#define WEB_USER "admin"
#endif
#ifndef WEB_PASSWORD
#define WEB_PASSWORD "swiftlet1234"
#endif

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