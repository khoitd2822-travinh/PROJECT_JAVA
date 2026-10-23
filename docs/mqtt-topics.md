# Đặc tả MQTT SwiftletCare

Tài liệu định nghĩa các topic và định dạng gói tin MQTT trao đổi giữa phần cứng ESP32, backend và dashboard.

## Kết nối Broker

Broker khuyến nghị khi test: EMQX local qua `docker-compose.yml` (`tcp://localhost:1883`).

Broker public `broker.emqx.io` **không nên dùng cho phần điều khiển relay thật** vì ai cũng có thể publish vào topic.

## ⚠️ Đồng bộ chuẩn — SỬA Ở 3 CHỖ

Topic và broker phải giống nhau ở cả 3 nơi. Sửa một chỗ là hệ thống lệch ngay:

| Thành phần | File chứa cấu hình |
|---|---|
| Firmware ESP32 | `firmware/esp32-main/include/mqtt_config.h` |
| Backend Java | `BackEnd/src/main/resources/application.yaml` (`mqtt:`) |
| Frontend | `FrontEnd/src/lib/mqtt-config.ts` |

```cpp
#define MQTT_TENANT "thanhliem"   // mqtt_config.h
```

```yaml
mqtt:
  tenant: thanhliem             # application.yaml
```

```ts
export const MQTT_TENANT = 'thanhliem';  // mqtt-config.ts
```

## Cấu trúc Topic

Định dạng chung: `swiftlet/{tenant}/{farmId}/{zoneId}/{deviceId}/{loại}`

Ví dụ: `tenant = thanhliem`, `farmId = 1`, `zoneId = 1`, `deviceId = ESP32_MAIN_01`

Namespace `tenant` được dùng để **không đụng** tới topic của các nhánh khác trong repo.

## Danh sách Topic

### 1. Telemetry (Dữ liệu cảm biến)

Topic: `swiftlet/thanhliem/1/1/ESP32_MAIN_01/telemetry`
Backend subscribe: `swiftlet/thanhliem/+/+/telemetry`
Frontend subscribe: `swiftlet/thanhliem/+/+/telemetry`
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

Topic: `swiftlet/thanhliem/1/1/ESP32_MAIN_01/command`

> **Không dùng topic broadcast.** Firmware cũ từng subscribe `swiftlet/command/all` — đã bỏ.
> Lý do: khi nhiều ESP32 cùng subscribe topic chung, một lệnh gửi cho thiết bị A sẽ
> kích hoạt **tất cả** thiết bị. Trên broker công khai, bất kỳ ai cũng điều khiển được relay.
> Mỗi thiết bị chỉ nghe topic của riêng mình.

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

Topic: `swiftlet/thanhliem/1/1/ESP32_MAIN_01/response`

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

Topic: `swiftlet/thanhliem/1/1/ESP32_MAIN_01/alert`

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

Topic: `swiftlet/thanhliem/1/1/ESP32_MAIN_01/status` (QoS 1, retain = true)

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
