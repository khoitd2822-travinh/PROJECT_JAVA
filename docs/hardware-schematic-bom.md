# Sơ đồ phần cứng và danh mục linh kiện

## 1. Phân bổ chân ESP32

Khối chính: ESP32 NodeMCU 30 chân

| Thiết bị | Chân ESP32 | Loại tín hiệu | Điện áp | Chức năng |
| :--- | :--- | :--- | :--- | :--- |
| SHT30 / SHT31 | GPIO 21 (SDA), GPIO 22 (SCL) | I2C | 3.3V | Đọc nhiệt độ và độ ẩm chu kỳ 2s |
| Cảm biến ánh sáng LDR | GPIO 34 | Analog (ADC1) | 3.3V | Đo độ tối nhà yến |
| Cảm biến khí MQ-135 | GPIO 35 | Analog (ADC1) | 3.3V | Giám sát chất lượng không khí, khí CO2 |
| Cảm biến âm thanh Mic | GPIO 36 (VP) | Analog (ADC1) | 3.3V | Đo mức âm thanh loa dẫn dụ |
| Relay 1 (Máy phun sương) | GPIO 25 | Digital OUT | 5V | Bật phun sương khi độ ẩm < 75% |
| Relay 2 (Quạt thông gió) | GPIO 26 | Digital OUT | 5V | Bật quạt khi nhiệt độ > 31°C hoặc CO2 cao |
| Relay 3 (Thiết bị sưởi) | GPIO 27 | Digital OUT | 5V | Bật sưởi khi nhiệt độ < 24°C |
| LED trạng thái / Buzzer | GPIO 14 | Digital OUT | 3.3V | Báo mạng và cảnh báo sự cố |

Lưu ý: Các cảm biến analog nối vào ADC1 để không bị xung đột khi bật WiFi.

Khối camera: ESP32-CAM AI-Thinker
- Camera OV2640 2MP
- Luồng stream: port 80 / 81 đường dẫn `/stream` và chụp ảnh `/capture`
- Đèn flash: GPIO 4

## 2. Danh mục linh kiện (BOM)

| STT | Tên linh kiện | Thông số | SL | Đơn giá (VNĐ) | Thành tiền (VNĐ) |
| :---: | :--- | :--- | :---: | :---: | :---: |
| 1 | ESP32 NodeMCU-32S | 30 chân, WiFi + BLE | 2 | 85.000 | 170.000 |
| 2 | Bo ESP32-CAM + OV2640 | Có khe cắm thẻ, PSRAM | 1 | 145.000 | 145.000 |
| 3 | Cảm biến SHT30 | I2C, đo nhiệt ẩm | 1 | 65.000 | 65.000 |
| 4 | Cảm biến MQ-135 | Đo khí và khói | 1 | 35.000 | 35.000 |
| 5 | Cảm biến âm thanh KY-038 | Ngõ ra analog | 1 | 30.000 | 30.000 |
| 6 | Module quang trở LDR | Ngõ ra analog | 1 | 15.000 | 15.000 |
| 7 | Module relay 4 kênh 5V | Có opto cách ly, active low | 1 | 55.000 | 55.000 |
| 8 | Còi Buzzer 5V | Active buzzer | 1 | 8.000 | 8.000 |
| 9 | Nguồn DC 5V 3A | Adapter ổn áp | 1 | 65.000 | 65.000 |
| 10 | Hộp kỹ thuật IP65 | Hộp nhựa chống nước 200x150 | 1 | 70.000 | 70.000 |
| 11 | Phụ kiện | Dây nối, domino, điện trở | 1 | 40.000 | 40.000 |
| **Tổng** | | | | | **698.000** |

## 3. Lưu ý thi công

- Module relay có cách ly quang PC817 để chống xung ngược từ quạt và máy bơm.
- Nguồn cấp 5V qua tụ lọc 1000uF để ổn định khi relay đóng ngắt.
- Toàn bộ mạch đặt trong hộp kín IP65 để chống ẩm trong nhà yến.
