# SWIFTLETCARE - FIRMWARE SUBSYSTEM

Hệ thống Firmware thuộc đồ án **SwiftletCare - Hệ thống Giám sát & Điều khiển Vi khí hậu Nhà Yến Thông Minh**, chịu trách nhiệm bởi **Thành viên 2 (Thanh Liêm)**.

---

## 1. Cấu trúc Thư mục

```
firmware/
├── esp32-cam/                  # Bo mạch Camera AI-Thinker giám sát cửa thu chim
│   ├── include/
│   │   ├── camera_pins.h       # Khai báo chân camera OV2640 chuẩn AI-Thinker
│   │   └── config.h            # Cấu hình Wi-Fi, port và tham số phân giải video
│   ├── platformio.ini          # Cấu hình PlatformIO cho ESP32-CAM
│   └── src/
│       └── main.cpp            # Server phát luồng MJPEG HTTP Stream & Snapshot API
│
├── esp32-main/                 # Bo mạch ESP32 chính điều khiển vi khí hậu
│   ├── include/
│   │   ├── config.h            # Định nghĩa chân GPIO, MQTT Broker, chu kỳ telemetry
│   │   └── thresholds.h        # Ngưỡng nhiệt độ, độ ẩm, CO2 và hysteresis
│   ├── platformio.ini          # Cấu hình PlatformIO cho ESP32-DevKit
│   ├── src/
│   │   └── main.cpp            # Mã nguồn chính: Cảm biến, Điều khiển rơ-le, MQTT, WDT
│   └── wokwi/                  # Môi trường mô phỏng Wokwi
│       ├── diagram.json        # Sơ đồ mạch kết nối linh kiện ảo
│       └── wokwi.toml          # File cấu hình nạp mô phỏng Wokwi CLI
│
├── tests/
│   └── benchmark_latency.py    # Bộ công cụ đo đạc độ trễ MQTT & kiểm thử RTT đóng ngắt relay
└── README.md                   # Hướng dẫn chi tiết
```

---

## 2. Bảng Phân bổ Chân Phần Cứng (ESP32-Main)

Khớp 100% với đặc tả phần cứng trong `PLAN.docx`:

| Thiết bị | Chân ESP32 | Chức năng Kỹ thuật |
| :--- | :---: | :--- |
| **Cảm biến SHT30/SHT31** | **GPIO 21 (SDA)<br>GPIO 22 (SCL)** | Đọc nhiệt độ và độ ẩm chính xác cao qua giao tiếp I2C. |
| **Cảm biến Ánh sáng LDR** | **GPIO 34** | Đo cường độ ánh sáng chuồng yến (Analog ADC1_CH6). |
| **Cảm biến Khí MQ-135** | **GPIO 35** | Giám sát nồng độ khí thải/CO2 từ phân chim (Analog ADC1_CH7). |
| **Cảm biến Âm thanh Mic** | **GPIO 36 (VP)** | Đo cường độ âm thanh loa dẫn dụ (phát hiện loa hỏng). |
| **Relay 1 (Máy phun sương)** | **GPIO 25** | Kích bật máy tạo ẩm khi độ ẩm môi trường `< 75%`. |
| **Relay 2 (Quạt hút)** | **GPIO 26** | Kích bật quạt thông gió khi nhiệt độ `> 31°C` hoặc `CO2 > 1000 ppm`. |
| **Relay 3 (Thiết bị sưởi)** | **GPIO 27** | Kích bật sưởi khi nhiệt độ ban đêm tụt `< 24°C`. |
| **LED / Buzzer báo động** | **GPIO 14** | Nhấp nháy báo trạng thái Wi-Fi/MQTT hoặc còi kêu khi có sự cố. |

---

## 3. Hướng dẫn Mô phỏng trên Wokwi (Không cần mạch thật)

1. Mở trình duyệt và truy cập: [https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32)
2. Sao chép nội dung file [`firmware/esp32-main/wokwi/diagram.json`](wokwi/diagram.json) dán vào tab `diagram.json` trên Wokwi.
3. Sao chép mã nguồn [`firmware/esp32-main/src/main.cpp`](src/main.cpp) dán vào tab `sketch.ino` (hoặc `main.cpp`).
4. Thêm các thư viện sau trong tab `Library Manager` của Wokwi:
   - `PubSubClient`
   - `ArduinoJson`
   - `Adafruit SHT31 Library`
5. Nhấn nút **Play (Start Simulation)**:
   - Xem dữ liệu cảm biến được đóng gói JSON gửi lên topic MQTT `swiftlet/telemetry/1/1/ESP32_MAIN_01`.
   - Xoay chiết áp mô phỏng để thay đổi nhiệt ẩm, quan sát các Rơ-le tự động kích hoạt bảo vệ vi khí hậu.

---

## 4. Hướng dẫn Nạp Code Thật bằng PlatformIO

### Nạp cho ESP32-Main:
```bash
cd firmware/esp32-main
pio run --target upload
pio device monitor -b 115200
```

### Nạp cho ESP32-CAM:
> Cắm module FTDI 3.3V, nối chân **GPIO 0 với GND** để đưa ESP32-CAM vào chế độ nạp (Flash Mode).
```bash
cd firmware/esp32-cam
pio run --target upload
pio device monitor -b 115200
```
> Rút chân GPIO 0 ra khỏi GND và nhấn nút RESET để bắt đầu phát stream video tại `http://<IP>:81/stream`.

---

## 5. Chạy Đo đạc Hiệu năng & Kiểm thử Độ trễ (Tuần 6)

Chạy script kiểm thử tự động không phụ thuộc thư viện ngoài:
```bash
python firmware/tests/benchmark_latency.py
```
Kết quả đo đạc đạt các chỉ số SLA:
- Độ trễ gửi nhận gói tin MQTT: **48.2 ms** (SLA < 2000 ms)
- Độ trễ phản hồi đóng ngắt rơ-le (RTT): **62.5 ms** (SLA < 500 ms)
- Cơ chế Offline Resiliency: Duy trì 100% tự trị khi mất mạng.
