# Đặc tả MQTT SwiftletCare

Tài liệu định nghĩa các topic và định dạng gói tin MQTT trao đổi giữa phần cứng ESP32, backend và dashboard.

## Kết nối Broker

Broker mặc định: `broker.emqx.io` (hoặc `localhost` khi chạy docker)
Port TCP: `1883`
Port WebSocket: `8083` (hoặc `8084` wss)

## Cấu trúc Topic

Định dạng chung: `swiftlet/{loại}/{farmId}/{zoneId}/{deviceId}`

Ví dụ: `farmId = 1`, `zoneId = 1`, `deviceId = ESP32_MAIN_01`

## Danh sách Topic

### 1. Telemetry (Dữ liệu cảm biến)

Topic: `swiftlet/telemetry/1/1/ESP32_MAIN_01`
Backend subscribe: `swiftlet/telemetry/#`
Tần suất: 2 giây/lần

Payload mẫu:
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

Ý nghĩa các trường:
- `temp`: nhiệt độ (°C)
- `hum`: độ ẩm (%)
- `co2`: nồng độ CO2 (ppm)
- `light`: cường độ sáng (lux)
- `sound`: mức âm thanh (dB)
- `relays`: trạng thái 3 rơ-le (mist, fan, heat) và còi/led (alarm), giá trị 0 hoặc 1

### 2. Command (Điều khiển từ server)

Topic: `swiftlet/command/ESP32_MAIN_01` hoặc `swiftlet/command/all`

Lệnh điều khiển rơ-le:
```json
{
  "command": "RELAY_CONTROL",
  "target": "mist",
  "state": 1,
  "mode": "MANUAL"
}
```
Target có thể là `mist`, `fan`, `heat`, `alarm` hoặc `all`.
State: `1` là bật, `0` là tắt.
Mode: `MANUAL` để giữ trạng thái theo lệnh, `AUTO` để trả về cho ESP32 tự điều khiển theo cảm biến.

Lệnh cập nhật ngưỡng:
```json
{
  "command": "SET_THRESHOLDS",
  "temp_max": 31.0,
  "temp_min": 24.0,
  "hum_min": 75.0,
  "co2_max": 1000
}
```

Lệnh lấy trạng thái tức thời:
```json
{
  "command": "GET_STATUS"
}
```

### 3. Response (Phản hồi từ ESP32)

Topic: `swiftlet/response/ESP32_MAIN_01`

Payload:
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

### 4. Alert (Cảnh báo sự cố)

Topic: `swiftlet/alert/ESP32_MAIN_01`

Cảnh báo loa dẫn dụ tắt hoặc hỏng:
```json
{
  "deviceId": "ESP32_MAIN_01",
  "type": "SPEAKER_ANOMALY",
  "severity": "WARNING",
  "message": "Loa dan du mat tin hieu",
  "soundLevelDb": 38.2,
  "timestamp": 1728981250
}
```

### 5. Status (Trạng thái thiết bị)

Topic: `swiftlet/status/ESP32_MAIN_01` (QoS 1, retain = true)

Khi khởi động:
```json
{
  "deviceId": "ESP32_MAIN_01",
  "status": "ONLINE",
  "ip": "192.168.1.150"
}
```

LWT khi mất kết nối:
```json
{
  "deviceId": "ESP32_MAIN_01",
  "status": "OFFLINE"
}
```
