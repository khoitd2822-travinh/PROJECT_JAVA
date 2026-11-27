#pragma once

// ESP32-CAM phai cung mang LAN voi may chay Backend / AI Edge.
// "Wokwi-GUEST" chi dung cho fallback / CI, khong ghi mat khau that vao file nay.
//
// File local bi git-ignore:
//   firmware/esp32-cam/include/wifi_config.local.h
// Duoc tu dong sinh boi `pio run` hook hoac `python firmware/scripts/setup_local_config.py`.

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

#ifndef MDNS_HOSTNAME
#define MDNS_HOSTNAME   "swiftlet-cam"
#endif

#define HTTP_PORT       80
#define STREAM_PORT     81

#define DEFAULT_FRAME_SIZE  FRAMESIZE_VGA
#define JPEG_QUALITY        10
#define FB_COUNT            2
