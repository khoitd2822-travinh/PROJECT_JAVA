#include <Arduino.h>
#include <DHT.h>
#include "config.h"
#include "thresholds.h"

// Khởi tạo đối tượng cảm biến DHT
DHT dht(DHT_PIN, DHT_TYPE);

// Biến lưu thời gian đọc định kỳ (không dùng delay)
unsigned long previousMillis = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("--- Khoi dong he thong SwiftletCare (Wokwi Simulation) ---");

  dht.begin();

  pinMode(MQ135_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);
}

void loop() {
  unsigned long currentMillis = millis();

  // Đọc dữ liệu định kỳ mỗi 3 giây
  if (currentMillis - previousMillis >= INTERVAL_MS) {
    previousMillis = currentMillis;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Lỗi: Không thể đọc dữ liệu từ cảm biến DHT22!");
      return;
    }

    int mq135Value = analogRead(MQ135_PIN);
    int ldrValue = analogRead(LDR_PIN);

    Serial.println("\n----------------------------------------");
    Serial.printf("Nhiệt độ (Temp): %.2f °C\n", temperature);
    Serial.printf("Độ ẩm (Humidity): %.2f %%\n", humidity);
    Serial.printf("Chỉ số MQ-135 (Gas): %d\n", mq135Value);
    Serial.printf("Chỉ số LDR (Light): %d\n", ldrValue);
    
    if (temperature > TEMP_MAX_THRESHOLD) {
      Serial.println("[CẢNH BÁO] Nhiệt độ vượt ngưỡng cho phép!");
    }
    if (humidity < HUMID_MIN_THRESHOLD) {
      Serial.println("[CẢNH BÁO] Độ ẩm xuống thấp hơn mức an toàn!");
    }
    if (mq135Value > MQ135_GAS_THRESHOLD) {
      Serial.println("[CẢNH BÁO] Phát hiện nồng độ khí độc/ô nhiễm cao!");
    }
  }
}