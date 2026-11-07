# Demo Runbook — Quy trình demo & tài liệu vấn đáp

**Người lập:** Nguyễn Thanh Liêm (mục 13 — quy trình demo)
**Cập nhật:** 2026-11-06
**Dùng cho:** buổi demo trước giảng viên / trưởng nhóm

---

## 1. Phần thật / phần demo / phần chưa làm

> **Nguyên tắc khi demo:** luôn nói rõ phần nào chạy thật, phần nào là dữ liệu mô phỏng.
> Không trình bày dữ liệu giả như dữ liệu thật — đây là điểm bị góp ý nhiều nhất.

| Hạng mục | Phần thật | Phần mô phỏng | Chưa làm |
| :--- | :--- | :--- | :--- |
| Firmware telemetry | Đọc cảm biến thật qua I2C/ADC, publish MQTT | Nhánh `thanhliem` có fallback khi chưa có SHT31 | Chưa nối mic INMP441 (I2S) |
| Điều khiển relay | Firmware bật/tắt GPIO, phản hồi trạng thái | — | Chưa có ACK cấp nghiệp vụ (`commandId`) và timeout ở tầng BE |
| Backend telemetry | Ghi TimescaleDB + Redis | — | Chưa phân biệt rõ mới / cũ / offline |
| Backend auth | JWT + RBAC cơ bản | — | Chưa có `house_access` theo nhà yến |
| Frontend | Đọc telemetry qua MQTT, điều khiển relay | Nút bấm cập nhật React state khi chưa nối API | Chưa nối API điều khiển thật, nhãn "bình thường" còn viết cứng |
| AI | Pipeline YOLO + ByteTrack | Chạy trên video mẫu | Chưa đo sai số đếm so với đếm tay |
| Camera | ESP32-CAM phát stream MJPEG | Webcam laptop qua Flask | Chưa có luồng trực tiếp từ camera thật trong demo |
| Tài liệu | `mqtt-topics.md`, `hardware-schematic-bom.md`, `firmware-benchmark-report.md` | — | Đang bổ sung: API spec, sơ đồ hệ thống/DB |

---

## 2. Checklist khởi động hệ thống

Làm theo đúng thứ tự. Mỗi bước kiểm tra trước khi sang bước sau.

### 2.1. Hạ tầng

| Bước | Lệnh | Kỳ vọng |
| :--: | :--- | :--- |
| ☐ Container đang chạy | `docker compose ps` | Tất cả `Up` |
| ☐ Database sẵn sàng | `docker exec -it timescaledb psql -U swiftlet -d swiftlet -c "\dt"` | Có bảng `sensor_telemetry` |
| ☐ Hypertable đã tạo | `docker exec -it timescaledb psql -U swiftlet -d swiftlet -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"` | Có `sensor_telemetry` |
| ☐ Redis sẵn sàng | `docker exec -it redis redis-cli ping` | `PONG` |
| ☐ Broker sẵn sàng | Mở `http://localhost:18083` | Đăng nhập được, không lỗi |
| ☐ MinIO sẵn sàng | Mở `http://localhost:9001` | Đăng nhập được |

### 2.2. Backend

| Bước | Lệnh | Kỳ vọng |
| :--: | :--- | :--- |
| ☐ Build thành công | `cd BackEnd && ./mvnw clean package -DskipTests` | `BUILD SUCCESS` |
| ☐ Test tự động pass | `cd BackEnd && ./mvnw test` | `BUILD SUCCESS`, 0 failure |
| ☐ Backend khởi động | `./mvnw spring-boot:run` | Log `Started BackEndApplication` |
| ☐ Kết nối broker | Xem log | `MQTT client connected` |
| ☐ Kết nối database | Xem log | Không có lỗi HikariPool |
| ☐ Health check | `curl http://localhost:8080/api/v1/health` | HTTP 200 |

### 2.3. Firmware

| Bước | Lệnh | Kỳ vọng |
| :--: | :--- | :--- |
| ☐ Board đã nạp | `pio run --target upload` | Flash thành công |
| ☐ Board kết nối Wi-Fi | `pio device monitor` | Log `WiFi connected, IP: ...` |
| ☐ Board kết nối MQTT | `pio device monitor` | Log `MQTT connected` |
| ☐ Board đăng ký heartbeat | EMQX Dashboard → Clients | Thấy `ESP32_MAIN_01` online |
| ☐ Telemetry về broker | EMQX Dashboard → topic `.../telemetry` | Có gói tin JSON mỗi 2 giây |
| ☐ Relay bật/tắt được | Dùng lệnh test qua broker | Nghe tiếng relay, đèn LED đổi trạng thái |

### 2.4. Frontend

| Bước | Kỳ vọng |
| :--: | :--- |
| ☐ `npm install` chạy xong | Không lỗi dependency |
| ☐ `npm run dev` | Mở `http://localhost:3000` |
| ☐ Trang đăng nhập mở được | Form hiển thị, không lỗi console |
| ☐ Đăng nhập thành công | Vào được dashboard |
| ☐ Dashboard nhận số liệu | Giá trị thay đổi theo telemetry |
| ☐ Chọn nhà/tầng | Số liệu tải lại, không lẫn |

### 2.5. AI (nếu demo phần AI)

| Bước | Kỳ vọng |
| :--: | :--- |
| ☐ Model `best.pt` tồn tại | File có mặt, dung lượng > 0 |
| ☐ Dependency đầy đủ | `pip install -r ai/requirements.txt` không lỗi |
| ☐ Pipeline chạy | `python ai/capture_stream.py --source <url>` |
| ☐ Khung hình có bounding box | Vẽ đúng vật thể |
| ☐ FPS đo được | In ra FPS ổn định |

---

## 3. Checklist tắt hệ thống

Thứ tự ngược lại — tắt từ trên xuống để không mất dữ liệu chưa ghi.

| Bước | Lệnh | Ghi chú |
| :--: | :--- | :--- |
| ☐ Dừng frontend | `Ctrl+C` trong terminal | |
| ☐ Dừng AI service | `Ctrl+C` | |
| ☐ Dừng backend | `Ctrl+C` | Chờ log `Graceful shutdown` |
| ☐ Dừng firmware | `Ctrl+C` ở monitor | Board tự vào mô hình offline |
| ☐ Kiểm tra dữ liệu đã lưu | `SELECT count(*) FROM sensor_telemetry;` | Số mẫu > 0 |
| ☐ Dừng container | `docker compose down` | Giữ dữ liệu |
| ☐ (Tùy chọn) Xoá dữ liệu | `docker compose down -v` | Xoá toàn bộ dữ liệu |

---

## 4. Kịch bản demo chính (10 phút)

### Kịch bản A — Giới thiệu tổng quan (2 phút)

1. Mở `http://localhost:3000` → đăng nhập
2. Giới thiệu dashboard: số đo vi khí hậu, trạng thái thiết bị, khu vực
3. Chỉ vào sơ đồ hệ thống (`docs/architecture/system-architecture.md`) giải thích luồng dữ liệu

**Nói:** *"Số liệu đang hiển thị đến từ ESP32 thật qua MQTT, lưu TimescaleDB và đẩy lên giao diện bằng WebSocket."*

### Kịch bản B — Cảm biến thật (2 phút)

1. Che tay vào LDR → giá trị ánh sáng giảm dần
2. Thổi hơi ấm vào SHT30 → nhiệt độ tăng, độ ẩm giảm
3. Chỉ vào Serial Monitor để đối chiếu giá trị
4. Mở TimescaleDB, chạy:
   ```sql
   SELECT time, temperature, humidity, light_level
   FROM sensor_telemetry ORDER BY time DESC LIMIT 5;
   ```

**Nói:** *"Các giá trị này không có bước chuyển đổi nào ở tầng ứng dụng — mình đọc thẳng từ cảm biến."*

### Kịch bản C — Điều khiển relay (2 phút)

1. Từ dashboard bấm công tắc quạt → relay tiếng "cạch", đèn LED sáng
2. Kiểm tra topic `.../command` trên EMQX Dashboard
3. Chỉ vào trạng thái relay trên giao diện đổi theo
4. Tắt công tắc → relay nhả, LED tắt

### Kịch bản D — Tương tác với AI (2 phút)

1. Mở luồng camera trên dashboard
2. Chỉ ra bounding box quanh vật thể
3. Giới thiệu số đếm In/Out
4. Nếu có ảnh thú hại → chỉ ra cảnh báo và ảnh trong MinIO

**Nói rõ:** *"Video đang dùng luồng mô phỏng từ webcam; luồng từ ESP32-CAM thật đã có code nhưng ở phiên demo này chưa đưa vào."*

### Kịch bản E — Độ bền và phục hồi (2 phút)

1. Rút Wi-Fi (hoặc tắt router) → board báo mất mạng, LED nhấp nháy 1 Hz
2. Quan sát dashboard: dữ liệu cũ vẫn hiển thị kèm thời điểm nhận mẫu
3. Bật lại Wi-Fi → board tự kết nối lại trong ~10 giây
4. Số liệu tiếp tục cập nhật

**Nói:** *"Đây là kịch bản offline resiliency — đây là điểm mạnh của firmware so với phiên bản web-only."*

---

## 5. Kịch bản dự phòng khi có sự cố

| Sự cố | Dấu hiệu | Cách xử lý nhanh |
| :--- | :--- | :--- |
| Board không kết nối MQTT | Dashboard không đổi số | Kiểm tra broker còn sống; `pio device monitor` xem log; đảo bảo `MQTT_TENANT` khớp |
| Board không có IP | Log `WiFi connect failed` | Kiểm tra SSID/mật khẩu trong `config.h`; đảm bảo router cấp DHCP |
| Backend không khởi động | Lỗi kết nối DB | `docker compose ps`; kiểm tra `DB_PASSWORD` trong `.env` |
| Backend không nhận telemetry | Log không có `Lưu thành công Telemetry` | Kiểm tra topic trong `application.yaml` khớp `mqtt_config.h`; kiểm tra ACL broker |
| Số liệu không đổi | Redis có dữ liệu cũ | `redis-cli GET telemetry:latest:1:1`; TTL 5 phút |
| Frontend lỗi API | Console 401 | Token hết hạn → đăng nhập lại; kiểm tra `NEXT_PUBLIC_API_URL` |
| Không có ảnh thú hại | Không thấy ảnh | Kiểm tra bucket `swiftlet-alerts` tồn tại; URL presigned còn hạn |
| AI không nhận video | FPS = 0 | Kiểm tra URL stream; `cv2.VideoCapture(url)` trả `False` → sai URL |

---

## 6. Tài liệu vấn đáp (Q&A)

Câu hỏi thường gặp khi demo và cách trả lời.

### 6.1. Về kiến trúc

**Hỏi:** Vì sao dùng MQTT thay vì WebSocket cho thiết bị?
**Trả lời:** ESP32 chỉ hỗ trợ Wi-Fi và bộ nhớ hạn chế. MQTT chạy trên TCP với gói tin
nhỏ và có cơ chế Last Will để broker biết board offline. WebSocket phía server là
một chiều đẩy dữ liệu lên trình duyệt.

**Hỏi:** TimescaleDB khác PostgreSQL thường ở chỗ nào?
**Trả lời:** Hypertable chia bảng theo cột thời gian thành các chunk 7 ngày, nên
truy vấn một khoảng thời gian chỉ quét chunk liên quan. Với dữ liệu cảm biến
liên tục, đây là khác biệt lớn về hiệu năng.

**Hỏi:** Redis dùng làm gì khi đã có PostgreSQL?
**Trả lời:** Redis giữ số đo *mới nhất* để dashboard lấy trong vài mili giây thay
vì query DB. TTL 5 phút đồng thời là tín hiệu để biết dữ liệu đã cũ hay chưa.

### 6.2. Về firmware

**Hỏi:** Firmware tự điều khiển thế nào khi mất mạng?
**Trả lời:** Logic ngưỡng nằm trong firmware, không phụ thuộc server. Board vẫn đọc
cảm biến và đóng/ngắt relay theo `thresholds.h`. Phần server chỉ là giám sát và
điều khiển từ xa.

**Hỏi:** Vì sao dùng hysteresis cho relay?
**Trả lời:** Nếu bật/tắt ngay khi chạm ngưỡng, relay sẽ đóng mở liên tục quanh
ngưỡng và nhanh chóng hỏng. Hysteresis tạo vùng chết, cộng thêm khoảng thời gian
chuyển mạch tối thiểu 4 giây.

**Hỏi:** Reconnect dùng backoff thế nào?
**Trả lời:** Lũy thừa 2 giây rồi nhân đôi, tối đa 30 giây. Tránh việc cả nghìn
board đồng loạt reconnect làm sập broker.

**Hỏi:** Watchdog timer xử lý lỗi gì?
**Trả lời:** Khi firmware treo (vòng lặp chặn, deadlock), WDT tự reset board.
Kết hợp với Last Will, broker biết board offline và đánh dấu thiết bị offline.

### 6.3. Về điều khiển và an toàn

**Hỏi:** Nếu người dùng bấm bật relay khi board offline thì sao?
**Trả lời:** Phải trả `409 DEVICE_OFFLINE` và không báo thành công. Nguyên tắc là
**không được báo thành công khi thiết bị chưa xác nhận** — trạng thái yêu cầu
(`requestedState`) và trạng thái thiết bị xác nhận (`boardState`) là hai trường
khác nhau.

**Hỏi:** Gửi lệnh trùng thì sao?
**Trả lời:** Mỗi lệnh có `commandId` (UUID) làm khoá duy nhất. BE lưu lịch sử
lệnh nên lệnh trùng được nhận diện, không ghi trùng. Ngoài ra firmware có thể
dùng sequence để bỏ qua lệnh đã xử lý.

**Hỏi:** Vì sao `202 Accepted` mà không phải `200 OK`?
**Trả lời:** `202` nghĩa là "đã nhận và đang xử lý". Lệnh đã được đẩy xuống
ESP32 nhưng thiết bị chưa xác nhận, nên chưa thể trả `200`.

### 6.4. Về bảo mật

**Hỏi:** Phân quyền hoạt động thế nào?
**Trả lời:** JWT mang danh tính và vai trò (OWNER/ADMIN). BE kiểm tra quyền sở hữu
thiết bị trước khi trả dữ liệu lẫn khi điều khiển — đọc và ghi phải cùng một
quy tắc.

**Hỏi:** Token lưu ở đâu?
**Trả lời:** Hiện tại FE lưu trong `localStorage`. Hướng nâng cấp là chuyển sang
cookie `HttpOnly` chống XSS — nhưng khi đó phải thiết kế lại cả CSRF và CORS.
Đây là thay đổi cơ chế, không chỉ đổi chỗ lưu token.

**Hỏi:** MQTT có bảo mật không?
**Trả lời:** Hiện tại broker local chạy không xác thực để tiện cho môi trường dev.
Khi triển khai thật cần: tài khoản riêng cho từng thiết bị, ACL theo topic,
và TLS.

### 6.5. Về AI

**Hỏi:** Đếm chim độ chính xác bao nhiêu?
**Trả lời:** Hiện tại mình đánh giá bằng video đếm tay trên tập mẫu, và kết quả
đo được ghi trong báo cáo kiểm thử. Con số chính xác trên video thật của nhà yến
cần thêm dữ liệu — đây là phần đang được đo trong tuần 6.

**Hỏi:** ByteTrack dùng để làm gì?
**Trả lời:** Gán ID duy nhất cho mỗi vật thể qua các khung hình, để khi chim bay
qua lỗ cửa thì cộng dồn In/Out chính xác thay vì đếm lặp cùng một con.

### 6.6. Về kiểm thử

**Hỏi:** Hệ thống đã được kiểm thử thế nào?
**Trả lời:** Có ma trận test chia theo nhóm: auth, phân quyền, telemetry, latest,
history, điều khiển, mạng, frontend và tích hợp đầu-cuối. Mỗi dòng ghi rõ bước
tái hiện, kết quả mong đợi và kết quả thực tế.

**Hỏi:** Test được khi không có board thật?
**Trả lời:** Có. Mình viết một MQTT broker giả lập bằng Python và một bộ script
phát gói tin telemetry/command, nên toàn bộ kịch bản lỗi (JSON sai, thiếu ID,
thiếu số đo, nhiều khu vực) chạy được không cần phần cứng.

**Hỏi:** Những lỗi nào đã phát hiện?
**Trả lời:** Danh sách issue nằm trong `docs/testing/test-matrix.md`. Ví dụ điển hình:
`/latest` trả JSON chuỗi trong khi `/history` trả object; Redis hết hạn thì `/latest`
trả 404 dù DB còn lịch sử; và `ActuationService` tạo mới MQTT client mỗi lần gửi
lệnh nên dễ rò rỉ connection.
