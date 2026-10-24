# Firmware SwiftletCare

Thư mục chứa mã nguồn vi điều khiển cho hệ thống giám sát và điều khiển nhà yến.

## Cấu trúc thư mục

- `esp32-cam`: code camera OV2640 phát luồng MJPEG stream và chụp ảnh cửa thu chim
- `esp32-main`: code bo chính đọc cảm biến, kết nối MQTT và kích 3 rơ-le
- `tests`: script Python đo độ trễ mạng và phản hồi lệnh

## Kết nối phần cứng ESP32 chính

- SHT30: GPIO 21 (SDA), GPIO 22 (SCL)
- LDR: GPIO 34 (Analog)
- MQ-135: GPIO 35 (Analog)
- Mic cảm biến âm: GPIO 36 (Analog)
- Relay 1 (phun sương): GPIO 25 (kích khi ẩm < 75%)
- Relay 2 (quạt hút): GPIO 26 (kích khi nhiệt độ > 31°C hoặc CO2 > 1000 ppm)
- Relay 3 (sưởi): GPIO 27 (kích khi nhiệt độ < 24°C)
- LED / Buzzer: GPIO 14

## Hướng dẫn chạy mô phỏng Wokwi

1. Truy cập https://wokwi.com/projects/new/esp32
2. Dán nội dung `esp32-main/wokwi/diagram.json` vào tab `diagram.json`.
3. Dán mã nguồn `esp32-main/src/main.cpp` vào tab `sketch.ino`.
4. Cài đặt các thư viện trong Wokwi Library Manager:
   - `PubSubClient`
   - `ArduinoJson`
   - `Adafruit SHT31 Library`
5. Bấm Play để chạy mô phỏng.

## Hướng dẫn nạp code PlatformIO

Nạp ESP32 chính:
```bash
cd esp32-main
pio run --target upload
```

Nạp ESP32-CAM:
Nối chân GPIO 0 xuống GND khi cắm mạch nạp FTDI để vào flash mode.
```bash
cd esp32-cam
pio run --target upload
```

## Cấu hình Wi-Fi và broker cho thiết bị thật

Mặc định trong mã nguồn là `Wokwi-GUEST` (chỉ dùng cho mô phỏng) và
`MQTT_BROKER_HOST` trỏ tới IP máy chạy `docker-compose`.

**Không ghi mật khẩu thật vào file nguồn** — ghi đè lúc build:

```bash
# ESP32 chính
cd esp32-main
pio run -t upload --project-option="build_flags=-DWIFI_SSID=\\\"TenWiFi\\\" -DWIFI_PASSWORD=\\\"MatKhau\\\" -DMQTT_BROKER_HOST=\\\"10.88.164.85\\\""

# ESP32-CAM
cd esp32-cam
pio run -t upload --project-option="build_flags=-DWIFI_SSID=\\\"TenWiFi\\\" -DWIFI_PASSWORD=\\\"MatKhau\\\""
```

Giá trị mặc định nằm trong:
- `firmware/esp32-main/include/mqtt_config.h` (broker, tenant, topic, Wi-Fi)
- `firmware/esp32-cam/include/config.h` (Wi-Fi)

Cả hai đều dùng `#ifndef` nên biến định nghĩa từ `build_flags` sẽ ghi đè giá trị mặc định.

## Chạy kiểm tra độ trễ

```bash
python tests/benchmark_latency.py
```

Script cần broker đang chạy (mặc định `localhost:1883`). Nếu không kết nối được,
nó báo `Broker connection | FAILED` — kết quả đo được in ra là số liệu thật,
không phải giá trị mặc định.
