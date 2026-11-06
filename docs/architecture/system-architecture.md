# Sơ đồ hệ thống — SwiftletCare

**Người lập:** Nguyễn Thanh Liêm (mục 13 — tài liệu)
**Cập nhật:** 2026-11-06

---

## 1. Tổng quan

Hệ thống giám sát và điều khiển nhà yến thông minh, gồm 5 tầng:

```
┌──────────────────────────────────────────────────────────────────────┐
│  TẦNG 5 — GIAO DIỆN                                                  │
│  ┌────────────────────┐  ┌────────────────────┐  ┌───────────────┐  │
│  │  Web Admin         │  │  Mobile App        │  │  ESP32-CAM    │  │
│  │  (Next.js 14)      │  │  (React Native)    │  │  WebServer    │  │
│  └─────────┬──────────┘  └─────────┬──────────┘  └───────┬───────┘  │
└────────────┼───────────────────────┼─────────────────────┼──────────┘
             │ REST + STOMP          │ REST + STOMP       │ HTTP/MJPEG
┌────────────┼───────────────────────┼─────────────────────┼──────────┐
│  TẦNG 4 — BACKEND (Spring Boot 3.3, Java 21)                       │
│  ┌──────────┴────────┐ ┌────────────┐ ┌───────────┐ ┌────────────┐ │
│  │  Auth / Security  │ │  Telemetry │ │ Actuation │ │BirdTracking│ │
│  │  JWT + RBAC       │ │  + History │ │ + Command │ │  + Alerts  │ │
│  └──────────┬────────┘ └─────┬──────┘ └─────┬─────┘ └──────┬─────┘ │
│             │                │              │              │        │
│  ┌──────────┴────────────────┴──────────────┴──────────────┴─────┐  │
│  │  WebSocket STOMP broadcaster (WebSocketBroadcaster)            │  │
│  └─────────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────┐
│  TẦNG 3 — BUS / MESSAGE BROKER                                    │
│  ┌─────────────────────────────┴──────────────────────────────┐   │
│  │  EMQX 5.8 (MQTT 3.1.1)   port 1883                        │   │
│  │  Topic: swiftlet/{tenant}/{farmId}/{zoneId}/{deviceId}/…   │   │
│  └──────────────┬──────────────────────────┬───────────────────┘   │
└─────────────────┼──────────────────────────┼───────────────────────┘
                  │ publish telemetry          │ subscribe command
                  │ + status/heartbeat          │
┌─────────────────┼──────────────────────────┼───────────────────────┐
│  TẦNG 2 — EDGE / FIRMWARE (ESP32)                                 │
│  ┌──────────────┴───────────────┐  ┌───────────────────────────┐   │
│  │  ESP32 MAIN (TV1/Hiếu)      │  │  ESP32-CAM (TV2)           │   │
│  │  ├ SHT30  → I2C GPIO21/22   │  │  ├ Camera OV2640           │   │
│  │  ├ MQ-135 → ADC GPIO35      │  │  ├ Wi-Fi STA                │   │
│  │  ├ LDR    → ADC GPIO34      │  │  └ HTTP MJPEG :81/stream   │   │
│  │  ├ Mic INMP441 → I2S        │  └───────────────────────────┘   │
│  │  └ Relay x4 → GPIO 26/27/… │                                    │
│  │  ├ Auto-reconnect (backoff) │                                    │
│  │  ├ Watchdog (WDT)           │                                    │
│  │  └ Local hysteresis control │                                    │
│  └─────────────────────────────┘                                    │
└────────────────────────────────────────────────────────────────────┘
                  │ publish telemetry / ACK
┌─────────────────┼──────────────────────────────────────────────────┐
│  TẦNG 1 — LƯU TRỮ                                                  │
│  ┌──────────────┴───────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │  TimescaleDB         │ │  Redis       │ │  MinIO (S3)        │  │
│  │  hypertable          │ │  latest cache│ │  ảnh thú hại      │  │
│  │  sensor_telemetry    │ │  TTL 5 phút  │ │  presigned URL     │  │
│  │  chunk 7 ngày        │ │              │ │                    │  │
│  └──────────────────────┘ └──────────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Luồng dữ liệu chính

### 2.1 Telemetry (ESP32 → giao diện)

```
ESP32                    EMQX                 Backend              Frontend
  │                        │                     │                     │
  │ publish telemetry      │                     │                     │
  │ topic: …/telemetry ───▶│                     │                     │
  │  {temp,hum,co2,…}      │──── subscribe ─────▶│                     │
  │                        │                     │ parse JSON          │
  │                        │                     │ ghi TimescaleDB      │
  │                        │                     │ ghi Redis (TTL 5m)   │
  │                        │                     │──── WebSocket ─────▶│
  │                        │                     │  (STOMP topic)      │
  │                        │                     │                     │ render
```

**Điểm cần chú ý:**
- `measuredAt` (lúc ESP32 đo) khác `receivedAt` (lúc BE nhận) → dùng để đo độ trễ.
- Dữ liệu trong Redis có TTL 5 phút. Hết TTL mà DB vẫn còn → trạng thái `STALE`, không phải `ONLINE`.
- Board offline được suy ra từ **heartbeat**, không từ nhãn viết cứng phía FE.

### 2.2 Điều khiển relay (giao diện → ESP32)

```
FrontEnd                  Backend              EMQX                 ESP32
  │                        │                     │                     │
  │ POST /actuation/override                    │                     │
  │ {deviceId,target,state,mode}                │                     │
  │───────────────────────▶│ validate ID/command/quyền               │
  │                        │ tạo commandId                            │
  │  202 Accepted          │──── publish command ──▶│                  │
  │  {status:"PENDING",    │  topic: …/command      │                  │
  │   boardState:null}     │                     │──── subscribe ─────▶│
  │                        │                     │      bật/tắt relay │
  │                        │◀─── ACK /response ───│◀──── publish ──────│
  │                        │  {status:"SUCCESS",   │                     │
  │◀── WebSocket cập nhật ─│   state:1,            │                     │
  │  {boardState:1,        │   executionTimeMs:3}  │                     │
  │   status:"SUCCESS"}    │                     │                     │
```

**Quy tắc bất di bất dịch:** không bao giờ báo thành công khi board chưa xác nhận.
`requestedState` (trạng thái yêu cầu) và `boardState` (trạng thái thiết bị xác nhận)
là hai trường khác nhau.

### 2.3 AI đếm chim & cảnh báo thú hại

```
ESP32-CAM ──HTTP/MJPEG──▶ AI Edge Service (Python, YOLO + ByteTrack)
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             đếm In/Out     ảnh snapshot   MQTT alert
                    │              │              │
                    ▼              ▼              ▼
             publish count   MinIO upload   → BE → DB
                                  │              │
                                  ▼              ▼
                           presigned URL    WebSocket → FE
```

---

## 3. Phân tách nhà / tầng / thiết bị

```
User ──(quyền OWNER/ADMIN)──▶ House (nhà yến) ──▶ Zone (tầng/khu vực) ──▶ Device
                                        │
                                        └── Zone ──▶ Device
```

- Mỗi `Device` thuộc đúng một `Zone`, mỗi `Zone` thuộc đúng một `House`.
- Topic MQTT nhúng `farmId` và `zoneId` → BE có thể đối chiếu topic với payload.
- Người dùng chỉ thấy và điều khiển được thiết bị trong nhà mình có quyền.
- Hai nhà khác nhau **không được** điều khiển chung một board.

---

## 4. Cổng và dịch vụ

| Dịch vụ | Cổng | Vai trò |
| :--- | :---: | :--- |
| EMQX (MQTT) | 1883 | Broker MQTT — telemetry, command, ACK |
| EMQX (WebSocket/MQTT) | 8083 | Client MQTT qua WebSocket (nếu dùng) |
| EMQX Dashboard | 18083 | Quản trị broker |
| Backend Spring Boot | 8080 | REST API + WebSocket STOMP |
| Frontend Next.js | 3000 | Web Admin |
| PostgreSQL + TimescaleDB | 5432 | Dữ liệu lịch sử |
| Redis | 6379 | Cache số đo mới nhất |
| MinIO (S3) | 9000 / 9001 | Ảnh thú hại, console 9001 |
| ESP32-CAM stream | 81 | HTTP MJPEG |

---

## 5. Cơ chế phục hồi

| Sự cố | Cơ chế xử lý | Vị trí hiện thực |
| :--- | :--- | :--- |
| ESP32 mất Wi-Fi | Reconnect có backoff luỹ thừa 2s → 30s | `firmware/esp32-main/src/main.cpp` |
| ESP32 treo | Watchdog timer (WDT) tự reset | `firmware/esp32-main/src/main.cpp` |
| Mất broker | Backoff + Last Will để broker biết board offline | `firmware/esp32-main/src/main.cpp` |
| Broker restart | Firmware tự kết nối lại, BE subscribe lại | `docs/firmware-benchmark-report.md` |
| BE restart | Client kết nối lại; dữ liệu đã ghi trong DB không mất | TimescaleDB |
| Redis hết dữ liệu | `/latest` đọc fallback từ DB, trả kèm cờ `stale` | Xem ma trận test L2 |

---

## 6. Rủi ro kiến trúc đã biết

| # | Rủi ro | Ảnh hưởng | Khuyến nghị |
| ---: | :--- | :--- | :--- |
| 1 | `ActuationService` tự tạo/disconnect MQTT client mỗi lần gửi lệnh | Rò rỉ connection, tranh chấp client ID | Dùng một connection dùng chung quản lý tập trung |
| 2 | Firmware publish QoS 0 | Mất gói tin khi mạng chập chờn | Chuyển QoS 1 cho command, hoặc bù bằng sequence ID |
| 3 | 43.200 mẫu telemetry/ngày/board | `/history` nặng nếu không gom mẫu | Bắt buộc có `bucket` + `limit` + index phù hợp |
| 4 | `ddl-auto: update` | Schema không kiểm soát được | Dùng Flyway/Liquibase, có script migration |
| 5 | Chưa có migration cho hypertable | Schema DB có thể lệch code | Kiểm tra hypertable thật, áp migration rõ ràng |
| 6 | Chưa có index theo `farm_id, zone_id, time` | Truy vấn lịch sử chậm | Bổ sung index và kiểm tra kế hoạch truy vấn |
| 7 | Chưa có bảng lịch sử lệnh | Không truy vết được điều khiển | Thêm bảng lệnh + nhật ký thao tác |
| 8 | WebSocket chưa có phân quyền subscription | Rò rỉ dữ liệu giữa các nhà | Xác thực và kiểm tra quyền khi subscribe |
| 9 | MQTT chưa có ACL theo topic và TLS | Board đổi được nhà | Thêm tài khoản riêng + ACL + TLS khi triển khai |
| 10 | Ảnh thú hại lưu lâu không có chính sách | Phình ổ đĩa | Chính sách lưu giữ + backup tự động |

---

## 7. Sơ đồ database

Chi tiết bảng, cột, index và câu SQL khởi tạo: `docs/architecture/database-schema.md`
