# BÁO CÁO THIẾT KẾ PHẦN CỨNG & DANH MỤC LINH KIỆN (BOM)
**Dự án: SwiftletCare - Giám sát & Điều khiển Vi khí hậu Nhà Yến Thông Minh**  
**Thành viên thực hiện: TV1 & TV2 (Thanh Liêm)**

---

## 1. Sơ đồ Nguyên lý & Phân bổ Chân Vi điều khiển (Pinout Mapping)

Hệ thống phần cứng SwiftletCare gồm 2 khối vi điều khiển độc lập kết nối qua mạng không dây Wi-Fi:
1. **Khối Điều khiển Vi khí hậu & Cảm biến (ESP32-Main)**
2. **Khối Camera Giám sát Cửa Thu Chim (ESP32-CAM)**

### 1.1. Bảng Phân bổ Chân ESP32-Main (30-pin / 38-pin DevKit)

| STT | Tên Thiết bị / Cảm biến | Loại Tín hiệu | Chân ESP32 | Điện áp | Chức năng trong Firmware |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | Cảm biến SHT30/SHT31 | I2C (SDA/SCL) | **GPIO 21 (SDA)<br>GPIO 22 (SCL)** | 3.3V | Đọc nhiệt độ và độ ẩm chính xác cao chu kỳ 2s. Điều khiển phun sương và quạt hút. |
| **2** | Cảm biến Ánh sáng (LDR / BH1750) | Analog / I2C | **GPIO 34** (Analog ADC1_CH6) | 3.3V | Đo cường độ ánh sáng trong nhà yến (giữ độ tối thích hợp cho chim làm tổ). |
| **3** | Cảm biến Khí / CO2 (MQ-135) | Analog | **GPIO 35** (Analog ADC1_CH7) | 5V / 3.3V out | Giám sát chất lượng không khí, phát hiện phân chim lên men sinh khí độc CO2/NH3. |
| **4** | Cảm biến Âm thanh (Microphone Module) | Analog | **GPIO 36** (VP - ADC1_CH0) | 3.3V | Đo mức cường độ âm thanh (dB) của hệ thống loa dẫn dụ (phát hiện loa hỏng/tắt). |
| **5** | Relay 1 (Máy phun sương tạo ẩm) | Digital Output | **GPIO 25** | 5V (Opto IN) | Kích đóng/ngắt máy phun sương khi độ ẩm môi trường `< 75%`. |
| **6** | Relay 2 (Quạt hút thông gió hạ nhiệt) | Digital Output | **GPIO 26** | 5V (Opto IN) | Kích bật quạt hút thông gió khi nhiệt độ `> 31°C` hoặc `CO2 > 1000 ppm`. |
| **7** | Relay 3 (Thiết bị sưởi ấm / Đèn vàng) | Digital Output | **GPIO 27** | 5V (Opto IN) | Kích đóng thiết bị sưởi khi nhiệt độ tụt thấp ban đêm `< 24°C`. |
| **8** | Đèn LED trạng thái & Còi Buzzer | Digital Output | **GPIO 14** | 3.3V / 5V | Báo hiệu trạng thái Wi-Fi/MQTT (chớp tắt) hoặc còi hú khi lỗi cảm biến / mất mạng. |

> **Lưu ý kỹ thuật quan trọng về ADC của ESP32:**
> Toàn bộ các chân cảm biến Analog (GPIO 34, 35, 36) đều thuộc khối **ADC1**. Điều này đảm bảo khi bật Wi-Fi công suất cao, chức năng đọc Analog không bị xung đột (vì ADC2 bị Wi-Fi driver của ESP32 chiếm dụng).

---

### 1.2. Khối Camera Cửa Thu Chim (ESP32-CAM AI-Thinker)

- **Bo mạch:** AI-Thinker ESP32-CAM tích hợp chip nhớ ngoài PSRAM 4MB.
- **Cảm biến hình ảnh:** Omnivision OV2640 (2 Megapixel, góc nhìn 68° hoặc 120° tuỳ chọn ống kính).
- **Giao diện stream:** HTTP MJPEG Streaming trên cổng 81, endpoint `/stream` và chụp snapshot tĩnh `/capture`.
- **Đèn Flash tích hợp:** GPIO 4 (dùng chiếu sáng hỗ trợ AI phát hiện thú hại ban đêm).

---

## 2. Danh mục Linh kiện Chốt mua (Bill of Materials - BOM)

| STT | Tên Linh kiện / Module | Thông số Kỹ thuật | Số lượng | Đơn giá tham khảo (VNĐ) | Thành tiền (VNĐ) | Mục đích sử dụng |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | **Bo mạch ESP32 NodeMCU-32S** | ESP-WROOM-32, 30 chân, Type-C/MicroUSB, tích hợp Wi-Fi & BLE | 2 | 85.000 | 170.000 | 1 bo chính hoạt động + 1 bo dự phòng test |
| 2 | **Bo mạch ESP32-CAM kèm Camera OV2640** | ESP32-CAM AI-Thinker + Module Camera OV2640 + Mạch nạp FT232RL/CH340 | 1 | 145.000 | 145.000 | Thu hình ảnh cửa chim vào/ra gửi cho AI Edge |
| 3 | **Cảm biến SHT30 / SHT31** | Cảm biến độ ẩm ±2% RH, nhiệt độ ±0.3°C, giao tiếp I2C | 1 | 65.000 | 65.000 | Giám sát nhiệt ẩm phòng yến |
| 4 | **Module Cảm biến Khí MQ-135** | Đo NH3, NOx, Alcohol, Benzene, Khói, CO2; xuất Analog 0-3.3V | 1 | 35.000 | 35.000 | Đo ô nhiễm không khí & phân chim |
| 5 | **Module Cảm biến Âm thanh Analog (KY-038 / MAX9814)** | Microphone độ nhạy cao, ngõ ra Analog phản hồi biên độ sóng âm | 1 | 30.000 | 30.000 | Đo tín hiệu loa dẫn dụ âm thanh yến |
| 6 | **Cảm biến Quang trở LDR Module** | Kèm biến trở vi chỉnh độ nhạy, ngõ ra Analog & Digital | 1 | 15.000 | 15.000 | Đo cường độ ánh sáng chuồng yến |
| 7 | **Module Relay 4 kênh 5V Cách ly Quang** | Kích mức Thấp (Active LOW), tiếp điểm 250VAC/10A có Opto PC817 cách ly | 1 | 55.000 | 55.000 | Điều khiển Bơm phun sương, Quạt hút, Sưởi |
| 8 | **Module Còi Buzzer 5V Active** | Còi báo chủ động tần số 2.5kHz | 1 | 8.000 | 8.000 | Phát tín hiệu cảnh báo sự cố |
| 9 | **Nguồn Tổ ong / Adapter 5V 3A DC** | Nguồn ổn áp chống nhiễu AC 100-240V ra DC 5V 3A | 1 | 65.000 | 65.000 | Cung cấp nguồn tổng cho ESP32 và Relay |
| 10 | **Hộp nhựa kỹ thuật chống nước IP65** | Kích thước 200x150x100mm, có gioăng cao su | 1 | 70.000 | 70.000 | Đóng gói mạch điện chống ẩm mốc trong nhà yến |
| 11 | **Phụ kiện đấu nối** | Dây cắm đực-cái, domino nối dây, thanh ray cài, điện trở 220Ω, 10kΩ | 1 bộ | 40.000 | 40.000 | Lắp ráp và hoàn thiện mạch |
| **TỔNG CỘNG** | | | | | **698.000 VNĐ** | *(Ngân sách phần cứng trong định mức dự án)* |

---

## 3. Thiết kế Nguồn & Bảo vệ Chống Nhiễu Môi trường Ẩm

1. **Cách ly Quang (Galvanic Isolation):** 
   - Module Relay sử dụng Optocoupler PC817 cách ly hoàn toàn chân điều khiển 3.3V của ESP32 với cuộn hút 5V và điện áp 220VAC của tải (quạt, máy phun sương).
   - Ngăn chặn triệt để xung điện cảm ứng (inductive kickback) dội ngược làm treo vi điều khiển khi ngắt relay.
2. **Nguồn cấp kép độc lập:**
   - Cung cấp nguồn 5V 3A DC chung, qua tụ lọc nguồn 1000uF + 100nF để khử sóng hài xung nhiễu.
3. **Chống ẩm nhà yến:**
   - Bo mạch được phủ một lớp sơn phủ bảo vệ bo mạch (Conformal Coating - Silicone/Acrylic) chống ăn mòn bởi hơi ẩm và amoniac từ phân chim yến.
   - Hộp kỹ thuật chuẩn IP65 có ốc siết cáp chống nước (Cable Glands PG7/PG9).
