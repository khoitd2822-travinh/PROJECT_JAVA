# SwiftletCare — Hệ thống giám sát và điều khiển nhà yến thông minh

Hệ thống IoT cho nhà yến: đo vi khí hậu bằng ESP32, đếm chim và phát hiện thú hại
bằng camera + AI, điều khiển relay (quạt, phun sương, sưởi, còi) và hiển thị
trên web admin lẫn mobile app.

---

## Mục lục

- [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
- [Công nghệ dùng](#công-nghệ-dùng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Nạp firmware lên ESP32](#nạp-firmware-lên-esp32)
- [Kiểm thử](#kiểm-thử)
- [Tài liệu](#tài-liệu)
- [Đóng góp](#đóng-góp)

---

## Kiến trúc tổng quan

```
ESP32 (cảm biến + relay) ──MQTT──▶ EMQX ──▶ Spring Boot ──▶ TimescaleDB
      │                                   │            │  └──▶ Redis (cache)
      │                                   │            │  └──▶ WebSocket ──▶ Web Admin
      │                                   │            │  └──▶ MinIO (ảnh thú hại)
      │                                   │            │
      └────────────── ESP32-CAM ──────────┘            └──▶ Zalo / Telegram
                    (MJPEG stream)                            (cảnh báo)
```

Sơ đồ chi tiết: [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md)

---

## Công nghệ dùng

| Tầng | Công nghệ |
| :--- | :--- |
| Firmware | PlatformIO, ESP-IDF 5.x / Arduino Core 3.x, FreeRTOS, PubSubClient |
| Backend | Spring Boot 3.3, Java 21, Spring Data JPA, Spring Integration MQTT, WebSocket STOMP |
| Database | PostgreSQL 16 + TimescaleDB |
| Cache | Redis 7 |
| Storage | Zenko CloudServer (MinIO, tương thích S3) |
| Broker | EMQX 5.8 (MQTT 3.1.1) |
| Frontend | Next.js 14, React 18, TailwindCSS, Recharts, @stomp/stompjs |
| Mobile | React Native |
| AI | Python, YOLOv8n, ByteTrack, OpenCV |
| Hạ tầng | Docker Compose |

---

## Cấu trúc thư mục

```
PROJECT_JAVA/
├── BackEnd/                  # Backend Spring Boot
│   └── src/
│       ├── main/java/com/swiftletcare/backend/
│       │   ├── config/       # MqttConfig, RedisConfig, SecurityConfig, WebSocketConfig…
│       │   └── modules/      # auth, farm, actuation, telemetry, birdtracking, storage, notification
│       └── test/             # Test tích hợp (mục 13)
├── FrontEnd/                 # Web admin Next.js
├── MobileApp/                # Ứng dụng mobile React Native
├── ai/                       # Pipeline AI: YOLO + ByteTrack
├── firmware/
│   ├── esp32-main/           # Firmware board chính: cảm biến + relay
│   ├── esp32-cam/            # Firmware ESP32-CAM: stream MJPEG
│   └── tests/                # Script kiểm thử
│       ├── benchmark_latency.py
│       └── mock/mock_mqtt_broker.py   # MQTT giả lập, không cần board
├── docker/                   # Docker Compose + script khởi tạo DB
├── docs/                     # Tài liệu kỹ thuật
│   ├── api-spec.md
│   ├── mqtt-topics.md
│   ├── architecture/
│   ├── testing/
│   ├── hardware-schematic-bom.md
│   └── firmware-benchmark-report.md
└── .env.example              # Cấu hình mẫu — KHÔNG chứa mật khẩu thật
```

---

## Yêu cầu môi trường

| Công cụ | Phiên bản | Bắt buộc |
| :--- | :--- | :--- |
| Docker + Docker Compose | v24+ | Có |
| Java | 21 | Có (build backend) |
| Maven | 3.9+ | Có |
| Node.js | 20 LTS | Có (frontend) |
| Python | 3.10+ | Có (AI, script test) |
| PlatformIO | 6.1+ | Chỉ khi nạp firmware |
| ESP32 / ESP32-CAM | — | Chỉ khi nạp firmware thật |

> **Không bắt buộc**: nếu chỉ chạy test tích hợp với MQTT giả lập thì
> **không cần** board vật lý.

---

## Cài đặt và chạy

### Bước 1 — Khởi động hạ tầng

```bash
cp .env.example .env        # Windows: copy .env.example .env
# Sửa .env nếu cần đổi mật khẩu / port

docker compose up -d
```

Các container sẽ khởi động:

| Container | Port | Kiểm tra |
| :--- | :---: | :--- |
| `timescaledb` | 5432 | `docker exec -it timescaledb psql -U swiftlet -d swiftlet` |
| `redis` | 6379 | `docker exec -it redis redis-cli ping` → `PONG` |
| `emqx` | 1883, 18083 | `http://localhost:18083` (admin/public) |
| `minio` | 9000, 9001 | `http://localhost:9001` |

### Bước 2 — Chạy backend

```bash
cd BackEnd
./mvnw spring-boot:run     # Windows: .\mvnw.cmd spring-boot:run
```

Kiểm tra: `http://localhost:8080/api/v1/health` (nếu đã có endpoint health).

### Bước 3 — Chạy frontend

```bash
cd FrontEnd
npm install
npm run dev
```

Mở `http://localhost:3000`.

### Bước 4 — Chạy AI (tuỳ chọn)

```bash
cd ai
pip install -r requirements.txt
python capture_stream.py --source http://<IP-ESP32-CAM>:81/stream
```

### Bước 5 — Nạp firmware

Xem [Nạp firmware lên ESP32](#nạp-firmware-lên-esp32).

---

## Cấu hình môi trường

Tất cả thông tin nhạy cảm nằm trong `.env` (không commit). File `.env.example`
mô tả đầy đủ các biến cần thiết.

| Biến | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `DB_URL` | `jdbc:postgresql://localhost:5432/swiftlet` | JDBC URL TimescaleDB |
| `DB_USERNAME` | `swiftlet` | Tài khoản database |
| `DB_PASSWORD` | *(xem .env.example)* | Mật khẩu database |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis cache |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` | Địa chỉ EMQX |
| `MQTT_TENANT` | `thanhliem` | **Phải khớp với firmware** |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO endpoint |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | *(xem .env.example)* | Khoá S3 |
| `JWT_SECRET` | *(xem .env.example)* | Khoá ký JWT — **phải đổi ở môi trường thật** |
| `ZALO_OA_ACCESS_TOKEN` | *(trống)* | Token Zalo OA |

> ⚠️ **Lưu ý:** `MQTT_TENANT` và `MQTT_BROKER_URL` phải khớp **cả hai vế**
> (backend và firmware). Đổi một bên mà quên bên kia sẽ khiến telemetry
> không tới. Xem `docs/mqtt-topics.md`.

---

## Nạp firmware lên ESP32

```bash
# Board chính (cảm biến + relay)
cd firmware/esp32-main
pio run --target upload
pio device monitor

# ESP32-CAM (stream MJPEG)
cd firmware/esp32-cam
pio run --target upload
```

Cấu hình Wi-Fi và MQTT nằm trong `firmware/esp32-main/include/mqtt_config.h`
và `config.h`. Sửa tại đây rồi nạp lại.

Tham khảo thêm:
- Sơ đồ chân và BOM: [`docs/hardware-schematic-bom.md`](docs/hardware-schematic-bom.md)
- Mô phỏng Wokwi: `firmware/esp32-main/diagram.json`

> **Lưu ý an toàn khi nối mạch thật:**
> - Dây nguồn dương relay vào chân **COM**, tải nối **NO**; **không** nối GND vào cọc domino xanh.
> - MQ-135 cấp nguồn **5V ngoài**, không lấy từ chân 3V3 của ESP32.
> - Không cắm linh kiện vào GPIO 0 / GPIO 2 (bootloader) để tránh boot loop.

---

## Kiểm thử

### Test backend

```bash
cd BackEnd
./mvnw test
```

Bao phủ: telemetry (JSON sai, thiếu ID, thiếu số đo, nhiều khu vực, lỗi DB/Redis),
và các nhóm khác theo ma trận bên dưới.

### MQTT giả lập — không cần board

```bash
# Dựng broker ảo cục bộ (khi chưa bật Docker)
python firmware/tests/mock/mock_mqtt_broker.py --standalone --port 1883

# Phát telemetry
python firmware/tests/mock/mock_mqtt_broker.py --publish telemetry --count 10

# Kịch bản lỗi
python firmware/tests/mock/mock_mqtt_broker.py --scenario invalid
python firmware/tests/mock/mock_mqtt_broker.py --scenario missing_id
python firmware/tests/mock/mock_mqtt_broker.py --scenario missing_measurement
python firmware/tests/mock/mock_mqtt_broker.py --scenario multi_zone

# Xem danh sách topic
python firmware/tests/mock/mock_mqtt_broker.py --print-topics
```

### Đo độ trễ

```bash
python firmware/tests/benchmark_latency.py
```

Báo cáo kết quả: [`docs/firmware-benchmark-report.md`](docs/firmware-benchmark-report.md)

### Ma trận kiểm thử

[`docs/testing/test-matrix.md`](docs/testing/test-matrix.md) — liệt kê toàn bộ trường hợp
cần test (auth, phân quyền, telemetry, latest, history, điều khiển, mạng, FE, tích hợp)
kèm bước tái hiện và kỳ vọng.

---

## Tài liệu

| Tài liệu | Nội dung |
| :--- | :--- |
| [`docs/api-spec.md`](docs/api-spec.md) | REST API: request/response, mã lỗi, WebSocket |
| [`docs/mqtt-topics.md`](docs/mqtt-topics.md) | MQTT topic, payload, QoS, retained |
| [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md) | Sơ đồ hệ thống, luồng dữ liệu, rủi ro kiến trúc |
| [`docs/architecture/database-schema.md`](docs/architecture/database-schema.md) | Sơ đồ database, bảng, index, chính sách lưu giữ |
| [`docs/testing/test-matrix.md`](docs/testing/test-matrix.md) | Ma trận kiểm thử tích hợp + danh sách issue |
| [`docs/testing/demo-runbook.md`](docs/testing/demo-runbook.md) | Checklist bật/tắt hệ thống, kịch bản demo, Q&A |
| [`docs/hardware-schematic-bom.md`](docs/hardware-schematic-bom.md) | Sơ đồ chân ESP32/ESP32-CAM, BOM |
| [`docs/firmware-benchmark-report.md`](docs/firmware-benchmark-report.md) | Báo cáo đo độ trễ và độ bền kết nối |

---

## Đóng góp

1. Tạo nhánh riêng: `git checkout -b feature/<ten-tinh-nang>`
2. Commit rõ ràng: `git commit -m "feat(be): thêm API truy vấn lịch sử telemetry"`
3. Chạy test trước khi mở Pull Request
4. Cập nhật tài liệu liên quan trong `docs/`
5. **Không commit file bí mật** — dùng `.env`, không dùng `.env.example` chứa giá trị thật

> **Quy ước nhánh:** `main` là bản ổn định, `dev` là nhánh tích hợp.
> Phát triển cá nhân đặt trên nhánh riêng để nhóm trưởng review và merge.

---

## Nhóm phụ trách

| Thành viên | Vai trò |
| :--- | :--- |
| Nguyễn Gia Hiếu | TV1 — Firmware & Hardware |
| Đoàn Quang Vũ | TV2 — Edge Protocol & Network |
| Trầm Đồng Khởi | TV4/TV5 — CV Pipeline & Backend |
| Nguyễn Anh Kiệt | TV6 — Frontend |
| Nguyễn Hiệp Hòa | TV3 — AI Training |
| Nguyễn Thanh Liêm | Kiểm thử tích hợp, tài liệu, quy trình demo |
