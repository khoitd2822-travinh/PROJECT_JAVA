#pragma once

// ============================================================
// SwiftletCare - MQTT Config (DUNG CHUNG cho toan he thong)
// File nay la NGUON SU DOI TRONG - ca firmware ESP32 va backend
// deu phai doc tu day de tranh "lech chuan" giua cac thiet bi.
//
// NGUYEN TAC AN TOAN:
//   1. Dung BROKER rieng cho nhom (mac dinh: EMQX local qua docker).
//      -> khong dung broker cong khai, tranh nguoi ngoai dieu khien relay.
//   2. Moi topic co namespace "swiftlet/<team>/..." de KHONG trung
//      voi cac nhanh khac trong cung repo.
//   3. KHONG subscribe topic broadcast "command/all" o che do AUTO.
// ============================================================

// ---- Broker ----
// "local"  = may tinh co chay docker-compose (khuyen nghi khi test)
// "public" = broker.emqx.io - CHI dung khi can test nhanh, KHONG dung
//            voi phan dieu khien relay that
#define MQTT_BROKER_MODE_LOCAL   1
#define MQTT_BROKER_MODE_PUBLIC  2

#ifndef MQTT_BROKER_MODE
#define MQTT_BROKER_MODE        MQTT_BROKER_MODE_LOCAL
#endif

#if MQTT_BROKER_MODE == MQTT_BROKER_MODE_LOCAL
// Host broker. KHONG hardcode trong git - IP may doi theo DHCP.
//
// Cach cung cap (theo thu tu uu tien):
//   1. File local bi git-ignore: firmware/esp32-main/include/mqtt_config.local.h
//   2. Bien dich voi build_flags:
//      pio run -e esp32dev --project-option="build_flags=-DMQTT_BROKER_HOST=\\\"<IP may chay docker>\\\""
//
// Mac dinh "localhost" de build/m-mo phong Wokwi khong bi loi compile.
// Thiet bi that phai dung IP LAN cua may chay docker-compose.
#ifndef MQTT_BROKER_HOST
#if defined(__has_include)
#if __has_include("mqtt_config.local.h")
#include "mqtt_config.local.h"
#endif
#endif
#endif

#ifndef MQTT_BROKER_HOST
#define MQTT_BROKER_HOST "localhost"
#endif
#define MQTT_BROKER_PORT 1883
#elif MQTT_BROKER_MODE == MQTT_BROKER_MODE_PUBLIC
#define MQTT_BROKER_HOST "broker.emqx.io"
#define MQTT_BROKER_PORT 1883
#endif

// ---- Tenant (nhanh rieng de khong dung nhom khac) ----
#ifndef MQTT_TENANT
#define MQTT_TENANT "thanhliem"
#endif

// ---- Device identity ----
#ifndef DEVICE_ID
#define DEVICE_ID "ESP32_MAIN_01"
#endif

#define FARM_ID 1L
#define ZONE_ID 1L

// ---- Topic base: swiftlet/<tenant>/<farm>/<zone>/<device>/<loai> ----
#define TOPIC_PREFIX "swiftlet/" MQTT_TENANT "/" "1/" "1/" DEVICE_ID

#define TOPIC_TELEMETRY TOPIC_PREFIX "/telemetry"
#define TOPIC_COMMAND   TOPIC_PREFIX "/command"
#define TOPIC_RESPONSE  TOPIC_PREFIX "/response"
#define TOPIC_ALERT     TOPIC_PREFIX "/alert"
#define TOPIC_STATUS    TOPIC_PREFIX "/status"

// Topic rieng cho tung thiet bi (KHONG dung broadcast)
// Luu y: 6 doan - swiftlet/<tenant>/<farm>/<zone>/<device>/<loai>
#define TOPIC_TELEMETRY_FARM "swiftlet/" MQTT_TENANT "/+/+/+/telemetry"
#define TOPIC_COMMAND_FARM   "swiftlet/" MQTT_TENANT "/+/+/+/command"

// ---- Client ID (phai duy nhat de broker khong kick nhau) ----
#define MQTT_CLIENT_ID MQTT_TENANT "_" DEVICE_ID

// ---- Wi-Fi ----
// ESP32 phai cung mang LAN voi may chay docker-compose.
//
// KHONG ghi mat khau thật vao file nay. Ghi de khi build:
//   pio run -e esp32dev --project-option="build_flags=-DWIFI_SSID=\\\"...\\\" -DWIFI_PASSWORD=\\\"...\\\""
#ifndef WIFI_SSID
#define WIFI_SSID "Wokwi-GUEST"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

#define MQTT_USER     ""
#define MQTT_PASSWORD ""