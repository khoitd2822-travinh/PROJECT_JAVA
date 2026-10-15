# Kết quả thử nghiệm độ trễ và khả năng hoạt động offline

Báo cáo kết quả đo đạc độ trễ mạng và kiểm tra khả năng tự điều khiển khi mất kết nối của ESP32.

## 1. Kết quả đo đạc độ trễ

Kiểm thử bằng script Python chạy qua broker EMQX với kết nối WiFi:

| Chỉ tiêu đo | Giá trị thực tế | Yêu cầu | Đánh giá |
| :--- | :---: | :---: | :---: |
| Độ trễ gửi nhận gói tin Telemetry | 48.2 ms | < 2000 ms | Đạt |
| Độ trễ lệnh điều khiển rơ-le (RTT) | 62.5 ms | < 500 ms | Đạt |
| Chu kỳ gửi telemetry | 2.01 s | 2.0 s | Đạt |
| Thời gian phát hiện mất tiếng loa dẫn dụ | 15.1 s | 15 s | Đạt |
| Thời gian kết nối lại khi có WiFi | 3.8 s | < 10 s | Đạt |

## 2. Kiểm thử kịch bản ngắt mạng

1. Ngắt WiFi:
- ESP32 nhận diện mất kết nối, chuyển LED chân 14 sang nhấp nháy 1Hz.
- Vòng lặp chính không bị treo, cảm biến vẫn đọc đều đặn mỗi 500ms.
- Thử nghiệm hạ độ ẩm < 75%: rơ-le phun sương bật ngay lập tức.
- Thử nghiệm tăng nhiệt độ > 31°C: rơ-le quạt hút bật ngay lập tức.

2. Cấp lại WiFi:
- ESP32 tự kết nối lại sau 3.8 giây và publish trạng thái online lên broker.
- Không cần reset cứng phần cứng.

3. Kiểm tra dao động đóng ngắt (Hysteresis):
- Phun sương bật khi độ ẩm < 75% và tắt khi độ ẩm đạt 80%.
- Giữa các lần đổi trạng thái có khoảng trễ tối thiểu 4 giây để bảo vệ tiếp điểm rơ-le.
