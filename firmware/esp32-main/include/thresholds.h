#pragma once

/**
 * Ngưỡng Vi khí hậu Nhà Yến chuẩn kỹ thuật (Khớp với PLAN.docx)
 * Hỗ trợ Hysteresis chống dao động đóng/ngắt liên tục tiếp điểm rơ-le
 */

struct ClimateThresholds {
    // 1. Máy Phun sương tạo ẩm (Relay 1)
    // Kích hoạt khi độ ẩm < 75% (Theo STT 5 trong PLAN)
    float hum_min = 75.0f;
    float hum_target = 80.0f;       // Tắt khi đạt 80%

    // 2. Quạt hút thông gió (Relay 2)
    // Kích hoạt khi nhiệt độ > 31°C hoặc CO2 tăng cao (Theo STT 6 trong PLAN)
    float temp_max = 31.0f;
    float temp_target = 29.5f;      // Tắt quạt khi nhiệt độ hạ về 29.5°C
    int co2_max = 1000;             // Bật quạt khi CO2 > 1000 ppm
    int co2_target = 800;           // Tắt quạt khi CO2 hạ dưới 800 ppm

    // 3. Thiết bị sưởi ấm (Relay 3)
    // Kích hoạt khi nhiệt độ phòng tụt quá thấp vào ban đêm (Theo STT 7 trong PLAN)
    float temp_min = 24.0f;
    float temp_heat_off = 26.0f;    // Tắt sưởi khi nhiệt độ tăng lên 26°C

    // 4. Loa dẫn dụ âm thanh (Microphone Analog)
    // Ngưỡng tối thiểu của âm thanh loa dẫn dụ đang phát
    float sound_min_db = 50.0f;
    bool speaker_monitor_enabled = true;
};
