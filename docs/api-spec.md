# API Specification — SwiftletCare

**Phụ trách tài liệu:** Nguyễn Thanh Liêm (mục 13 — tài liệu)
**Cập nhật:** 2026-11-06
**Trạng thái:** `draft` — cần đối chiếu với code hiện tại trước khi chốt

> **Lưu ý:** Tài liệu này mô tả *hợp đồng* (contract) mà các module phải tuân thủ.
> Các endpoint được đánh dấu `[chưa có]` là phần còn thiếu — xem ma trận test
> `docs/testing/test-matrix.md` để biết mục nào đang chờ ai.

---

## 1. Quy ước chung

| Thuộc tính | Giá trị |
| :--- | :--- |
| Base URL (dev) | `http://localhost:8080/api/v1` |
| Content-Type | `application/json` |
| Encoding | UTF-8 |
| Xác thực | `Authorization: Bearer <JWT>` |
| Mã lỗi chuẩn | HTTP status + body `{ "code": "...", "message": "..." }` |

### 1.1 Mã lỗi dùng chung

| Mã | HTTP | Ý nghĩa |
| :--- | :---: | :--- |
| `AUTH_INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu |
| `AUTH_EMAIL_EXISTS` | 409 | Email đã được đăng ký |
| `AUTH_TOKEN_EXPIRED` | 401 | Token hết hạn |
| `AUTH_TOKEN_MISSING` | 401 | Thiếu header Authorization |
| `FORBIDDEN_NOT_OWNER` | 403 | Không có quyền với tài nguyên này |
| `VALIDATION_ERROR` | 400 | Dữ liệu đầu vào sai |
| `NOT_FOUND` | 404 | Không tìm thấy tài nguyên |
| `DEVICE_OFFLINE` | 409 | Thiết bị không phản hồi (offline) |
| `COMMAND_TIMEOUT` | 504 | Không nhận được ACK trong thời gian quy định |
| `PAYLOAD_INVALID` | 400 | JSON không hợp lệ |
| `STORAGE_ERROR` | 500 | Lỗi S3/MinIO |
| `INTERNAL_ERROR` | 500 | Lỗi không xác định |

> **Quy tắc bắt buộc:** không trả stack trace hay chi tiết nội bộ ra ngoài.
> Thông điệp phải đủ để người dùng biết cần làm gì, nhưng không lộ cấu trúc hệ thống.

### 1.2 Quy ước dữ liệu cảm biến

Cùng một hợp đồng cho mọi API trả về số đo cảm biến:

| Trường | Kiểu | Đơn vị | Ghi chú |
| :--- | :--- | :--- | :--- |
| `temp` | number \| null | °C | `null` = chưa có số đo, **không** dùng 0 |
| `hum` | number \| null | % | như trên |
| `co2` | number \| null | ppm | `null` nếu MQ-135 chưa hiệu chỉnh ppm |
| `light` | number \| null | % (0–100) | ánh sáng quy đổi |
| `sound` | number \| null | dB | `null` khi không có mic |
| `relays` | object | — | `{ "mist": 0\|1, "fan": 0\|1, "heat": 0\|1, "alarm": 0\|1 }` |

**Nguyên tắc:** thiếu số đo → `null`. Dữ liệu mẫu → tách sang endpoint demo riêng,
không trộn vào dữ liệu thiết bị thật.

---

## 2. Module Auth

### 2.1 `POST /auth/register`

Đăng ký người dùng mới.

**Request**

```json
{
  "email": "user@example.com",
  "password": "mat-khau",
  "fullName": "Nguyen Van A",
  "role": "OWNER"
}
```

| Trường | Bắt buộc | Ràng buộc |
| :--- | :--- | :--- |
| `email` | Có | Định dạng email, duy nhất |
| `password` | Có | Tối thiểu 8 ký tự |
| `fullName` | Có | Không rỗng |
| `role` | Không | `OWNER` (mặc định) hoặc `ADMIN` |

**Response `201`**

```json
{
  "code": "OK",
  "message": "Đăng ký thành công",
  "data": {
    "id": 12,
    "email": "user@example.com",
    "role": "OWNER"
  }
}
```

**Lỗi**

| Mã | HTTP | Khi nào |
| :--- | :---: | :--- |
| `AUTH_EMAIL_EXISTS` | 409 | Email đã tồn tại |
| `VALIDATION_ERROR` | 400 | Thiếu trường hoặc sai định dạng |

### 2.2 `POST /auth/login`

**Request**

```json
{ "email": "user@example.com", "password": "mat-khau" }
```

**Response `200`**

```json
{
  "code": "OK",
  "message": "Đăng nhập thành công",
  "data": {
    "token": "eyJhbGciOi...",
    "expiresAt": "2026-11-06T18:00:00Z",
    "role": "OWNER",
    "userId": 12
  }
}
```

**Lỗi**

| Mã | HTTP | Khi nào |
| :--- | :---: | :--- |
| `AUTH_INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu |
| `AUTH_TOKEN_MISSING` | 401 | Thiếu header khi gọi API có bảo vệ |

> Thông điệp lỗi phải **chung** cho cả "sai email" và "sai mật khẩu",
> không tiết lộ email nào đã tồn tại.

### 2.3 `POST /auth/logout` `[chưa có]`

Vô hiệu hóa token hiện tại.

**Response `200`**

```json
{ "code": "OK", "message": "Đã đăng xuất", "data": null }
```

---

## 3. Module Telemetry

### 3.1 `GET /telemetry/latest`

Số đo mới nhất của một khu vực.

**Query**

| Tham số | Bắt buộc | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `farmId` | Không | long | 1 | ID nhà yến |
| `zoneId` | Không | long | 1 | ID khu vực |

**Response `200`**

```json
{
  "code": "OK",
  "message": "OK",
  "data": {
    "deviceId": "ESP32_MAIN_01",
    "farmId": 1,
    "zoneId": 1,
    "temp": 28.4,
    "hum": 72.1,
    "co2": 620,
    "light": 35,
    "sound": 65.5,
    "relays": { "mist": 0, "fan": 1, "heat": 0, "alarm": 0 },
    "measuredAt": "2026-11-06T10:00:00Z",
    "receivedAt": "2026-11-06T10:00:01Z",
    "stale": false,
    "status": "ONLINE"
  }
}
```

| Trường | Mô tả |
| :--- | :--- |
| `measuredAt` | Thời điểm ESP32 đo (firmware gửi kèm) |
| `receivedAt` | Thời điểm BE nhận — dùng để tính độ trễ |
| `stale` | `true` khi dữ liệu đã cũ hơn ngưỡng (TTL Redis = 5 phút) |
| `status` | `ONLINE` / `OFFLINE` / `STALE` — suy ra từ heartbeat |

**Lỗi**

| Mã | HTTP | Khi nào |
| :--- | :---: | :--- |
| `NOT_FOUND` | 404 | Không có dữ liệu và không có bản ghi DB |
| `FORBIDDEN_NOT_OWNER` | 403 | Người dùng không sở hữu khu vực này |

### 3.2 `GET /telemetry/history`

Lịch sử số đo trong khoảng thời gian.

**Query**

| Tham số | Bắt buộc | Kiểu | Mô tả |
| :--- | :--- | :--- | :--- |
| `farmId` | Không | long | Mặc định 1 |
| `zoneId` | Không | long | Mặc định 1 |
| `from` | Có | ISO-8601 | Bắt đầu khoảng |
| `to` | Có | ISO-8601 | Kết thúc khoảng |
| `bucket` | Không | enum | `raw` \| `minute` \| `hour` — gom mẫu để giảm tải |
| `limit` | Không | int | Mặc định 500, tối đa 5000 |

**Response `200`**

```json
{
  "code": "OK",
  "message": "OK",
  "data": {
    "farmId": 1,
    "zoneId": 1,
    "from": "2026-11-06T08:00:00Z",
    "to": "2026-11-06T10:00:00Z",
    "bucket": "minute",
    "items": [
      {
        "time": "2026-11-06T08:00:00Z",
        "temp": 27.8,
        "hum": 71.2,
        "co2": 590,
        "light": 30,
        "sound": 64.0
      }
    ]
  }
}
```

**Lỗi**

| Mã | HTTP | Khi nào |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | 400 | `from > to`, thiếu tham số, `limit` vượt tối đa |

> Quy mô dữ liệu: 1 board gửi mỗi 2 giây → **43.200 mẫu/ngày/board**.
> Vì vậy `history` phải có `bucket` và `limit`; không trả toàn bộ lịch sử.

### 3.3 `GET /telemetry/devices` `[chưa có]`

Danh sách thiết bị thuộc khu vực, kèm trạng thái online/offline.

### 3.4 `GET /telemetry/health` `[chưa có]`

Tình trạng hệ thống: broker, DB, Redis, S3 — dùng cho checklist bật/tắt hệ thống.

---

## 4. Module Actuation (điều khiển relay)

### 4.1 `POST /actuation/override`

Gửi lệnh đóng/ngắt relay tới ESP32 qua MQTT.

**Request**

```json
{
  "deviceId": "ESP32_MAIN_01",
  "target": "fan",
  "state": 1,
  "mode": "MANUAL"
}
```

| Trường | Bắt buộc | Ràng buộc |
| :--- | :--- | :--- |
| `deviceId` | Có | Phải tồn tại và người dùng có quyền |
| `target` | Có | `mist` \| `fan` \| `heat` \| `alarm` \| `all` |
| `state` | Có | `0` (tắt) hoặc `1` (bật) |
| `mode` | Không | `MANUAL` (mặc định) \| `AUTO` |
| `commandId` | Không | UUID; nếu không có, BE tự sinh |

**Response `202 Accepted`**

```json
{
  "code": "OK",
  "message": "Đã gửi lệnh, đang chờ thiết bị xác nhận",
  "data": {
    "commandId": "9c1f2b3a-...",
    "deviceId": "ESP32_MAIN_01",
    "target": "fan",
    "requestedState": 1,
    "requestedMode": "MANUAL",
    "boardState": null,
    "status": "PENDING"
  }
}
```

> **Quan trọng:** API trả `202` nghĩa là *"đã gửi lệnh"*, **không** phải
> *"thiết bị đã thực hiện"*. `boardState` chỉ được điền khi ESP32 gửi ACK.
> Không bao giờ báo thành công khi board chưa xác nhận.

**Lỗi**

| Mã | HTTP | Khi nào |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | 400 | `state` không phải 0/1, `target` không hợp lệ |
| `NOT_FOUND` | 404 | `deviceId` không tồn tại |
| `FORBIDDEN_NOT_OWNER` | 403 | Không có quyền điều khiển thiết bị này |
| `DEVICE_OFFLINE` | 409 | Board không heartbeat, không gửi lệnh |

### 4.2 `GET /actuation/{commandId}` `[chưa có]`

Tra trạng thái một lệnh đã gửi — dùng để xử lý timeout phía client.

| Trường | Giá trị |
| :--- | :--- |
| `status` | `PENDING` \| `SUCCESS` \| `FAILED` \| `TIMEOUT` |
| `boardState` | Trạng thái ESP32 xác nhận (0/1) |
| `boardMode` | `AUTO` \| `MANUAL` — mode thiết bị thực sự đang chạy |

### 4.3 Hợp đồng topic MQTT liên quan

| Chiều | Topic | Payload |
| :--- | :--- | :--- |
| Lệnh | `swiftlet/{tenant}/{farmId}/{zoneId}/{deviceId}/command` | `{ "command": "RELAY_CONTROL", "target": "fan", "state": 1, "mode": "MANUAL", "commandId": "..." }` |
| ACK | `swiftlet/{tenant}/{farmId}/{zoneId}/{deviceId}/response` | `{ "deviceId": "...", "command": "RELAY_CONTROL", "status": "SUCCESS", "target": "fan", "state": 1, "mode": "MANUAL", "executionTimeMs": 3, "timestamp": 1762... }` |

Chi tiết đầy đủ: `docs/mqtt-topics.md`.

---

## 5. Module Farm (nhà / tầng / thiết bị)

### 5.1 `GET /farm/houses`

Danh sách nhà yến mà người dùng được phép truy cập.

**Response `200`**

```json
{
  "code": "OK",
  "message": "OK",
  "data": [
    { "id": 1, "name": "Nhà yến A", "zones": [ { "id": 1, "name": "Khu vực 1" } ] }
  ]
}
```

### 5.2 `GET /farm/devices?farmId=&zoneId=`

Danh sách thiết bị kèm trạng thái.

---

## 6. Module BirdTracking (đếm chim) `[chưa có]`

| Endpoint | Mô tả |
| :--- | :--- |
| `GET /birdtracking/count` | Số chim In/Out hôm nay |
| `GET /birdtracking/log` | Lịch sử đếm theo ngày |
| `GET /birdtracking/alerts` | Danh sách cảnh báo thú hại |

---

## 7. Module Storage (ảnh thú hại) `[chưa có]`

### 7.1 `GET /storage/{objectKey}/url`

Trả URL có thời hạn để xem ảnh.

**Response `200`**

```json
{
  "code": "OK",
  "message": "OK",
  "data": {
    "objectKey": "threat/2026/11/06/snapshot-001.jpg",
    "url": "http://localhost:9000/...",
    "expiresAt": "2026-11-06T10:15:00Z"
  }
}
```

> Khóa trả về là `url`, **không** phải `url:`. Xem issue đã ghi nhận.

---

## 8. Module Notification (Zalo / Telegram) `[chưa có]`

Gửi thông báo khẩn cấp khi có cảnh báo cấp 3 (thú hại / mất an toàn).
Phải kiểm tra cả kết quả nghiệp vụ của service bên ngoài, không chỉ HTTP 200.

---

## 9. WebSocket STOMP

| Endpoint | Mục đích |
| :--- | :--- |
| `/ws` | Điểm kết nối STOMP |
| `/topic/telemetry/{farmId}/{zoneId}` | Số đo cảm biến real-time |
| `/topic/alerts` | Cảnh báo thú hại |
| `/topic/count` | Cập nhật số chim đếm |

Yêu cầu: phải xác thực và phân quyền theo subscription; kết nối sai khu vực
không được nhận dữ liệu.

---

## 10. Chưa định nghĩa — cần team thống nhất

| Nội dung | Vì sao chưa chốt |
| :--- | :--- |
| Định dạng body lỗi chuẩn | Đang có nhiều cách trả lỗi trong code |
| Phân trang dùng `page`/`size` hay `limit`/`offset` | Chưa thống nhất |
| Chuẩn thời gian: UTC hay múi giờ Việt Nam | Đề xuất dùng ISO-8601 UTC |
| `/history` có trả `relays` không | Chưa quyết |
| Quy tắc nhận diện board online | Timeout heartbeat bao nhiêu giây |
