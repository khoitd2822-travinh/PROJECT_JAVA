#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "Adafruit_SHT31.h"
#include <esp_task_wdt.h>

#include "config.h"
#include "thresholds.h"

WiFiClient espClient;
PubSubClient mqttClient(espClient);
Adafruit_SHT31 sht31 = Adafruit_SHT31();

ClimateThresholds thresholds;

enum RelayMode { MODE_AUTO, MODE_MANUAL };

struct RelayChannel {
    uint8_t pin;
    uint8_t state;
    RelayMode mode;
    unsigned long last_switch_ms;
    const char* name;
};

RelayChannel relayMist = { PIN_RELAY_MIST, 0, MODE_AUTO, 0, "mist" };
RelayChannel relayFan  = { PIN_RELAY_FAN,  0, MODE_AUTO, 0, "fan" };
RelayChannel relayHeat = { PIN_RELAY_HEAT, 0, MODE_AUTO, 0, "heat" };
uint8_t alarmState = 0;

struct SensorData {
    float temperature = 28.0f;
    float humidity = 78.0f;
    int co2 = 450;
    int light = 15;
    float sound_db = 65.0f;
    bool sht31_connected = false;
} sensorData;

unsigned long speaker_silent_start_ms = 0;
bool speaker_alert_active = false;

unsigned long last_telemetry_ms = 0;
unsigned long last_sensor_read_ms = 0;
unsigned long last_reconnect_attempt = 0;
unsigned long reconnect_interval = 2000;
bool is_offline_mode = false;

void applyRelayState(RelayChannel &ch, uint8_t newState, bool force = false) {
    unsigned long now = millis();
    if (!force && (now - ch.last_switch_ms < RELAY_MIN_SWITCH_MS)) {
        return;
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

void readSensors() {
    if (sensorData.sht31_connected) {
        float t = sht31.readTemperature();
        float h = sht31.readHumidity();
        if (!isnan(t) && !isnan(h)) {
            sensorData.temperature = t;
            sensorData.humidity = h;
        }
    } else {
        int potValue = analogRead(PIN_MQ135_ANALOG);
        sensorData.temperature = 25.0f + ((float)potValue / 4095.0f) * 12.0f;
        sensorData.humidity = 60.0f + (1.0f - ((float)potValue / 4095.0f)) * 30.0f;
    }

    int ldrRaw = analogRead(PIN_LDR_ANALOG);
    sensorData.light = map(ldrRaw, 0, 4095, 0, 100);

    int mq135Raw = analogRead(PIN_MQ135_ANALOG);
    sensorData.co2 = 400 + (int)(((float)mq135Raw / 4095.0f) * 1200.0f);

    unsigned long startSample = millis();
    uint16_t signalMax = 0;
    uint16_t signalMin = 4095;

    while (millis() - startSample < 100) {
        uint16_t sample = analogRead(PIN_SOUND_ANALOG);
        if (sample > signalMax) signalMax = sample;
        if (sample < signalMin) signalMin = sample;
    }
    uint16_t peakToPeak = signalMax - signalMin;
    sensorData.sound_db = 40.0f + 20.0f * log10((peakToPeak > 10 ? peakToPeak : 10) / 10.0f);
    if (sensorData.sound_db > 95.0f) sensorData.sound_db = 95.0f;

    if (thresholds.speaker_monitor_enabled) {
        if (sensorData.sound_db < thresholds.sound_min_db) {
            if (speaker_silent_start_ms == 0) {
                speaker_silent_start_ms = millis();
            } else if (millis() - speaker_silent_start_ms > SPEAKER_CHECK_TIMEOUT_MS) {
                if (!speaker_alert_active) {
                    speaker_alert_active = true;
                    if (mqttClient.connected()) {
                        StaticJsonDocument<256> alertDoc;
                        alertDoc["deviceId"] = DEVICE_ID;
                        alertDoc["type"] = "SPEAKER_ANOMALY";
                        alertDoc["severity"] = "WARNING";
                        alertDoc["message"] = "Loa dan du mat tin hieu";
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

void processMicroclimateControl() {
    if (relayMist.mode == MODE_AUTO) {
        if (sensorData.humidity < thresholds.hum_min) {
            applyRelayState(relayMist, 1);
        } else if (sensorData.humidity >= thresholds.hum_target) {
            applyRelayState(relayMist, 0);
        }
    }

    if (relayFan.mode == MODE_AUTO) {
        if (sensorData.temperature > thresholds.temp_max || sensorData.co2 > thresholds.co2_max) {
            applyRelayState(relayFan, 1);
        } else if (sensorData.temperature <= thresholds.temp_target && sensorData.co2 <= thresholds.co2_target) {
            applyRelayState(relayFan, 0);
        }
    }

    if (relayHeat.mode == MODE_AUTO) {
        if (sensorData.temperature < thresholds.temp_min) {
            applyRelayState(relayHeat, 1);
        } else if (sensorData.temperature >= thresholds.temp_heat_off) {
            applyRelayState(relayHeat, 0);
        }
    }
}

void publishTelemetry() {
    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["farmId"] = FARM_ID;
    doc["zoneId"] = ZONE_ID;

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
    serializeJson(doc, buffer);

    if (mqttClient.connected()) {
        mqttClient.publish(TOPIC_TELEMETRY, buffer);
    }
}

void handleIncomingCommand(char* topic, byte* payload, unsigned int length) {
    unsigned long startTime = millis();
    char message[512];
    if (length >= sizeof(message)) length = sizeof(message) - 1;
    memcpy(message, payload, length);
    message[length] = '\0';

    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
        return;
    }

    const char* command = doc["command"] | "";
    StaticJsonDocument<256> respDoc;
    respDoc["deviceId"] = DEVICE_ID;
    respDoc["command"] = command;

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
    } else if (strcmp(command, "SET_THRESHOLDS") == 0) {
        if (doc.containsKey("temp_max")) thresholds.temp_max = doc["temp_max"];
        if (doc.containsKey("temp_min")) thresholds.temp_min = doc["temp_min"];
        if (doc.containsKey("hum_min"))  thresholds.hum_min  = doc["hum_min"];
        if (doc.containsKey("co2_max"))  thresholds.co2_max  = doc["co2_max"];

        respDoc["status"] = "SUCCESS";
    } else if (strcmp(command, "GET_STATUS") == 0) {
        publishTelemetry();
        respDoc["status"] = "SUCCESS";
    } else {
        respDoc["status"] = "UNKNOWN_COMMAND";
    }

    respDoc["executionTimeMs"] = millis() - startTime;
    respDoc["timestamp"] = millis() / 1000;

    char respBuf[256];
    serializeJson(respDoc, respBuf);
    mqttClient.publish(TOPIC_RESPONSE, respBuf);
}

void reconnectMQTT() {
    unsigned long now = millis();
    if (now - last_reconnect_attempt < reconnect_interval) {
        return;
    }
    last_reconnect_attempt = now;

    if (WiFi.status() != WL_CONNECTED) {
        WiFi.reconnect();
        is_offline_mode = true;
        return;
    }

    const char* lwtTopic = TOPIC_STATUS;
    const char* lwtMessage = "{\"deviceId\":\"" DEVICE_ID "\",\"status\":\"OFFLINE\"}";

    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASSWORD, lwtTopic, 1, true, lwtMessage)) {
        is_offline_mode = false;
        reconnect_interval = 2000;

        // Chi subscribe topic RIENG cua thiet bi nay.
        // KHONG subscribe "command/all" (broadcast) o day:
        //   - tren broker cong khai, bat ky ai cung dieu khien duoc relay
        //   - khi nhieu ESP32 deu subscribe "all", lenh cho 1 thiet bi se
        //     lam tat ca cung dong - hong "khong anh huong thiet bi khac"
        mqttClient.subscribe(TOPIC_COMMAND);

        StaticJsonDocument<256> onlineDoc;
        onlineDoc["deviceId"] = DEVICE_ID;
        onlineDoc["status"] = "ONLINE";
        onlineDoc["ip"] = WiFi.localIP().toString();
        char onlineBuf[256];
        serializeJson(onlineDoc, onlineBuf);
        mqttClient.publish(TOPIC_STATUS, onlineBuf, true);

        digitalWrite(PIN_STATUS_LED, HIGH);
    } else {
        is_offline_mode = true;
        if (reconnect_interval < 30000) reconnect_interval *= 2;
    }
}

void setup() {
    Serial.begin(115200);

    pinMode(PIN_RELAY_MIST, OUTPUT);
    pinMode(PIN_RELAY_FAN, OUTPUT);
    pinMode(PIN_RELAY_HEAT, OUTPUT);
    pinMode(PIN_STATUS_LED, OUTPUT);

    applyRelayState(relayMist, 0, true);
    applyRelayState(relayFan,  0, true);
    applyRelayState(relayHeat, 0, true);
    digitalWrite(PIN_STATUS_LED, LOW);

    pinMode(PIN_LDR_ANALOG, INPUT);
    pinMode(PIN_MQ135_ANALOG, INPUT);
    pinMode(PIN_SOUND_ANALOG, INPUT);

    Wire.begin(PIN_SHT_SDA, PIN_SHT_SCL);
    if (sht31.begin(0x44)) {
        sensorData.sht31_connected = true;
    }

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
    mqttClient.setCallback(handleIncomingCommand);
    mqttClient.setBufferSize(512);

    esp_task_wdt_init(WATCHDOG_TIMEOUT_SEC, true);
    esp_task_wdt_add(NULL);
}

void loop() {
    esp_task_wdt_reset();

    if (!mqttClient.connected()) {
        reconnectMQTT();
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

    unsigned long now = millis();
    if (now - last_sensor_read_ms >= 500) {
        last_sensor_read_ms = now;
        readSensors();
        processMicroclimateControl();
    }

    if (now - last_telemetry_ms >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_ms = now;
        publishTelemetry();
    }
}
