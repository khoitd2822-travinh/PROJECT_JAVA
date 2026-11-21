#ifndef CONFIG_H
#define CONFIG_H

// Định nghĩa cấu hình chân GPIO cho ESP32
#define DHT_PIN 4          // Chân nối dữ liệu DHT22
#define DHT_TYPE DHT22     // Loại cảm biến DHT

#define MQ135_PIN 34       // Chân Analog đọc biến trở giả lập MQ-135
#define LDR_PIN 35         // Chân Analog đọc biến trở giả lập LDR

#define INTERVAL_MS 3000   // Định kỳ đọc dữ liệu: 3 giây

#endif