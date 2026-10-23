#pragma once

#include <Arduino.h>

#define WIFI_SSID               "Wokwi-GUEST"
#define WIFI_PASSWORD           ""

#define MQTT_BROKER_HOST        "broker.emqx.io"
#define MQTT_BROKER_PORT        1883
#define MQTT_CLIENT_ID          "ESP32_MAIN_01"
#define MQTT_USER               ""
#define MQTT_PASSWORD           ""

#define DEVICE_ID               "ESP32_MAIN_01"
#define FARM_ID                 1L
#define ZONE_ID                 1L

#define PIN_SHT_SDA             21
#define PIN_SHT_SCL             22
#define PIN_LDR_ANALOG          34
#define PIN_MQ135_ANALOG        35
#define PIN_SOUND_ANALOG        36

#define PIN_RELAY_MIST          25
#define PIN_RELAY_FAN           26
#define PIN_RELAY_HEAT          27
#define PIN_STATUS_LED          14

#define RELAY_ACTIVE_LEVEL      LOW
#define RELAY_INACTIVE_LEVEL    HIGH

#define TOPIC_TELEMETRY         "swiftlet/telemetry/1/1/ESP32_MAIN_01"
#define TOPIC_COMMAND           "swiftlet/command/ESP32_MAIN_01"
#define TOPIC_COMMAND_ALL       "swiftlet/command/all"
#define TOPIC_RESPONSE          "swiftlet/response/ESP32_MAIN_01"
#define TOPIC_ALERT             "swiftlet/alert/ESP32_MAIN_01"
#define TOPIC_STATUS            "swiftlet/status/ESP32_MAIN_01"

#define TELEMETRY_INTERVAL_MS   2000
#define SOUND_SAMPLE_WINDOW_MS  200
#define RELAY_MIN_SWITCH_MS     4000
#define SPEAKER_CHECK_TIMEOUT_MS 15000
#define WATCHDOG_TIMEOUT_SEC    15
