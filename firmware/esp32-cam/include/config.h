#pragma once

// ESP32-CAM phai cung mang LAN voi may chay docker-compose.
// "Wokwi-GUEST" chi dung cho mo phong tren Wokwi.
//
// KHONG ghi mat khau that vao file nay. Hai cach cung cap:
//
//   1. File local bi git-ignore (khuyen nghi):
//      firmware/esp32-cam/include/wifi_config.local.h
//      -> sinh bang: python firmware/scripts/setup_local_config.py
//
//   2. Bien dich voi build_flags:
//      pio run -e esp32cam --project-option="build_flags=-DWIFI_SSID=\\\"...\\\" -DWIFI_PASSWORD=\\\"...\\\""

#if defined(__has_include)
#if __has_include("wifi_config.local.h")
#include "wifi_config.local.h"
#endif
#endif

#ifndef WIFI_SSID
#define WIFI_SSID       "Wokwi-GUEST"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD   ""
#endif

#define STREAM_PORT     81
#define HTTP_PORT       80

#define DEFAULT_FRAME_SIZE  FRAMESIZE_VGA
#define JPEG_QUALITY        10
#define FB_COUNT            2
