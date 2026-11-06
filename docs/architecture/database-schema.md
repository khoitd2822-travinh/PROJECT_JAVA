# Sơ đồ database — SwiftletCare

**Người lập:** Nguyễn Thanh Liêm (mục 13 — tài liệu)
**Cập nhật:** 2026-11-06
**Cơ sở dữ liệu:** PostgreSQL 16 + TimescaleDB

> **Nguồn:** đối chiếu trực tiếp với
> `docker/timescaledb/init-scripts/01_init_hypertables.sql` và entity JPA
> `BackEnd/src/main/java/com/swiftletcare/backend/modules/telemetry/entity/SensorTelemetry.java`.
> Những bảng chưa có trong mã nguồn được đánh dấu `[chưa có]` — cần team thống nhất trước khi tạo.

---

## 1. Sơ đồ quan hệ

```
┌──────────────────────┐
│       users           │  (module auth — Khởi phụ trách)
│  id            PK    │
│  email         UQ    │
│  password_hash        │
│  full_name            │
│  role          OWNER│ADMIN
│  created_at           │
└──────────┬───────────┘
           │ 1
           │
           │ N
┌──────────┴───────────┐        ┌─────────────────────────┐
│   house_access       │        │  sensor_telemetry (TS)  │
│  user_id      FK ────┼──┐     │  time           PK      │
│  house_id     FK     │  │     │  device_id      PK      │
│  role                │  │     │  farm_id               │
└──────────┬───────────┘  │     │  zone_id               │
           │              │     │  temperature           │
           │ N            │     │  humidity              │
           │              │     │  co2_level             │
┌──────────┴───────────┐  │     │  light_level           │
│       houses          │  │     │  sound_db              │
│  id            PK    │  │     │  fan_state             │
│  name                │  │     │  mist_state            │
│  owner_id      FK ───┼──┘     │  heater_state          │
└──────────┬───────────┘        │  alarm_state           │
           │ 1                  └─────────────────────────┘
           │                              ▲
           │ N                            │ hypertable (chunk 7 ngày)
┌──────────┴───────────┐        ┌───────────┴─────────────┐
│        zones         │        │      devices            │  (module farm — Hiếu)
│  id            PK    │        │  id            PK       │
│  house_id      FK    │        │  zone_id       FK       │
│  name                │        │  device_id      UQ      │
│  location            │        │  device_type            │
└──────────┬───────────┘        │  status                 │
           │ 1                  └───────────┬─────────────┘
           │ N                              │
           │                                │ 1
┌──────────┴───────────┐        ┌───────────┴─────────────┐
│       devices        │        │  actuation_commands     │ [chưa có]
│  id            PK    │        │  id            PK       │
│  zone_id      FK    │        │  device_id     FK       │
│  device_id    UQ    │        │  command_id     UQ      │
│  device_type        │        │  target                │
│  status             │        │  requested_state        │
└──────────────────────┘        │  requested_mode        │
                                │  board_state            │
┌──────────────────────┐        │  board_mode             │
│   bird_tracking_log  │ [chưa có]│  status                │
│  id            PK    │        │  created_at             │
│  farm_id / zone_id   │        │  acked_at               │
│  camera_id           │        └─────────────────────────┘
│  count_in / count_out│
│  tracking_date       │        ┌─────────────────────────┐
│  created_at          │        │    threat_alerts         │ [chưa có]
└──────────────────────┘        │  id            PK       │
                                │  farm_id / zone_id      │
┌──────────────────────┐        │  camera_id              │
│   threat_alerts       │ [chưa có]│  type                 │
│  id            PK    │        │  severity              │
│  farm_id / zone_id   │        │  object_key            │
│  camera_id            │        │  message               │
│  type                 │        │  created_at             │
│  severity             │        └─────────────────────────┘
│  object_key           │
│  message              │
│  created_at           │
└──────────────────────┘
```

---

## 2. Bảng chi tiết

### 2.1 `sensor_telemetry` (TimescaleDB hypertable)

Nguồn: `docker/timescaledb/init-scripts/01_init_hypertables.sql`

| Cột | Kiểu | Null | Ghi chú |
| :--- | :--- | :---: | :--- |
| `time` | TIMESTAMPTZ | Không | **Phần khoá của hypertable** — thời điểm đo |
| `device_id` | VARCHAR(64) | Không | Phần khoá còn lại |
| `farm_id` | BIGINT | Có | Mặc định 1 |
| `zone_id` | BIGINT | Có | Mặc định 1 |
| `temperature` | DOUBLE PRECISION | Có | °C — `NULL` = chưa đo |
| `humidity` | DOUBLE PRECISION | Có | % |
| `co2_level` | INTEGER | Có | ppm |
| `light_level` | INTEGER | Có | 0–100 |
| `sound_db` | DOUBLE PRECISION | Có | dB |
| `fan_state` | BOOLEAN | Có | trạng thái relay quạt |
| `mist_state` | BOOLEAN | Có | trạng thái relay phun sương |
| `heater_state` | BOOLEAN | Có | trạng thái relay sưởi |
| `alarm_state` | BOOLEAN | Có | trạng thái relay còi |

**Khoá chính:** `(time, device_id)`

**Hypertable:** `create_hypertable('sensor_telemetry', 'time', chunk_time_interval => INTERVAL '7 days')`

**Index hiện có:**

| Index | Cột | Phục vụ truy vấn |
| :--- | :--- | :--- |
| `idx_telemetry_device_time` | `(device_id, time DESC)` | Lịch sử theo thiết bị |

**Index nên bổ sung:**

```sql
-- Truy vấn lịch sử theo khu vực (endpoint /history)
CREATE INDEX IF NOT EXISTS idx_telemetry_farm_zone_time
    ON sensor_telemetry (farm_id, zone_id, time DESC);

-- Truy vấn theo khoảng thời gian + thiết bị
CREATE INDEX IF NOT EXISTS idx_telemetry_time_device
    ON sensor_telemetry (time DESC, device_id);
```

> **Vấn đề:** endpoint `/history` lọc theo `farm_id`/`zone_id` nhưng index hiện tại
> không có hai cột này → quét toàn bảng. Đây là nguyên nhân khả dĩ của độ trễ
> truy vấn lịch sử khi chạy lâu.

### 2.2 `users`

| Cột | Kiểu | Ràng buộc |
| :--- | :--- | :--- |
| `id` | BIGSERIAL | PK |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL — lưu hash, không lưu mật khẩu thô |
| `full_name` | VARCHAR(255) | |
| `role` | VARCHAR(20) | `OWNER` \| `ADMIN` — dùng enum hoặc CHECK constraint |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

> **Rủi ro đã ghi nhận:** nhiều trường đang dùng `VARCHAR` tuỳ ý.
> Nên chuẩn hoá bằng `CHECK` constraint hoặc PostgreSQL `ENUM` cho `role`,
> `device_type` và các trường trạng thái.

### 2.3 `houses` / `zones` / `devices`

| Bảng | Cột chính | Ràng buộc |
| :--- | :--- | :--- |
| `houses` | `id` PK, `name`, `owner_id` FK → users | |
| `zones` | `id` PK, `house_id` FK → houses, `name`, `location` | |
| `devices` | `id` PK, `zone_id` FK → zones, `device_id` UNQ, `device_type`, `status` | `device_type` ∈ `FAN`\|`MIST`\|`HEATER`\|`ALARM` |

### 2.4 `house_access` (bảng nối quyền)

Cho phép một user được gán quyền vào nhiều nhà, không chỉ nhà mình sở hữu.

| Cột | Kiểu | Ràng buộc |
| :--- | :--- | :--- |
| `user_id` | BIGINT | FK → users |
| `house_id` | BIGINT | FK → houses |
| `role` | VARCHAR(20) | `OWNER` \| `ADMIN` |
| | | PK tổng hợp `(user_id, house_id)` |

### 2.5 `actuation_commands` `[chưa có]`

Bảng lịch sử lệnh — cần thiết để phân biệt *trạng thái yêu cầu* với *trạng thái board xác nhận*.

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | BIGSERIAL | PK |
| `command_id` | UUID | UNIQUE — khớp với `commandId` trong topic `command` |
| `device_id` | VARCHAR(64) | FK logic → devices |
| `target` | VARCHAR(20) | `mist`\|`fan`\|`heat`\|`alarm` |
| `requested_state` | SMALLINT | 0 hoặc 1 — trạng thái BE yêu cầu |
| `requested_mode` | VARCHAR(10) | `AUTO`\|`MANUAL` |
| `board_state` | SMALLINT | NULL cho tới khi ESP32 gửi ACK |
| `board_mode` | VARCHAR(10) | NULL cho tới khi ESP32 gửi ACK |
| `status` | VARCHAR(20) | `PENDING`\|`SUCCESS`\|`FAILED`\|`TIMEOUT` |
| `created_at` | TIMESTAMPTZ | |
| `acked_at` | TIMESTAMPTZ | NULL nếu chưa có ACK |

### 2.6 `bird_tracking_log` `[chưa có]`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | BIGSERIAL | PK |
| `farm_id` | BIGINT | |
| `zone_id` | BIGINT | |
| `camera_id` | VARCHAR(64) | |
| `count_in` | INTEGER | Số chim vào |
| `count_out` | INTEGER | Số chim ra |
| `tracking_date` | DATE | Ngày đếm |
| `created_at` | TIMESTAMPTZ | |

### 2.7 `threat_alerts` `[chưa có]`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | BIGSERIAL | PK |
| `farm_id` / `zone_id` | BIGINT | |
| `camera_id` | VARCHAR(64) | |
| `type` | VARCHAR(32) | `OWL`\|`SNAKE`\|`RAT` |
| `severity` | VARCHAR(16) | `INFO`\|`WARNING`\|`CRITICAL` |
| `object_key` | VARCHAR(512) | Khoá object trong MinIO — **không** lưu URL |
| `message` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

> Lưu `object_key` chứ không lưu URL presigned: URL có thời hạn, lưu lại sẽ hết hạn.

---

## 3. Quy mô dữ liệu và chính sách lưu giữ

| Chỉ số | Giá trị |
| :--- | :--- |
| Chu kỳ gửi telemetry | 2 giây / board |
| Số mẫu mỗi ngày | 43.200 / board |
| Số mẫu mỗi tháng | ~1,3 triệu / board |
| Chunk hypertable | 7 ngày |
| TTL cache Redis | 5 phút |

**Khuyến nghị chính sách lưu giữ:**

| Loại dữ liệu | Giữ | Ghi chú |
| :--- | :--- | :--- |
| Telemetry thô | 30 ngày | Chi tiết để phân tích |
| Telemetry gom theo giờ | 1 năm | Giảm 30 lần dung lượng |
| Lịch sử lệnh | 1 năm | Truy vết vận hành |
| Ảnh thú hại | 90 ngày | Rẻ nhất trong S3 |

```sql
-- Gom mẫu theo giờ, giữ 1 năm
CREATE MATERIALIZED VIEW sensor_telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket,
       farm_id, zone_id, device_id,
       avg(temperature) AS avg_temp,
       avg(humidity)    AS avg_hum,
       avg(co2_level)   AS avg_co2,
       max(light_level) AS max_light
FROM sensor_telemetry
GROUP BY bucket, farm_id, zone_id, device_id;

SELECT add_retention_policy('sensor_telemetry', INTERVAL '30 days');
SELECT add_retention_policy('sensor_telemetry_hourly', INTERVAL '365 days');
```

---

## 4. Kiểm tra hypertable

Sau khi khởi động `docker compose up -d timescaledb`, kiểm tra:

```sql
-- Bảng đã được tạo hypertable chưa?
SELECT hypertable_name FROM timescaledb_information.hypertables;
-- Kỳ vọng: sensor_telemetry

-- Các chunk đã tạo
SELECT * FROM timescaledb_information.chunks WHERE hypertable_name = 'sensor_telemetry';

-- Index hiện có
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sensor_telemetry';
```

Nếu `hypertable_name` trả về rỗng, nghĩa là `ddl-auto: update` của Hibernate đã
tạo bảng trước khi script init chạy, hoặc script init chưa được mount đúng
vào `/docker-entrypoint-initdb.d/`.

---

## 5. Vấn đề cần xử lý

| # | Vấn đề | Mức độ | Người phụ trách |
| ---: | :--- | :---: | :--- |
| 1 | `ddl-auto: update` — không có migration kiểm soát | Cao | Khởi |
| 2 | Chưa xác nhận hypertable được tạo trên DB thật | Cao | Khởi |
| 3 | Thiếu index `(farm_id, zone_id, time)` | Cao | Khởi + Quang Vũ |
| 4 | Chưa có bảng lịch sử lệnh | Cao | Hiếu + Khởi |
| 5 | `role`/`device_type` dùng VARCHAR tự do | Trung bình | Khởi |
| 6 | Chưa có chính sách lưu giữ và backup | Trung bình | Khởi |
| 7 | Thiếu `command_history` / nhật ký thao tác | Trung bình | Hiếu |
| 8 | Chưa có gom mẫu theo giờ | Trung bình | Quang Vũ |
