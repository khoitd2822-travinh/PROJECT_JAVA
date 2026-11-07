#include <Adafruit_SHT31.h>
#include <Arduino.h>
#include <BH1750.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>

#include <PubSubClient.h>
#include <ArduinoJson.h>

#define FAN_RELAY_PIN 26
#define FAN_SMOKE_RELAY_PIN 14
#define MIST_RELAY_PIN 27
#define HEATER_LED_PIN 18
#define BUZZER_PIN 19
#define MQ135_PIN 34

const char *ap_ssid = "To yen vippro";
const char *ap_password = "12345678";

WebServer server(80);
Adafruit_SHT31 sht31 = Adafruit_SHT31();
BH1750 lightMeter;

bool isHeaterAuto = true;
bool isMistAuto = true;
bool isFan1Auto = true;
bool isFanSmokeAuto = true;
bool isBuzzerAuto = true;

unsigned long previousMillis = 0;
float t = 0.0, h = 0.0, lux = 0.0;
int gasValue = 0;

// Wi-Fi router dùng chung với máy chạy Docker.
// Tự điền tại máy, không cần gửi mật khẩu lên chat.
const char *WIFI_SSID = "Haibon7979 T3";
const char *WIFI_PASSWORD = "";

// IP LAN của máy chạy Docker, KHÔNG dùng localhost.
const char *MQTT_HOST = "192.168.103.51";
const uint16_t MQTT_PORT = 1883;

const char *TELEMETRY_TOPIC = "swiftlet/telemetry/1/1";
const char *COMMAND_TOPIC = "swiftlet/command/1/1";

WiFiClient networkClient;
PubSubClient mqttClient(networkClient);

unsigned long lastMqttAttempt = 0;
unsigned long lastWifiAttempt = 0;
bool wifiWasConnected = false;

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  if (strcmp(topic, COMMAND_TOPIC) != 0) return;

  StaticJsonDocument<256> command;
  if (deserializeJson(command, payload, length)) {
    Serial.println("[MQTT] Lenh JSON khong hop le");
    return;
  }

  const char *action = command["action"] | "";
  const char *target = command["target"] | "";

  if (strcmp(action, "OVERRIDE") != 0) return;
  if (!command["state"].is<int>()) return;

  int state = command["state"].as<int>();
  if (state != 0 && state != 1) return;

  int pin = -1;
  bool *autoFlag = nullptr;

  if (strcmp(target, "fan") == 0) {
    pin = FAN_RELAY_PIN;
    autoFlag = &isFan1Auto;
  } else if (strcmp(target, "mist") == 0) {
    pin = MIST_RELAY_PIN;
    autoFlag = &isMistAuto;
  } else if (strcmp(target, "heat") == 0) {
    pin = HEATER_LED_PIN;
    autoFlag = &isHeaterAuto;
  } else if (strcmp(target, "alarm") == 0) {
    pin = BUZZER_PIN;
    autoFlag = &isBuzzerAuto;
  } else {
    Serial.printf("[MQTT] Target chua ho tro: %s\n", target);
    return;
  }

  // Lệnh thủ công vô hiệu auto của đúng thiết bị đó.
  *autoFlag = false;
  digitalWrite(pin, state == 1 ? HIGH : LOW);

  Serial.printf("[MQTT] Da dieu khien %s = %d\n", target, state);
}

void maintainMqtt() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    wifiWasConnected = false;

    if (mqttClient.connected()) {
      mqttClient.disconnect();
    }

    if (now - lastWifiAttempt >= 15000) {
      lastWifiAttempt = now;
      WiFi.reconnect();
    }
    return;
  }

  if (!wifiWasConnected) {
    wifiWasConnected = true;
    Serial.print("[WiFi] IP LAN ESP32: ");
    Serial.println(WiFi.localIP());
  }

  if (!mqttClient.connected()) {
    if (now - lastMqttAttempt < 5000) return;
    lastMqttAttempt = now;

    String clientId = "swiftlet-";
    clientId += WiFi.macAddress();

    if (mqttClient.connect(clientId.c_str())) {
      bool subscribed = mqttClient.subscribe(COMMAND_TOPIC, 1);
      Serial.printf("[MQTT] Connected; subscribe = %s\n",
                    subscribed ? "OK" : "FAILED");
    } else {
      Serial.printf("[MQTT] Ket noi loi, state = %d\n",
                    mqttClient.state());
    }
    return;
  }

  mqttClient.loop();
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;

  if (!isfinite(t) || !isfinite(h)) {
    Serial.println("[MQTT] Bo qua mau nhiet/am khong hop le");
    return;
  }

  StaticJsonDocument<512> document;

  document["deviceId"] = "ESP32_ZONE_1";
  document["farmId"] = 1;
  document["zoneId"] = 1;
  document["temp"] = t;
  document["hum"] = h;

  if (isfinite(lux) && lux >= 0) {
    // BE hiện nhận light là số nguyên.
    document["light"] = (int)lux;
  }

  JsonObject relays = document.createNestedObject("relays");
  relays["fan"] = digitalRead(FAN_RELAY_PIN) == HIGH ? 1 : 0;
  relays["mist"] = digitalRead(MIST_RELAY_PIN) == HIGH ? 1 : 0;
  relays["heat"] = digitalRead(HEATER_LED_PIN) == HIGH ? 1 : 0;
  relays["alarm"] = digitalRead(BUZZER_PIN) == HIGH ? 1 : 0;

  char payload[512];
  serializeJson(document, payload, sizeof(payload));

  bool sent = mqttClient.publish(TELEMETRY_TOPIC, payload);

  Serial.printf("[Telemetry] %s: %s\n",
                sent ? "SENT" : "FAILED", payload);
}

// Giao diện Web HTML (Đã nhúng JavaScript tự cập nhật)
String getHTML() {
  String html =
      "<!DOCTYPE html><html lang='vi'><head><meta charset='UTF-8'><meta "
      "name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>Bảng Điều Khiển</title>";
  html += "<style>";
  html += "body { font-family: Arial; text-align: center; background-color: "
          "#f4f4f9; padding: 20px; }";
  html += ".card { background: white; padding: 15px; border-radius: 10px; "
          "box-shadow: 0px 4px 8px rgba(0,0,0,0.1); margin-bottom: 20px; }";
  html += "h1 { color: #333; }";
  html += ".btn { display: inline-block; padding: 10px 20px; font-size: 16px; "
          "margin: 5px; border-radius: 5px; text-decoration: none; "
          "font-weight: bold; border: none; cursor: pointer;}";
  html += ".btn-auto { background-color: #ffc107; color: black; }";
  html += ".btn-on { background-color: #28a745; color: white; }";
  html += ".btn-off { background-color: #dc3545; color: white; }";
  html += ".data { font-size: 18px; font-weight: bold; color: #555; }";
  html += ".tag { font-size: 14px; padding: 3px 8px; border-radius: 12px; "
          "margin-left: 10px; }";
  html += ".tag-auto { background: #28a745; color: white; }";
  html += ".tag-manual { background: #dc3545; color: white; }";
  html += "</style></head><body>";

  html += "<h1>QUẢN LÝ CHUỒNG ẤP</h1>";

  // Thẻ hiển thị Cảm biến (Gắn ID để JavaScript tìm và thay số)
  html += "<div class='card'>";
  html += "<h2>Thông số Môi trường</h2>";
  html += "<p class='data'>Nhiệt độ: <span id='t_val'>" + String(t, 1) +
          "</span> °C | Độ ẩm: <span id='h_val'>" + String(h, 1) +
          "</span> %</p>";
  html += "<p class='data'>Ánh sáng: <span id='lux_val'>" + String(lux, 0) +
          "</span> lx | Khí Gas/Khói: <span id='gas_val'>" + String(gasValue) +
          "</span></p>";
  html += "</div>";

  html += "<div class='card'>";
  html += "<h2>Bảng Điều Khiển</h2>";
  html += "<a href='/resetAuto' class='btn btn-auto' style='margin-bottom: "
          "15px;'>Bật Lại Tự Động Toàn Bộ</a><hr>";

  bool fan1State = digitalRead(FAN_RELAY_PIN);
  bool fan2State = digitalRead(FAN_SMOKE_RELAY_PIN);
  bool mistState = digitalRead(MIST_RELAY_PIN);
  bool heaterState = digitalRead(HEATER_LED_PIN);
  bool buzzerState = digitalRead(BUZZER_PIN);
  // Hàm con tạo HTML cho từng món, gắn thêm ID trạng thái
  auto renderDevice = [](String name, bool state, bool isAuto, String onUrl,
                         String offUrl, String id) {
    String tag = isAuto ? "<span class='tag tag-auto'>Tự Động</span>"
                        : "<span class='tag tag-manual'>Thủ Công</span>";
    String str = "<h3>" + name + " - Đang: <span id='" + id + "'>" +
                 (state ? "BẬT" : "TẮT") + "</span>" + tag + "</h3>";
    str += "<a href='" + onUrl + "' class='btn btn-on'>BẬT</a> <a href='" +
           offUrl + "' class='btn btn-off'>TẮT</a>";
    return str;
  };

  html += renderDevice("Lò Sưởi", heaterState, isHeaterAuto, "/heater/on",
                       "/heater/off", "st_heater");
  html += renderDevice("Phun Sương", mistState, isMistAuto, "/mist/on",
                       "/mist/off", "st_mist");
  html += renderDevice("Tản Nhiệt (Quạt 1)", fan1State, isFan1Auto, "/fan1/on",
                       "/fan1/off", "st_fan1");
  html += renderDevice("Hút Khói (Quạt 2)", fan2State, isFanSmokeAuto,
                       "/fan2/on", "/fan2/off", "st_fan2");
  html += renderDevice("Còi Báo Động", buzzerState, isBuzzerAuto, "/buzzer/on",
                       "/buzzer/off", "st_buzzer");

  html += "</div>";

  // ĐOẠN SCRIPT THẦN THÁNH: Tự động chạy ngầm mỗi 2 giây
  html += "<script>";
  html += "setInterval(function() {";
  html += "  fetch('/data').then(response => response.json()).then(data => {";
  html += "    document.getElementById('t_val').innerText = data.t;";
  html += "    document.getElementById('h_val').innerText = data.h;";
  html += "    document.getElementById('lux_val').innerText = data.lux;";
  html += "    document.getElementById('gas_val').innerText = data.gas;";
  html += "    document.getElementById('st_heater').innerText = data.heater;";
  html += "    document.getElementById('st_mist').innerText = data.mist;";
  html += "    document.getElementById('st_fan1').innerText = data.fan1;";
  html += "    document.getElementById('st_fan2').innerText = data.fan2;";
  html += "    document.getElementById('st_buzzer').innerText = data.buzzer;";
  html += "  });";
  html += "}, 2000);";
  html += "</script>";
  html += "</body></html>";
  return html;
}

void handleRoot() { server.send(200, "text/html", getHTML()); }

// HÀM MỚI: Trả về cục dữ liệu JSON cho JavaScript đọc ngầm
void handleData() {
  String json = "{";
  json += "\"t\":\"" + String(t, 1) + "\",";
  json += "\"h\":\"" + String(h, 1) + "\",";
  json += "\"lux\":\"" + String(lux, 0) + "\",";
  json += "\"gas\":\"" + String(gasValue) + "\",";
  json += "\"heater\":\"" +
          String(digitalRead(HEATER_LED_PIN) ? "BẬT" : "TẮT") + "\",";
  json += "\"mist\":\"" + String(digitalRead(MIST_RELAY_PIN) ? "BẬT" : "TẮT") +
          "\",";
  json += "\"fan1\":\"" + String(digitalRead(FAN_RELAY_PIN) ? "BẬT" : "TẮT") +
          "\",";
  json += "\"fan2\":\"" +
          String(digitalRead(FAN_SMOKE_RELAY_PIN) ? "BẬT" : "TẮT") + "\",";
  json +=
      "\"buzzer\":\"" + String(digitalRead(BUZZER_PIN) ? "BẬT" : "TẮT") + "\"";
  json += "}";
  server.send(200, "application/json", json);
}
void handleResetAuto() {
  isHeaterAuto = true;
  isMistAuto = true;
  isFan1Auto = true;
  isFanSmokeAuto = true;
  isBuzzerAuto = true;
  server.sendHeader("Location", "/");
  server.send(303);
}

void controlDevice(int pin, int state, bool &autoFlag) {
  autoFlag = false;
  digitalWrite(pin, state);
  server.sendHeader("Location", "/");
  server.send(303);
}

void setup() {
  Serial.begin(115200);

  pinMode(FAN_RELAY_PIN, OUTPUT);
  pinMode(FAN_SMOKE_RELAY_PIN, OUTPUT);
  pinMode(MIST_RELAY_PIN, OUTPUT);
  pinMode(HEATER_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(MQ135_PIN, INPUT);

  digitalWrite(FAN_RELAY_PIN, LOW);
  digitalWrite(FAN_SMOKE_RELAY_PIN, LOW);
  digitalWrite(MIST_RELAY_PIN, LOW);
  digitalWrite(HEATER_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(21, 22);
  sht31.begin(0x44);
  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  Serial.println("Dang tao mang WiFi rieng...");
  //WiFi.softAP(ap_ssid, ap_password);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(ap_ssid, ap_password);

  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
  mqttClient.setSocketTimeout(1);

  Serial.println("[WiFi] Dang ket noi router...");

  Serial.print("IP vao trinh duyet Web: ");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/data", handleData); // Khai báo đường dẫn cấp số liệu ngầm
  server.on("/resetAuto", handleResetAuto);

  server.on("/fan1/on",
            []() { controlDevice(FAN_RELAY_PIN, HIGH, isFan1Auto); });
  server.on("/fan1/off",
            []() { controlDevice(FAN_RELAY_PIN, LOW, isFan1Auto); });
  server.on("/fan2/on",
            []() { controlDevice(FAN_SMOKE_RELAY_PIN, HIGH, isFanSmokeAuto); });
  server.on("/fan2/off",
            []() { controlDevice(FAN_SMOKE_RELAY_PIN, LOW, isFanSmokeAuto); });
  server.on("/heater/on",
            []() { controlDevice(HEATER_LED_PIN, HIGH, isHeaterAuto); });
  server.on("/heater/off",
            []() { controlDevice(HEATER_LED_PIN, LOW, isHeaterAuto); });
  server.on("/mist/on",
            []() { controlDevice(MIST_RELAY_PIN, HIGH, isMistAuto); });
  server.on("/mist/off",
            []() { controlDevice(MIST_RELAY_PIN, LOW, isMistAuto); });
  server.on("/buzzer/on",
            []() { controlDevice(BUZZER_PIN, HIGH, isBuzzerAuto); });
  server.on("/buzzer/off",
            []() { controlDevice(BUZZER_PIN, LOW, isBuzzerAuto); });

  server.begin();
  Serial.println("Server Web da khoi chay!");
}

void loop() {
  server.handleClient();
  maintainMqtt();

  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= 2000) {
    previousMillis = currentMillis;

    t = sht31.readTemperature();
    h = sht31.readHumidity();
    lux = lightMeter.readLightLevel();
    gasValue = analogRead(MQ135_PIN);

    if (!isnan(t)) {
      if (isHeaterAuto) {
        digitalWrite(HEATER_LED_PIN, t < 34 ? HIGH : LOW);
      }

      if (isMistAuto) {
        digitalWrite(MIST_RELAY_PIN, h < 70 ? HIGH : LOW);
      }

      if (isFan1Auto) {
        digitalWrite(FAN_RELAY_PIN, t > 34 ? HIGH : LOW);
      }

      if (isFanSmokeAuto) {
        digitalWrite(
          FAN_SMOKE_RELAY_PIN,
          gasValue > 1500 ? HIGH : LOW
        );
      }

      if (isBuzzerAuto) {
        digitalWrite(
          BUZZER_PIN,
          gasValue > 1500 ? HIGH : LOW
        );
      }
    }

    publishTelemetry();
  }
}