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
`MQTT_BROKER_HOST` là `localhost`.

**IP broker KHÔNG được commit vào git** — vì IP máy đổi theo DHCP và mỗi
người nạp code trên máy khác sẽ cần IP khác nhau.

### Cách nhanh nhất — chạy script setup

```bash
python firmware/scripts/setup_local_config.py
```

Script sẽ tự động:
1. Dò IP LAN của máy bạn (theo route mặc định) → làm địa chỉ broker cho ESP32
2. Dò tên Wi-Fi đang kết nối
3. Sinh 2 file local (đã git-ignore, **không** ai commit lên GitHub):
   - `firmware/esp32-main/include/mqtt_config.local.h` (broker + Wi-Fi)
   - `firmware/esp32-cam/include/wifi_config.local.h` (Wi-Fi)
4. Kiểm tra broker có chạy không, và báo cáo cần làm gì nếu chưa

Tuỳ chọn:

```bash
# Chỉ định thủ công khi script dò sai
python firmware/scripts/setup_local_config.py --broker-host 192.168.1.50
python firmware/scripts/setup_local_config.py --wifi-ssid "TenWiFi" --wifi-password "MatKhau"

# Không hỏi xác nhận (chạy trong CI hoặc script tự động)
python firmware/scripts/setup_local_config.py --yes
```

Sau đó nạp firmware:

```bash
cd firmware/esp32-main && pio run -t upload
cd firmware/esp32-cam  && pio run -t upload
```

> **Khi đổi máy hoặc đổi mạng (DHCP đổi IP)** → chạy lại script setup.
> File local được `include` tự động, không cần sửa mã nguồn.

### Cách thủ công — tạo file local

```bash
cat > esp32-main/include/mqtt_config.local.h <<'EOF'
#pragma once
#define MQTT_BROKER_HOST "<IP may chay docker-compose>"
#define WIFI_SSID "<Ten Wi-Fi>"
#define WIFI_PASSWORD "<Mat khau>"
EOF
```

### Cách thủ công — ghi đè lúc build

```bash
# ESP32 chính
cd esp32-main
pio run -t upload --project-option="build_flags=-DWIFI_SSID=\\\"TenWiFi\\\" -DWIFI_PASSWORD=\\\"MatKhau\\\" -DMQTT_BROKER_HOST=\\\"<IP may chay docker>\\\""

# ESP32-CAM
cd esp32-cam
pio run -t upload --project-option="build_flags=-DWIFI_SSID=\\\"TenWiFi\\\" -DWIFI_PASSWORD=\\\"MatKhau\\\""
```

> **Lưu ý:** `build_flags` ghi đè giá trị trong file local. Nếu bạn đã dùng
> file local thì không cần truyền `-DMQTT_BROKER_HOST`.

**Không ghi mật khẩu thật vào file nguồn** — dùng `WIFI_SSID` / `WIFI_PASSWORD`
qua file local hoặc `build_flags`.

Giá trị mặc định nằm trong:
- `firmware/esp32-main/include/mqtt_config.h` (broker, tenant, topic, Wi-Fi)
- `firmware/esp32-cam/include/config.h` (Wi-Fi)

Cả ba đều dùng `#ifndef` nên biến định nghĩa từ `build_flags` sẽ ghi đè giá trị mặc định.

### Lưu ý về đường dẫn có dấu tiếng Việt

Nếu thư mục dự án chứa ký tự đặc biệt (ví dụ `Tài liệu`), bước **link** của
PlatformIO có thể fail với lỗi `cannot find ...tmp: Invalid argument`. Đây là
giới hạn của toolchain `xtensa-esp-elf`, **không liên quan** tới mã nguồn.
Cách xử lý: build trong thư mục có đường dẫn ASCII thuần (ví dụ clone repo vào
`C:\dev\PROJECT_JAVA`).

## Chạy kiểm tra độ trễ

```bash
python tests/benchmark_latency.py
```

Script cần broker đang chạy (mặc định `localhost:1883`). Nếu không kết nối được,
nó báo `Broker connection | FAILED` — kết quả đo được in ra là số liệu thật,
không phải giá trị mặc định.
