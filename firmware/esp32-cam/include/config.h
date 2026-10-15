#pragma once

// Wi-Fi Credentials for ESP32-CAM
#define WIFI_SSID       "Wokwi-GUEST"       // Hoặc SSID thực tế nhà yến: "Swiftlet_Farm_2.4G"
#define WIFI_PASSWORD   ""                  // Password Wi-Fi (để trống nếu Wokwi-GUEST)

// Camera Server Configuration
#define STREAM_PORT     81                  // Cổng stream video MJPEG
#define HTTP_PORT       80                  // Cổng HTTP Server điều khiển & snapshot

// Frame and Quality Configuration
// FRAMESIZE_VGA (640x480), FRAMESIZE_SVGA (800x600), FRAMESIZE_QVGA (320x240)
#define DEFAULT_FRAME_SIZE  FRAMESIZE_VGA
#define JPEG_QUALITY        10              // 10-63 (số càng nhỏ chất lượng càng cao)
#define FB_COUNT            2               // Double buffering trong PSRAM
