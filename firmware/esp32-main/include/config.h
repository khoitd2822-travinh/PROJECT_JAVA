#pragma once

#include <Arduino.h>
#include "mqtt_config.h"   // broker, topic, device id -> xem file nay de doi chung

// ---- GPIO theo extracted_plan.txt ----
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

#define TELEMETRY_INTERVAL_MS   2000
#define SOUND_SAMPLE_WINDOW_MS  200
#define RELAY_MIN_SWITCH_MS     4000
#define SPEAKER_CHECK_TIMEOUT_MS 15000
#define WATCHDOG_TIMEOUT_SEC    15