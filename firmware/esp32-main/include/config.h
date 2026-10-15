#pragma once

#include <Arduino.h>

// ==========================================
// 1. Cấu hình Kết nối Mạng Wi-Fi & MQTT
// ==========================================
#define WIFI_SSID               "Wokwi-GUEST"          // Tương thích Wokwi & AP thực tế
#define WIFI_PASSWORD           ""                     // Mật khẩu Wi-Fi

#define MQTT_BROKER_HOST        "broker.emqx.io"       // EMQX Public hoặc IP máy trạm "192.168.1.100" / "10.0.2.2"
#define MQTT_BROKER_PORT        1883
#define MQTT_CLIENT_ID          "ESP32_MAIN_01_SWIFTLET"
#define MQTT_USER               ""                     // Để trống nếu không dùng auth
#define MQTT_PASSWORD           ""

// Định danh Nhà Yến
#define DEVICE_ID               "ESP32_MAIN_01"
#define FARM_ID                 1L
#define ZONE_ID                 1L

// ==========================================
// 2. Định nghĩa Chân Phần Cứng (Hardware Pins)
// Khớp 100% với Bảng STT 1-8 trong PLAN.docx
// ==========================================
#define PIN_SHT_SDA             21      // SHT30/SHT31 I2C SDA
#define PIN_SHT_SCL             22      // SHT30/SHT31 I2C SCL
#define PIN_LDR_ANALOG          34      // Cảm biến Ánh sáng LDR (ADC1_CH6)
#define PIN_MQ135_ANALOG        35      // Cảm biến Khí / CO2 MQ-135 (ADC1_CH7)
#define PIN_SOUND_ANALOG        36      // Cảm biến Âm thanh Microphone (VP - ADC1_CH0)

#define PIN_RELAY_MIST          25      // Relay 1: Máy phun sương tạo ẩm (GPIO 25)
#define PIN_RELAY_FAN           26      // Relay 2: Quạt hút thông gió (GPIO 26)
#define PIN_RELAY_HEAT          27      // Relay 3: Thiết bị sưởi ấm / Đèn (GPIO 27)
#define PIN_STATUS_LED          14      // Đèn LED trạng thái / Còi Buzzer (GPIO 14)

// Cấu hình Relay: Mức LOW kích đóng tiếp điểm (Active LOW) đối với module opto 4 kênh
#define RELAY_ACTIVE_LEVEL      LOW
#define RELAY_INACTIVE_LEVEL    HIGH

// ==========================================
// 3. MQTT Topics Chuẩn Hóa
// ==========================================
#define TOPIC_TELEMETRY         "swiftlet/telemetry/1/1/ESP32_MAIN_01"
#define TOPIC_COMMAND           "swiftlet/command/ESP32_MAIN_01"
#define TOPIC_COMMAND_ALL       "swiftlet/command/all"
#define TOPIC_RESPONSE          "swiftlet/response/ESP32_MAIN_01"
#define TOPIC_ALERT             "swiftlet/alert/ESP32_MAIN_01"
#define TOPIC_STATUS            "swiftlet/status/ESP32_MAIN_01"

// ==========================================
// 4. Chu kỳ & Thời gian (Timing Constants)
// ==========================================
#define TELEMETRY_INTERVAL_MS   2000    // Đọc và gửi dữ liệu định kỳ mỗi 2 giây
#define SOUND_SAMPLE_WINDOW_MS  200     // Cửa sổ lấy mẫu âm thanh microphone (ms)
#define RELAY_MIN_SWITCH_MS     4000    // Chống đóng ngắt liên tục (Hysteresis Deadband)
#define SPEAKER_CHECK_TIMEOUT_MS 15000  // 15 giây không có âm thanh loa -> Cảnh báo
#define WATCHDOG_TIMEOUT_SEC    15      // Watchdog Timer tự reset khi treo 15s
