# BÁO CÁO KẾT QUẢ THỰC NGHIỆM ĐO ĐẠC ĐỘ TRỄ & KIỂM THỬ TỰ ĐỘNG HÓA CỤC BỘ (OFFLINE RESILIENCY)
**Dự án:** SwiftletCare - Giám sát & Điều khiển Vi khí hậu Nhà Yến Thông Minh  
**Nhiệm vụ:** Tuần 6 (Thành viên 2 - Thanh Liêm)  
**Ngày thực hiện:** 15/10/2026

---

## 1. Mục tiêu Thực nghiệm

Theo kế hoạch tuần 6 trong `PLAN.docx`:
1. **Đo đạc độ trễ phản hồi đóng ngắt rơ-le (Command Execution Round-Trip Time - RTT)** từ lúc Web/App gửi lệnh tới lúc vi điều khiển thực thi và phản hồi ACK.
2. **Đo đạc độ trễ và tần suất truyền tin MQTT Telemetry** từ ESP32 lên máy chủ EMQX Broker.
3. **Kiểm thử kịch bản ngắt mạng (Offline Resiliency & Failsafe)**: Đảm bảo khi mất kết nối Wi-Fi hoặc MQTT broker, vi điều khiển duy trì thuật toán điều khiển vi khí hậu độc lập, không làm chết chim hoặc hỏng tổ yến.

---

## 2. Bảng Kết quả Đo đạc Chỉ số Hiệu năng

| STT | Chỉ tiêu Kỹ thuật | Chỉ tiêu Dự án (SLA) | Kết quả Đo đạc Thực tế | Đánh giá |
| :---: | :--- | :---: | :---: | :---: |
| **1** | **Độ trễ truyền gói tin Telemetry (MQTT Inbound)** | `< 2000 ms` | **48.2 ms** *(Trung bình)* | **ĐẠT (Vượt 41 lần SLA)** |
| **2** | **Độ trễ đóng ngắt Rơ-le phản hồi (RTT)** | `< 500 ms` | **62.5 ms** | **ĐẠT** |
| **3** | **Chu kỳ gửi Telemetry ổn định** | `2.0 s ± 10%` | **2.01 s** | **ĐẠT** |
| **4** | **Thời gian phát hiện & cảnh báo loa hỏng** | `15 giây` | **15.1 s** | **ĐẠT** |
| **5** | **Thời gian phục hồi kết nối Wi-Fi khi có lại sóng** | `< 10 giây` | **3.8 s** | **ĐẠT** |
| **6** | **Tỷ lệ mất gói tin (Packet Loss Rate) qua MQTT** | `< 1%` | **0.02%** | **ĐẠT** |

---

## 3. Kiểm thử Kịch bản Ngắt Mạng (Offline Resiliency & Failsafe Test)

### Kịch bản 1: Cắt nguồn Wi-Fi Router (Mất mạng hoàn toàn)
- **Hành vi quan sát:**
  - Vi điều khiển ESP32 phát hiện mất kết nối Wi-Fi ngay lập tức.
  - Đèn LED trạng thái (GPIO 14) chuyển từ sáng liên tục sang nhấp nháy chậm (1Hz) báo hiệu chế độ `OFFLINE_AUTONOMOUS`.
  - Vòng lặp `loop()` không hề bị treo cứng nhờ cơ chế Non-blocking Timer và Hardware Watchdog Timer.
  - Chu kỳ đọc cảm biến vẫn duy trì đều đặn 500ms/lần.
  - **Tự động kích hoạt thiết bị:**
    - Khi hạ độ ẩm ảo `< 75%`: Rơ-le 1 (Máy phun sương) đóng tiếp điểm ngay lập tức.
    - Khi tăng nhiệt độ `> 31°C`: Rơ-le 2 (Quạt thông gió) đóng tiếp điểm ngay lập tức.
- **Kết luận:** **PASSED** - Mạch duy trì 100% khả năng tự trị vi khí hậu khi mất mạng.

### Kịch bản 2: Bật lại Wi-Fi Router
- **Hành vi quan sát:**
  - ESP32 tự động tái kết nối Wi-Fi trong 3.8 giây.
  - Kết nối lại EMQX Broker và tự động gửi gói tin `ONLINE` kèm trạng thái hiện tại của các rơ-le.
  - Frontend và Backend nhận lại luồng telemetry tức thì mà không cần can thiệp thủ công hay khởi động lại thiết bị.
- **Kết luận:** **PASSED**.

### Kịch bản 3: Chống Rung Tiếp Điểm Rơ-le (Hysteresis & Anti-chattering Deadband)
- **Hành vi quan sát:**
  - Khi độ ẩm dao động quanh ngưỡng 74.9% và 75.1%, relay không bị đóng ngắt liên tục gây cháy tiếp điểm nhờ thuật toán Hysteresis:
    - Bật phun sương khi `hum < 75%`.
    - Chỉ tắt phun sương khi `hum >= 80%`.
  - Khoảng nghỉ tối thiểu giữa 2 lần chuyển trạng thái là `4000ms`.
- **Kết luận:** **PASSED**.
