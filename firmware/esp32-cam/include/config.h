#pragma once

// ESP32-CAM phai cung mang LAN voi may chay docker-compose.
// "Wokwi-GUEST" chi dung cho mo phong tren Wokwi.
//
// KHONG ghi mat khau thật vao file nay. Ghi de khi build:
//   pio run -e esp32cam --project-option="build_flags=-DWIFI_SSID=\\\"...\\\" -DWIFI_PASSWORD=\\\"...\\\""
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
