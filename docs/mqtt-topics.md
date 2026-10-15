# TÀI LIỆU ĐẶC TẢ GIAO THỨC MQTT - SWIFTLETCARE

Hệ thống **SwiftletCare** sử dụng giao thức **MQTT (Message Queuing Telemetry Transport)** qua broker **EMQX** để đồng bộ dữ liệu thời gian thực giữa các tầng: **Firmware ESP32 (Phần cứng) $\leftrightarrow$ Backend (Spring Boot) $\leftrightarrow$ Frontend (Web Next.js & Mobile App) $\leftrightarrow$ AI Edge Service**.

---

## 1. Thông tin Kết nối Broker

- **Host (Nội bộ / Docker):** `localhost` hoặc `emqx`
- **Cổng TCP chuẩn (Firmware & Backend):** `1883`
- **Cổng WebSocket (Frontend Web Browser):** `8083` (WS) hoặc `8084` (WSS - SSL/TLS)
- **Cổng Dashboard Quản trị EMQX:** `18083` (User/Password: `admin` / `public`)
- **Public Broker Test (Dự phòng):** `broker.emqx.io:1883` (TCP) / `wss://broker.emqx.io:8084/mqtt` (WSS)

---

## 2. Quy ước Đặt tên Topic (Topic Convention)

Cấu trúc phân cấp topic chuẩn hóa:
```
swiftlet/{kênh}/{farmId}/{zoneId}/{deviceId}
```
- `farmId`: Mã định danh nhà yến (Số nguyên, ví dụ: `1`, `2`)
- `zoneId`: Mã khu vực / tầng nhà yến (Số nguyên, ví dụ: `1`, `2`)
- `deviceId`: Mã định danh thiết bị vi điều khiển (Chuỗi, ví dụ: `ESP32_MAIN_01`, `ESP32_CAM_01`)

---

## 3. Danh sách Topics Chi tiết

### 3.1. Telemetry Data (Dữ liệu Cảm biến & Trạng thái Thiết bị)

- **Topic:** `swiftlet/telemetry/{farmId}/{zoneId}/{deviceId}`
  - Ví dụ: `swiftlet/telemetry/1/1/ESP32_MAIN_01`
  - Wildcard nhận của Backend: `swiftlet/telemetry/#`
- **Bên gửi (Publisher):** `ESP32_MAIN`
- **Bên nhận (Subscriber):** Backend Spring Boot (`TelemetryMqttReceiver`), Frontend Dashboard
- **Tần suất gửi:** Định kỳ 2 giây/lần (theo chỉ tiêu kỹ thuật Tuần 3)
- **QoS:** `0` hoặc `1` | **Retain:** `false`
- **Cấu trúc JSON Payload (Khớp chuẩn 100% với `TelemetryPayloadDTO`):**
```json
{
  "deviceId": "ESP32_MAIN_01",
  "farmId": 1,
  "zoneId": 1,
  "temp": 28.5,
  "hum": 78.2,
  "co2": 450,
  "light": 12,
  "sound": 68.4,
  "relays": {
    "mist": 0,
    "fan": 0,
    "heat": 0,
    "alarm": 0
  }
}
```

**Mô tả các trường:**
| Trường | Kiểu | Đơn vị | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `deviceId` | String | - | Tên định danh thiết bị ESP32 |
| `farmId` | Long | - | ID nhà yến |
| `zoneId` | Long | - | ID khu vực / phòng |
| `temp` | Double | °C | Nhiệt độ môi trường (SHT30/SHT31) |
| `hum` | Double | % | Độ ẩm tương đối (SHT30/SHT31) |
| `co2` | Integer | ppm | Nồng độ khí CO2/khí thải (MQ-135) |
| `light` | Integer | lux | Cường độ ánh sáng (LDR / BH1750) |
| `sound` | Double | dB | Cường độ âm thanh loa dẫn dụ |
| `relays.mist` | Integer | 0/1 | Trạng thái Máy phun sương (Relay 1 - GPIO 25) |
| `relays.fan` | Integer | 0/1 | Trạng thái Quạt hút thông gió (Relay 2 - GPIO 26) |
| `relays.heat` | Integer | 0/1 | Trạng thái Thiết bị sưởi/đèn (Relay 3 - GPIO 27) |
| `relays.alarm` | Integer | 0/1 | Trạng thái Còi/Đèn báo lỗi (GPIO 14) |

---

### 3.2. Command & Control (Lệnh Điều khiển Can thiệp)

- **Topic:** `swiftlet/command/{deviceId}` hoặc `swiftlet/command/all`
  - Ví dụ: `swiftlet/command/ESP32_MAIN_01`
- **Bên gửi (Publisher):** Backend Server (Manual Override API), Frontend Web Dashboard
- **Bên nhận (Subscriber):** `ESP32_MAIN`
- **QoS:** `1` | **Retain:** `false`

#### a. Lệnh Bật/Tắt Rơ-le (Manual Override):
```json
{
  "command": "RELAY_CONTROL",
  "target": "mist",
  "state": 1,
  "mode": "MANUAL"
}
```
- `target`: `"mist"`, `"fan"`, `"heat"`, `"alarm"`, hoặc `"all"`
- `state`: `1` (ON/Đóng relay), `0` (OFF/Ngắt relay)
- `mode`: `"MANUAL"` (Ghi đè thủ công từ người dùng), `"AUTO"` (Trả về chế độ tự động vi khí hậu)

#### b. Lệnh Cập nhật Ngưỡng Vi khí hậu từ xa:
```json
{
  "command": "SET_THRESHOLDS",
  "temp_max": 31.0,
  "temp_min": 24.0,
  "hum_min": 75.0,
  "co2_max": 1000
}
```

#### c. Lệnh Yêu cầu Báo cáo Tức thời (Ping/Query):
```json
{
  "command": "GET_STATUS"
}
```

---

### 3.3. Command Response / ACK (Phản hồi Lệnh)

- **Topic:** `swiftlet/response/{deviceId}`
  - Ví dụ: `swiftlet/response/ESP32_MAIN_01`
- **Bên gửi (Publisher):** `ESP32_MAIN`
- **Bên nhận (Subscriber):** Backend Server, Frontend Dashboard
- **QoS:** `1` | **Retain:** `false`
- **Cấu trúc JSON Payload:**
```json
{
  "deviceId": "ESP32_MAIN_01",
  "status": "SUCCESS",
  "command": "RELAY_CONTROL",
  "target": "mist",
  "state": 1,
  "mode": "MANUAL",
  "executionTimeMs": 14,
  "timestamp": 1728981234
}
```

---

### 3.4. Cảnh báo Khẩn cấp (Alerts & Anomaly Events)

- **Topic:** `swiftlet/alert/{deviceId}`
  - Ví dụ: `swiftlet/alert/ESP32_MAIN_01`
- **Bên gửi (Publisher):** `ESP32_MAIN`
- **Bên nhận (Subscriber):** Backend Alert Service, Notification Worker (Telegram/FCM)
- **QoS:** `1` | **Retain:** `false`

#### Ví dụ Cảnh báo Loa Dẫn Dụ Bị Hỏng / Tắt:
```json
{
  "deviceId": "ESP32_MAIN_01",
  "type": "SPEAKER_ANOMALY",
  "severity": "WARNING",
  "message": "Phát hiện cường độ âm thanh loa dẫn dụ tụt thấp bất thường (< 50 dB) trong hơn 15 giây",
  "soundLevelDb": 38.2,
  "timestamp": 1728981250
}
```

#### Ví dụ Cảnh báo Khí Độc CO2 Tăng Đột Biến:
```json
{
  "deviceId": "ESP32_MAIN_01",
  "type": "AIR_QUALITY_CRITICAL",
  "severity": "CRITICAL",
  "message": "Nồng độ khí CO2 vượt ngưỡng an toàn (> 1200 ppm). Quạt hút khẩn cấp đã được kích hoạt.",
  "co2Level": 1250,
  "timestamp": 1728981300
}
```

---

### 3.5. Trạng thái Thiết bị (Life-Cycle & Last Will and Testament - LWT)

- **Topic:** `swiftlet/status/{deviceId}`
  - Ví dụ: `swiftlet/status/ESP32_MAIN_01`
- **Bên gửi:** `ESP32_MAIN` (Publish khi boot) và EMQX Broker (khi ESP32 mất kết nối đột ngột)
- **QoS:** `1` | **Retain:** `true`

#### Khi thiết bị khởi động và kết nối thành công:
```json
{
  "deviceId": "ESP32_MAIN_01",
  "status": "ONLINE",
  "ip": "192.168.1.150",
  "mac": "24:6F:28:XX:XX:XX",
  "firmwareVersion": "1.0.0",
  "freeHeap": 182430,
  "uptimeSeconds": 1
}
```

#### Di chúc LWT (Tự động kích hoạt khi ESP32 mất điện/mất Wi-Fi):
```json
{
  "deviceId": "ESP32_MAIN_01",
  "status": "OFFLINE",
  "reason": "CONNECTION_LOST"
}
```

---

### 3.6. Detection & Counter (Từ AI Service Edge)

- **Topic:** `swiftlet/detection/{farmId}/{zoneId}`
- **Bên gửi:** AI Camera Worker (Python Edge YOLOv8 + ByteTrack)
- **Bên nhận:** Backend & Web Frontend
- **JSON Payload mẫu:**
```json
{
  "farmId": 1,
  "zoneId": 1,
  "birdsIn": 128,
  "birdsOut": 45,
  "netCount": 83,
  "predatorsDetected": ["owl"],
  "snapshotUrl": "http://localhost:9000/swiftlet-alerts/20261015_0830_owl.jpg",
  "timestamp": "2026-10-15T08:30:00Z"
}
```
