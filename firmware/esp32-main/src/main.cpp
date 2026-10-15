/**
 * SwiftletCare - ESP32 Main Firmware
 * Vi điều khiển Giám sát Cảm biến & Tự động Hóa Vi khí hậu Nhà Yến
 * Khớp chuẩn toàn diện nhiệm vụ Thành viên 2 (Thanh Liêm) - Kế hoạch 7 Tuần
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "Adafruit_SHT31.h"
#include <esp_task_wdt.h>

#include "config.h"
#include "thresholds.h"

// ==========================================
// Khởi tạo Biến & Đối tượng Hệ thống
// ==========================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Adafruit_SHT31 sht31 = Adafruit_SHT31();

ClimateThresholds thresholds;

// Trạng thái Rơ-le
enum RelayMode { MODE_AUTO, MODE_MANUAL };

struct RelayChannel {
    uint8_t pin;
    uint8_t state;          // 0: OFF, 1: ON
    RelayMode mode;
    unsigned long last_switch_ms;
    const char* name;
};

RelayChannel relayMist = { PIN_RELAY_MIST, 0, MODE_AUTO, 0, "mist" };
RelayChannel relayFan  = { PIN_RELAY_FAN,  0, MODE_AUTO, 0, "fan" };
RelayChannel relayHeat = { PIN_RELAY_HEAT, 0, MODE_AUTO, 0, "heat" };
uint8_t alarmState = 0;

// Dữ liệu Cảm biến Thời gian Thực
struct SensorData {
    float temperature = 28.0f;
    float humidity = 78.0f;
    int co2 = 450;
    int light = 15;
    float sound_db = 65.0f;
    bool sht31_connected = false;
} sensorData;

// Trạng thái Loa Dẫn Dụ & Cảnh báo
unsigned long speaker_silent_start_ms = 0;
bool speaker_alert_active = false;

// Trạng thái Mạng & Timers
unsigned long last_telemetry_ms = 0;
unsigned long last_sensor_read_ms = 0;
unsigned long last_reconnect_attempt = 0;
unsigned long reconnect_interval = 2000; // Exponential backoff (2s -> 30s)
bool is_offline_mode = false;

// ==========================================
// Hàm Tiện ích Điều khiển Rơ-le
// ==========================================
void applyRelayState(RelayChannel &ch, uint8_t newState, bool force = false) {
    unsigned long now = millis();
    if (!force && (now - ch.last_switch_ms < RELAY_MIN_SWITCH_MS)) {
        return; // Hysteresis: Tránh đóng ngắt liên tục hại tiếp điểm relay
    }

    if (force || ch.state != newState) {
        ch.state = newState;
        ch.last_switch_ms = now;
        digitalWrite(ch.pin, (newState == 1) ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
        Serial.printf("[RELAY] %s -> %s (Mode: %s)\n", ch.name, 
                      (newState == 1) ? "ON" : "OFF", 
                      (ch.mode == MODE_AUTO) ? "AUTO" : "MANUAL");
    }
}

void setAlarmState(uint8_t state) {
    alarmState = state;
    digitalWrite(PIN_STATUS_LED, (state == 1) ? HIGH : LOW);
}

// ==========================================
// 1. Đọc Cảm biến & Tính toán Thông số (Week 1, 2, 4)
// ==========================================
void readSensors() {
    // 1. Cảm biến SHT30/SHT31 (Nhiệt độ & Độ ẩm) qua I2C
    if (sensorData.sht31_connected) {
        float t = sht31.readTemperature();
        float h = sht31.readHumidity();
        if (!isnan(t) && !isnan(h)) {
            sensorData.temperature = t;
            sensorData.humidity = h;
        }
    } else {
        // Fallback mô phỏng Wokwi / Chiết áp
        int potValue = analogRead(PIN_MQ135_ANALOG);
        sensorData.temperature = 25.0f + ((float)potValue / 4095.0f) * 12.0f; // 25°C - 37°C
        sensorData.humidity = 60.0f + (1.0f - ((float)potValue / 4095.0f)) * 30.0f; // 60% - 90%
    }

    // 2. Cảm biến Ánh sáng LDR (GPIO 34 - Analog 0..4095)
    int ldrRaw = analogRead(PIN_LDR_ANALOG);
    // Ánh sáng nhà yến cần tối (< 50 lux). Quy đổi tuyến tính ước lượng:
    sensorData.light = map(ldrRaw, 0, 4095, 0, 100);

    // 3. Cảm biến Khí / CO2 MQ-135 (GPIO 35)
    int mq135Raw = analogRead(PIN_MQ135_ANALOG);
    // Quy đổi nồng độ CO2 ước lượng từ 350 ppm (không khí sạch) đến 2000 ppm
    sensorData.co2 = 400 + (int)(((float)mq135Raw / 4095.0f) * 1200.0f);

    // 4. Cảm biến Âm thanh Loa Dẫn Dụ (GPIO 36 - Microphone Analog)
    // Lấy mẫu đo đỉnh biên độ sóng âm (Peak-to-Peak) trong cửa sổ 100ms
    unsigned long startSample = millis();
    uint16_t signalMax = 0;
    uint16_t signalMin = 4095;

    while (millis() - startSample < 100) {
        uint16_t sample = analogRead(PIN_SOUND_ANALOG);
        if (sample > signalMax) signalMax = sample;
        if (sample < signalMin) signalMin = sample;
    }
    uint16_t peakToPeak = signalMax - signalMin;
    // Chuyển đổi sang thang decibel (dB SPL ước tính)
    sensorData.sound_db = 40.0f + 20.0f * log10((peakToPeak > 10 ? peakToPeak : 10) / 10.0f);
    if (sensorData.sound_db > 95.0f) sensorData.sound_db = 95.0f;

    // Kiểm tra tính năng giám sát loa dẫn dụ (Task Tuần 4)
    if (thresholds.speaker_monitor_enabled) {
        if (sensorData.sound_db < thresholds.sound_min_db) {
            if (speaker_silent_start_ms == 0) {
                speaker_silent_start_ms = millis();
            } else if (millis() - speaker_silent_start_ms > SPEAKER_CHECK_TIMEOUT_MS) {
                if (!speaker_alert_active) {
                    speaker_alert_active = true;
                    Serial.println(F("[ALERT] Cảnh báo: Loa dẫn dụ mất tín hiệu / bị tắt!"));
                    // Gửi cảnh báo ngay lập tức lên MQTT
                    if (mqttClient.connected()) {
                        StaticJsonDocument<256> alertDoc;
                        alertDoc["deviceId"] = DEVICE_ID;
                        alertDoc["type"] = "SPEAKER_ANOMALY";
                        alertDoc["severity"] = "WARNING";
                        alertDoc["message"] = "Loa dẫn dụ không phát âm thanh trong hơn 15 giây!";
                        alertDoc["soundDb"] = sensorData.sound_db;
                        alertDoc["timestamp"] = millis() / 1000;
                        char alertBuf[256];
                        serializeJson(alertDoc, alertBuf);
                        mqttClient.publish(TOPIC_ALERT, alertBuf);
                    }
                }
            }
        } else {
            speaker_silent_start_ms = 0;
            speaker_alert_active = false;
        }
    }
}

// ==========================================
// 2. Thuật toán Điều khiển Tự động Cục bộ (Offline Resiliency - Weeks 3, 5, 6)
// ==========================================
void processMicroclimateControl() {
    // 1. Điều khiển Máy Phun Sương (Relay 1 - GPIO 25)
    // Kích hoạt khi độ ẩm < 75% (Theo STT 5 trong PLAN)
    if (relayMist.mode == MODE_AUTO) {
        if (sensorData.humidity < thresholds.hum_min) {
            applyRelayState(relayMist, 1);
        } else if (sensorData.humidity >= thresholds.hum_target) {
            applyRelayState(relayMist, 0);
        }
    }

    // 2. Điều khiển Quạt Hút Thông Gió (Relay 2 - GPIO 26)
    // Kích hoạt khi nhiệt độ > 31°C hoặc CO2 tăng cao (Theo STT 6 trong PLAN)
    if (relayFan.mode == MODE_AUTO) {
        if (sensorData.temperature > thresholds.temp_max || sensorData.co2 > thresholds.co2_max) {
            applyRelayState(relayFan, 1);
        } else if (sensorData.temperature <= thresholds.temp_target && sensorData.co2 <= thresholds.co2_target) {
            applyRelayState(relayFan, 0);
        }
    }

    // 3. Điều khiển Thiết Bị Sưởi / Đèn Vàng (Relay 3 - GPIO 27)
    // Kích hoạt khi nhiệt độ phòng tụt quá thấp vào ban đêm (Theo STT 7 trong PLAN)
    if (relayHeat.mode == MODE_AUTO) {
        if (sensorData.temperature < thresholds.temp_min) {
            applyRelayState(relayHeat, 1);
        } else if (sensorData.temperature >= thresholds.temp_heat_off) {
            applyRelayState(relayHeat, 0);
        }
    }
}

// ==========================================
// 3. Đóng gói & Gửi Telemetry (Khớp 100% TelemetryPayloadDTO - Week 3)
// ==========================================
void publishTelemetry() {
    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["farmId"] = FARM_ID;
    doc["zoneId"] = ZONE_ID;

    // Làm tròn 1 chữ số thập phân
    doc["temp"] = round(sensorData.temperature * 10.0f) / 10.0f;
    doc["hum"] = round(sensorData.humidity * 10.0f) / 10.0f;
    doc["co2"] = sensorData.co2;
    doc["light"] = sensorData.light;
    doc["sound"] = round(sensorData.sound_db * 10.0f) / 10.0f;

    JsonObject relays = doc.createNestedObject("relays");
    relays["mist"] = relayMist.state;
    relays["fan"] = relayFan.state;
    relays["heat"] = relayHeat.state;
    relays["alarm"] = alarmState;

    char buffer[384];
    size_t len = serializeJson(doc, buffer);

    if (mqttClient.connected()) {
        bool success = mqttClient.publish(TOPIC_TELEMETRY, buffer);
        if (success) {
            Serial.printf("[MQTT TELEMETRY] Đã gửi -> Temp: %.1f°C | Hum: %.1f%% | CO2: %d ppm | Relays: [M:%d F:%d H:%d]\n",
                          sensorData.temperature, sensorData.humidity, sensorData.co2,
                          relayMist.state, relayFan.state, relayHeat.state);
        } else {
            Serial.println(F("[MQTT] Gửi Telemetry thất bại! Bộ đệm tràn."));
        }
    }
}

// ==========================================
// 4. Nhận & Xử lý Lệnh Điều khiển (Command Handler & ACK - Week 4)
// ==========================================
void handleIncomingCommand(char* topic, byte* payload, unsigned int length) {
    unsigned long startTime = millis();
    char message[512];
    if (length >= sizeof(message)) length = sizeof(message) - 1;
    memcpy(message, payload, length);
    message[length] = '\0';

    Serial.printf("[MQTT COMMAND] Nhận được trên [%s]: %s\n", topic, message);

    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
        Serial.printf("[JSON] Lỗi parse lệnh: %s\n", error.c_str());
        return;
    }

    const char* command = doc["command"] | "";
    StaticJsonDocument<256> respDoc;
    respDoc["deviceId"] = DEVICE_ID;
    respDoc["command"] = command;

    // 1. Lệnh Điều khiển Rơ-le (Manual Override)
    if (strcmp(command, "RELAY_CONTROL") == 0) {
        const char* target = doc["target"] | "";
        int state = doc["state"] | 0;
        const char* modeStr = doc["mode"] | "MANUAL";
        RelayMode mode = (strcmp(modeStr, "AUTO") == 0) ? MODE_AUTO : MODE_MANUAL;

        if (strcmp(target, "mist") == 0) {
            relayMist.mode = mode;
            if (mode == MODE_MANUAL) applyRelayState(relayMist, state, true);
        } else if (strcmp(target, "fan") == 0) {
            relayFan.mode = mode;
            if (mode == MODE_MANUAL) applyRelayState(relayFan, state, true);
        } else if (strcmp(target, "heat") == 0) {
            relayHeat.mode = mode;
            if (mode == MODE_MANUAL) applyRelayState(relayHeat, state, true);
        } else if (strcmp(target, "alarm") == 0) {
            setAlarmState(state);
        } else if (strcmp(target, "all") == 0) {
            relayMist.mode = mode;
            relayFan.mode = mode;
            relayHeat.mode = mode;
            if (mode == MODE_MANUAL) {
                applyRelayState(relayMist, state, true);
                applyRelayState(relayFan, state, true);
                applyRelayState(relayHeat, state, true);
            }
        }

        respDoc["status"] = "SUCCESS";
        respDoc["target"] = target;
        respDoc["state"] = state;
        respDoc["mode"] = modeStr;
    }
    // 2. Lệnh Cập nhật Ngưỡng Vi khí hậu từ xa
    else if (strcmp(command, "SET_THRESHOLDS") == 0) {
        if (doc.containsKey("temp_max")) thresholds.temp_max = doc["temp_max"];
        if (doc.containsKey("temp_min")) thresholds.temp_min = doc["temp_min"];
        if (doc.containsKey("hum_min"))  thresholds.hum_min  = doc["hum_min"];
        if (doc.containsKey("co2_max"))  thresholds.co2_max  = doc["co2_max"];

        respDoc["status"] = "SUCCESS";
        respDoc["message"] = "Đã cập nhật ngưỡng vi khí hậu mới";
    }
    // 3. Lệnh Truy vấn Tức thời (Query/Ping)
    else if (strcmp(command, "GET_STATUS") == 0) {
        publishTelemetry();
        respDoc["status"] = "SUCCESS";
    } else {
        respDoc["status"] = "UNKNOWN_COMMAND";
    }

    // Phản hồi ACK với thời gian thực thi (Latency RTT)
    respDoc["executionTimeMs"] = millis() - startTime;
    respDoc["timestamp"] = millis() / 1000;

    char respBuf[256];
    serializeJson(respDoc, respBuf);
    mqttClient.publish(TOPIC_RESPONSE, respBuf);
    Serial.printf("[MQTT RESPONSE] Phản hồi ACK tới [%s]: %s\n", TOPIC_RESPONSE, respBuf);
}

// ==========================================
// 5. Quản lý Kết nối & Tự Động Phục Hồi (Non-blocking Resiliency - Week 5)
// ==========================================
void reconnectMQTT() {
    unsigned long now = millis();
    if (now - last_reconnect_attempt < reconnect_interval) {
        return; // Không block CPU trong khi chờ retry
    }
    last_reconnect_attempt = now;

    // Kiểm tra Wi-Fi trước
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("[WIFI] Đang kết nối lại Wi-Fi..."));
        WiFi.reconnect();
        is_offline_mode = true;
        return;
    }

    Serial.print(F("[MQTT] Đang thử kết nối EMQX Broker... "));
    
    // Đăng ký Di chúc LWT (Last Will and Testament)
    const char* lwtTopic = TOPIC_STATUS;
    const char* lwtMessage = "{\"deviceId\":\"" DEVICE_ID "\",\"status\":\"OFFLINE\"}";

    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASSWORD, lwtTopic, 1, true, lwtMessage)) {
        Serial.println(F("THÀNH CÔNG!"));
        is_offline_mode = false;
        reconnect_interval = 2000; // Reset backoff

        // Subscribe các topic điều khiển
        mqttClient.subscribe(TOPIC_COMMAND);
        mqttClient.subscribe(TOPIC_COMMAND_ALL);

        // Báo cáo Online
        StaticJsonDocument<256> onlineDoc;
        onlineDoc["deviceId"] = DEVICE_ID;
        onlineDoc["status"] = "ONLINE";
        onlineDoc["ip"] = WiFi.localIP().toString();
        onlineDoc["firmware"] = "1.0.0-TV2";
        char onlineBuf[256];
        serializeJson(onlineDoc, onlineBuf);
        mqttClient.publish(TOPIC_STATUS, onlineBuf, true);

        // Đèn LED báo bình thường
        digitalWrite(PIN_STATUS_LED, HIGH);
    } else {
        Serial.printf("Thất bại! Mã lỗi: %d. Chuyển sang chế độ Offline Tự động.\n", mqttClient.state());
        is_offline_mode = true;
        // Tăng thời gian backoff tối đa 30s
        if (reconnect_interval < 30000) reconnect_interval *= 2;
    }
}

// ==========================================
// Setup & Loop
// ==========================================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println(F("\n========================================================"));
    Serial.println(F(" SwiftletCare ESP32 Main Firmware (TV2 - Thanh Liem)   "));
    Serial.println(F("========================================================"));

    // Khởi tạo các chân IO
    pinMode(PIN_RELAY_MIST, OUTPUT);
    pinMode(PIN_RELAY_FAN, OUTPUT);
    pinMode(PIN_RELAY_HEAT, OUTPUT);
    pinMode(PIN_STATUS_LED, OUTPUT);

    applyRelayState(relayMist, 0, true);
    applyRelayState(relayFan,  0, true);
    applyRelayState(relayHeat, 0, true);
    digitalWrite(PIN_STATUS_LED, LOW);

    // Cấu hình chân ADC
    pinMode(PIN_LDR_ANALOG, INPUT);
    pinMode(PIN_MQ135_ANALOG, INPUT);
    pinMode(PIN_SOUND_ANALOG, INPUT);

    // Khởi tạo I2C cho SHT31
    Wire.begin(PIN_SHT_SDA, PIN_SHT_SCL);
    if (sht31.begin(0x44)) {
        sensorData.sht31_connected = true;
        Serial.println(F("[I2C] Cảm biến SHT30/SHT31 nhận diện thành công tại 0x44!"));
    } else {
        Serial.println(F("[I2C] Không thấy SHT31 vật lý. Kích hoạt chế độ mô phỏng vi khí hậu."));
    }

    // Kết nối Wi-Fi ban đầu
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("[WIFI] Kết nối tới AP: %s\n", WIFI_SSID);

    // Cấu hình MQTT Client
    mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
    mqttClient.setCallback(handleIncomingCommand);
    mqttClient.setBufferSize(512);

    // Khởi tạo Watchdog Timer (15 giây)
    esp_task_wdt_init(WATCHDOG_TIMEOUT_SEC, true);
    esp_task_wdt_add(NULL);
    Serial.println(F("[WDT] Hardware Watchdog Timer đã kích hoạt (15s)."));
}

void loop() {
    // 1. Reset Watchdog Timer đảm bảo hệ thống không bị treo
    esp_task_wdt_reset();

    // 2. Xử lý Kết nối Mạng & Nhận Thông điệp MQTT
    if (!mqttClient.connected()) {
        reconnectMQTT();
        // Nháy LED trạng thái báo hiệu chế độ Offline / Reconnecting
        if (is_offline_mode) {
            static unsigned long lastBlink = 0;
            if (millis() - lastBlink > 1000) {
                lastBlink = millis();
                digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
            }
        }
    } else {
        mqttClient.loop();
    }

    // 3. Đọc Cảm biến & Thực thi Điều khiển Vi khí hậu (Mỗi 500ms)
    unsigned long now = millis();
    if (now - last_sensor_read_ms >= 500) {
        last_sensor_read_ms = now;
        readSensors();
        processMicroclimateControl(); // Tự động đóng ngắt Relay chuẩn vi khí hậu
    }

    // 4. Đóng gói & Publish Telemetry (Mỗi 2 giây theo yêu cầu kỹ thuật)
    if (now - last_telemetry_ms >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_ms = now;
        publishTelemetry();
    }
}
