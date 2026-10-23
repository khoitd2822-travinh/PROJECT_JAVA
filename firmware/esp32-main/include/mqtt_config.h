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
#define MQTT_BROKER_HOST "192.168.1.100"   // <-- sua lai IP may chay docker
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

// ---- Topic base: swiftlet/<tenant>/<farm>/<zone>/<device> ----
#define TOPIC_PREFIX "swiftlet/" MQTT_TENANT "/" "1/" "1/" DEVICE_ID

#define TOPIC_TELEMETRY TOPIC_PREFIX "/telemetry"
#define TOPIC_COMMAND   TOPIC_PREFIX "/command"
#define TOPIC_RESPONSE  TOPIC_PREFIX "/response"
#define TOPIC_ALERT     TOPIC_PREFIX "/alert"
#define TOPIC_STATUS    TOPIC_PREFIX "/status"

// Topic rieng cho tung thiet bi (KHONG dung broadcast)
#define TOPIC_TELEMETRY_FARM "swiftlet/" MQTT_TENANT "/1/1/+"
#define TOPIC_COMMAND_FARM   "swiftlet/" MQTT_TENANT "/+/+/command"

// ---- Client ID (phai duy nhat de broker khong kick nhau) ----
#define MQTT_CLIENT_ID MQTT_TENANT "_" DEVICE_ID

// ---- Wi-Fi ----
#ifndef WIFI_SSID
#define WIFI_SSID "Wokwi-GUEST"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

#define MQTT_USER     ""
#define MQTT_PASSWORD ""