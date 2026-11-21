#ifndef THRESHOLDS_H
#define THRESHOLDS_H

// Ngưỡng cảnh báo chuẩn cho hệ thống (dùng #define để tránh lỗi liên kết bộ nhớ)
#define TEMP_MAX_THRESHOLD 38.0    // Nhiệt độ tối đa (°C)
#define HUMID_MIN_THRESHOLD 40.0   // Độ ẩm tối thiểu (%)
#define MQ135_GAS_THRESHOLD 2048   // Ngưỡng khí độc giả lập (0 - 4095)
#define LDR_LIGHT_THRESHOLD 1000   // Ngưỡng ánh sáng tối thiểu

#endif