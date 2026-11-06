# Ma trận kiểm thử tích hợp — Mục 13

**Phụ trách:** Nguyễn Thanh Liêm
**Phạm vi:** kiểm chứng toàn bộ mục 1–12 của bảng phân công nhiệm vụ
**Trạng thái:** `draft` — mỗi dòng được cập nhật khi có bằng chứng chạy thật

> **Lần chạy gần nhất:** 2026-11-06 18:18 — `python firmware/tests/run_integration_tests.py`
> → **4/4 bước đạt**, 42/42 test backend pass.
> Báo cáo: `docs/testing/evidence/run-2026-11-06-1818.md`

## Quy ước

| Ký hiệu | Ý nghĩa |
| :--- | :--- |
| `PASS` | Đã chạy và đạt kỳ vọng |
| `FAIL` | Đã chạy và không đạt — xem "Ghi chú / lỗi" |
| `BLOCKED` | Chưa chạy được vì phần khác chưa xong (ghi rõ lý do) |
| `TODO` | Chưa viết test |

Bằng chứng lưu ở `docs/testing/evidence/`. Mỗi lần chạy test ghi lại:
- Lệnh đã chạy
- Kết quả mong đợi
- Kết quả thực tế
- Log hoặc ảnh chụp

## 1. Môi trường kiểm thử

| Thành phần | Công cụ | Ghi chú |
| :--- | :--- | :--- |
| Broker MQTT | EMQX 5.8.6 (Docker) hoặc `firmware/tests/mock/mock_mqtt_broker.py --standalone` | Bản mock dùng khi không bật Docker |
| Backend | Spring Boot 3.3.4 / Java 21 | `BackEnd/` |
| Database | PostgreSQL 16 + TimescaleDB | Hypertable `sensor_telemetry` |
| Cache | Redis 7-alpine | Key `telemetry:latest:{farmId}:{zoneId}` |
| Storage | Zenko CloudServer (S3) | Port 9000 |
| Frontend | Next.js 14.2.35 | `npm run dev` |
| Test tự động | JUnit 5 + Mockito (`spring-boot-starter-test`) | `BackEnd/src/test/` |

### Lệnh chạy

```bash
# Test backend
cd BackEnd && ./mvnw test

# Test MQTT giả lập không cần board
python firmware/tests/mock/mock_mqtt_broker.py --standalone --port 1883
python firmware/tests/mock/mock_mqtt_broker.py --publish telemetry --count 10
python firmware/tests/mock/mock_mqtt_broker.py --scenario invalid

# Đo độ trễ (Tuần 6)
python firmware/tests/benchmark_latency.py
```

---

## 2. Ma trận test theo nhóm

### 2.1 Auth — đăng ký / đăng nhập

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| A1 | Email trùng | Đăng ký 2 lần cùng email | Lần 2 báo lỗi, không tạo user thứ hai | `TODO` | |
| A2 | Email sai định dạng | `POST /auth/register` với email không hợp lệ | 400, không tạo user | `TODO` | |
| A3 | Mật khẩu sai | Đăng nhập sai mật khẩu | 401, thông báo chung, không lộ user tồn tại | `TODO` | |
| A4 | Token hết hạn | Dùng token đã hết hạn gọi API | 401, FE đưa về màn hình đăng nhập | `TODO` | |
| A5 | Không có token | Gọi API không kèm Authorization | 401 | `TODO` | |
| A6 | "Ghi nhớ đăng nhập" | Bật/tắt checkbox | Hoạt động đúng hoặc đã bỏ hẳn khỏi giao diện | `TODO` | |
| A7 | Logout | Đăng nhập rồi logout | Token bị thu hồi/quyền truy cập bị chặn | `TODO` | |

### 2.2 Phân quyền

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| P1 | User A xem thiết bị của user B | Đăng nhập A, gọi API thiết bị của B | 403 hoặc 404, không trả dữ liệu | `TODO` | |
| P2 | User A điều khiển thiết bị của B | Gọi `POST /api/v1/actuation/override` với thiết bị của B | 403, thiết bị không đổi trạng thái | `TODO` | |
| P3 | Role OWNER quản lý được | OWNER thao tác trên nhà của mình | 200 | `TODO` | |
| P4 | Role ADMIN quản trị được | ADMIN gọi API quản trị | 200 | `TODO` | |
| P5 | Quyền theo nhà/tầng | Chuyển nhà/tầng, kiểm tra dữ liệu không lẫn | Chỉ thấy dữ liệu của khu vực đang chọn | `TODO` | |

### 2.3 Telemetry

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| T1 | JSON sai định dạng | `--scenario invalid` | BE log lỗi, không ghi DB, không crash | `PASS` | `TelemetryProcessingServiceTest.shouldIgnoreMalformedJson` |
| T2 | JSON sai kiểu (`[]`, `null`, số) | `--scenario invalid` | Bị từ chối, không ghi DB | `PASS` | `shouldIgnoreWrongJsonType` |
| T3 | Thiếu `deviceId` | `--scenario missing_id` | Dùng giá trị mặc định, ghi đúng khu vực | `PASS` | `shouldFallbackDeviceIdWhenMissing` |
| T4 | Thiếu số đo | `--scenario missing_measurement` | Số đo thiếu giữ `null`, không bịa thành 0 | `PASS` | `shouldNotFabricateMissingMeasurements` |
| T5 | Nhiều khu vực | `--scenario multi_zone` | Mỗi farm/zone một bản ghi và một key Redis | `PASS` | `shouldUseSeparateRedisKeyPerFarmZone` |
| T6 | Payload đúng chuẩn firmware | Publish telemetry thật | Parse thành công, đủ trường | `PASS` | `shouldParseFirmwarePayload` |
| T7 | Lỗi database | Tắt TimescaleDB rồi publish | Không ghi cache, service không crash | `PASS` | `shouldNotCacheWhenDatabaseFails` |
| T8 | Lỗi Redis | Tắt Redis rồi publish | Bản ghi DB vẫn còn, service không crash | `PASS` | `shouldKeepDatabaseRecordWhenRedisFails` |

### 2.4 Latest — `/api/v1/telemetry/latest`

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| L1 | Redis có mẫu | Publish telemetry rồi gọi API | Trả object JSON đúng cấu trúc | `TODO` | |
| L2 | Redis hết hạn | Đợi hết TTL 5 phút | Trả 404 nếu DB không có, không trả dữ liệu rác | `TODO` | |
| L3 | Lỗi Redis | Tắt Redis | Trả lỗi rõ ràng, không 500 im lặng | `TODO` | |
| L4 | Dữ liệu cũ | Redis hết hạn nhưng DB còn | Phải phân biệt "mới" / "cũ" / "offline" | `TODO` | |
| L5 | `/latest` và `/history` cùng tên trường | So sánh response | Cùng một hợp đồng (`temp`/`hum`) | `TODO` | |

### 2.5 History — `/api/v1/telemetry/history`

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| H1 | Range sai | Truyền `from > to` | 400 với thông báo rõ | `TODO` | |
| H2 | Range quá lớn | Truyền khoảng 1 năm | Bị từ chối hoặc giới hạn | `TODO` | |
| H3 | Thứ tự dữ liệu | So sánh `time` tăng dần | Đúng thứ tự thời gian | `TODO` | |
| H4 | Không có dữ liệu | Truyền khu vực chưa có bản ghi | Trả mảng rỗng, không lỗi | `TODO` | |
| H5 | Phân trang | Trang quá số bản ghi | Có phân trang hoặc giới hạn rõ ràng | `TODO` | |

### 2.6 Điều khiển (actuation)

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| C1 | ID sai | Truyền `deviceId` không tồn tại | 404/400, không báo thành công | `TODO` | |
| C2 | Command sai | Gửi `command` lạ | 400, không ép về OFF | `PASS` | `ActuationCommandContractTest.shouldRejectUnknownCommand` — hợp đồng đã chốt; service thật do Hiếu viết |
| C3 | Board offline | Firmware ngắt kết nối rồi gửi lệnh | Không báo thành công, có timeout | `TODO` | |
| C4 | ACK timeout | Firmware không phản hồi | BE trả trạng thái timeout, không giữ "đang gửi" mãi | `TODO` | |
| C5 | Gửi trùng | Gửi cùng lệnh 2 lần | Có `commandId`/sequence, không ghi trùng | `PASS` | `shouldKeepCommandIdWhenRetried` — commandId giữ nguyên qua vòng lặp retry |
| C6 | Thiếu quyền | User B điều khiển thiết bị của A | 403 | `TODO` | |
| C7 | Target không hỗ trợ | Gửi `target` lạ | 400, có danh sách target hợp lệ | `PASS` | `shouldRejectInvalidTargets` — 5 target hợp lệ, target lạ bị từ chối |
| C8 | State không hợp lệ | Gửi `state` = 2 hoặc -1 | 400, không ép về OFF | `PASS` | `shouldRejectInvalidState` |
| C9 | Phân biệt trạng thái | Board chưa ACK | `boardState` = null, `status` = PENDING | `PASS` | `shouldSeparateRequestedStateFromBoardState` |

### 2.7 Mạng và phục hồi

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| N1 | ESP32 mất Wi-Fi | Tắt router | Firmware tự điều khiển, LED nhấp nháy 1 Hz | `PASS` | `docs/firmware-benchmark-report.md` |
| N2 | ESP32 mất MQTT | Tắt broker | Backoff tăng dần 2s → 30s, tự kết nối lại | `PASS` | `docs/firmware-benchmark-report.md` |
| N3 | Broker restart | `docker compose restart emqx` | Firmware kết nối lại trong < 10 s | `TODO` | |
| N4 | BE restart | `docker compose restart backend` | Client kết nối lại, không mất dữ liệu đã ghi | `TODO` | |
| N5 | Board offline (heartbeat) | Firmware ngắt kết nối | FE hiện offline dựa trên heartbeat, không phải nhãn viết cứng | `TODO` | |

### 2.8 Frontend

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| F1 | Tải lần đầu | Mở dashboard | Có trạng thái loading | `TODO` | |
| F2 | Lỗi API | Tắt backend | Có trạng thái error, không trắng trơ | `TODO` | |
| F3 | Dữ liệu cũ | Redis hết hạn | Hiện "stale" + thời điểm nhận mẫu, không báo "bình thường" | `TODO` | |
| F4 | Đổi nhà/tầng | Chọn khu vực khác | Tải lại dữ liệu, hủy request cũ | `TODO` | |
| F5 | Đăng ký / đăng nhập | Thao tác qua giao diện | Luồng chạy đúng, hiện lỗi rõ ràng | `TODO` | |
| F6 | Công tắc điều khiển | Bấm nút relay | Trạng thái lấy từ ESP32 báo về, có trạng thái đang gửi | `TODO` | |

### 2.9 Tích hợp đầu-cuối

| # | Trường hợp | Bước tái hiện | Kỳ vọng | Kết quả | Ghi chú |
| ---: | :--- | :--- | :--- | :--- | :--- |
| E1 | MQTT → DB → Redis → API → UI | Publish telemetry, mở dashboard | Số liệu hiển thị khớp gói tin vừa gửi | `TODO` | |
| E2 | MQTT → command → ACK | Gửi lệnh relay, quan sát response | Firmware phản hồi ACK trên topic `response` | `TODO` | |
| E3 | Độ trễ end-to-end | Đo từ publish đến lúc UI đổi số | < 2 giây | `TODO` | |
| E4 | AI đếm chim | Chạy pipeline trên video mẫu | Số đếm khớp đếm tay, ghi log, broadcast cho FE | `TODO` | |

---

## 3. Danh sách issue đã ghi nhận

| # | Mô tả | Bước tái hiện | Kỳ vọng | Thực tế | Mức độ | Trạng thái |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| I1 | `docs/api-spec.md` rỗng trong mọi nhánh | `git cat-file -s origin/main:docs/api-spec.md` | Có nội dung | 0 bytes | Cao | Đã ghi nhận |
| I2 | `README.md` chỉ 93 byte, lỗi encoding | Mở `README.md` | Hướng dẫn chạy đầy đủ | "MĂ´n Láº­p trĂ­nh Java" | Cao | Đã ghi nhận |
| I3 | Thiếu `.env.example` | `git ls-files \| grep env` | Có cấu hình mẫu | Không có | Trung bình | Đã ghi nhận |
| I4 | File tự sinh bị commit | `git ls-files` | Chỉ file cần thiết | `thu.txt`, `extracted_plan.txt`, `build_log.txt` | Trung bình | **Đã xử lý** — untrack + thêm `.gitignore`, file vẫn còn trên đĩa |
| I5 | `main` bị force-push về lùi | `git reflog show origin/main` | PR #11, #12 còn trong `main` | `forced-update` về `80dd8b7` | Cao | Đã ghi nhận |
| I6 | Firmware `dev` hardcode Wi-Fi và topic 4 đoạn | `git show origin/dev:firmware/esp32-main/src/main.cpp` | Cấu hình tách riêng | Hardcode SSID + topic cũ | Cao | Đã ghi nhận |
| I7 | `mvn test` không chạy được khi không bật Docker | `cd BackEnd && ./mvnw test` | Test chạy được độc lập hạ tầng | `contextLoads()` fail vì thiếu PostgreSQL | Trung bình | **Đã xử lý** — dùng H2 in-memory + mock bean MQTT |
| I8 | Không có công cụ test MQTT không cần board | `python firmware/tests/mock/mock_mqtt_broker.py --standalone` | Broker ảo chạy được | Không có | Cao | **Đã xử lý** — `firmware/tests/mock/mock_mqtt_broker.py` |

---

## 4. Phần thật / phần demo / phần chưa làm

| Hạng mục | Phần thật | Phần mô phỏng (demo) | Chưa làm |
| :--- | :--- | :--- | :--- |
| Firmware telemetry | Đọc cảm biến thật qua I2C/ADC | Nhánh `thanhliem` có fallback khi chưa có SHT31 | Chưa nối mic INMP441 I2S |
| Điều khiển relay | Tạo phản hồi ACK trên topic `response` | Chưa có ACK cấp nghiệp vụ (`commandId`) | Chưa có timeout ở tầng BE |
| Backend telemetry | Ghi TimescaleDB + Redis | — | Chưa có phân biệt mới/cũ/offline |
| Frontend | Đọc telemetry qua MQTT, điều khiển relay | Nút bấm cập nhật React state | Chưa nối API điều khiển thật |
| AI | Pipeline YOLO + ByteTrack | Chạy trên video mẫu | Chưa đo sai số đếm so với đếm tay |
| Tài liệu | `mqtt-topics.md`, `hardware-schematic-bom.md`, `firmware-benchmark-report.md` | — | Thiếu API spec, sơ đồ hệ thống/DB, kịch bản demo |
