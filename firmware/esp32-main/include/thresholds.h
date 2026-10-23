#pragma once

struct ClimateThresholds {
    float hum_min = 75.0f;
    float hum_target = 80.0f;

    float temp_max = 31.0f;
    float temp_target = 29.5f;
    int co2_max = 1000;
    int co2_target = 800;

    float temp_min = 24.0f;
    float temp_heat_off = 26.0f;

    float sound_min_db = 50.0f;
    bool speaker_monitor_enabled = true;
};
