#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Preferences.h>
#include <WebServer.h>
#include <Adafruit_SHT31.h>
#include <BH1750.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include <esp_system.h>
#include <esp_timer.h>

#include "config.h"
#include "thresholds.h"

Preferences runtimePrefs;
WiFiUDP discoveryUdp;
constexpr uint16_t BROKER_DISCOVERY_PORT = 41234;

// Static buffers so PubSubClient::setServer keeps a valid pointer across runtime updates.
static char cfgWifiSsid[65] = WIFI_SSID;
static char cfgWifiPassword[65] = WIFI_PASSWORD;
static char cfgMqttHost[65] = MQTT_HOST;
static uint16_t cfgMqttPort = MQTT_PORT;

String serialCfgBuffer;
bool discoveryUdpReady = false;
unsigned long lastDiscoveryAttempt = 0;
uint8_t consecutiveMqttFails = 0;

WiFiClient networkClient;
PubSubClient mqttClient(networkClient);
WebServer server(80);

Adafruit_SHT31 sht31;
BH1750 lightMeter;

constexpr int DEVICE_COUNT = 5;
const char *TARGETS[DEVICE_COUNT] = {
    "fan", "fan_smoke", "mist", "heat", "alarm"
};

bool autoModes[DEVICE_COUNT];
bool outputStates[DEVICE_COUNT] = {};

bool shtReady = false;
bool lightReady = false;
bool temperatureValid = false;
bool humidityValid = false;
bool lightValid = false;

float temperature = NAN;
float humidity = NAN;
float lightLux = NAN;
int gasRaw = 0;

String bootId;
String webToken;

unsigned long lastSample = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastSensorInit = 0;

uint32_t heartbeatSequence = 0;
bool wifiWasConnected = false;
bool timeReadyReported = false;

struct CommandResult {
  bool used = false;
  String id;
  String signature;
  String ackJson;
  uint64_t expiresAt = 0;
  unsigned long lastAttempt = 0;
  uint8_t attempts = 0;
};

constexpr int CACHE_SIZE = 16;
CommandResult results[CACHE_SIZE];

uint64_t epochMillis() {
  timeval tv;
  if (gettimeofday(&tv, nullptr) != 0 || tv.tv_sec < 1704067200) {
    return 0;
  }
  return uint64_t(tv.tv_sec) * 1000ULL
         + uint64_t(tv.tv_usec) / 1000ULL;
}

int targetIndex(const String &target) {
  for (int i = 0; i < DEVICE_COUNT; i++) {
    if (target == TARGETS[i]) return i;
  }
  return -1;
}

void writeOutput(int index, bool on) {
  uint8_t targetLevel =
      on ? OUTPUT_ON_LEVELS[index]
         : (OUTPUT_ON_LEVELS[index] == HIGH ? LOW : HIGH);

  digitalWrite(OUTPUT_PINS[index], targetLevel);
  delayMicroseconds(20);

  // Ghi nhan trang thai theo lenh da xuat ra GPIO latch; neu tai ngoai keo lech
  // muc dien ap thi chi canh bao Serial thay vi tu reset trang thai ve OFF.
  outputStates[index] = on;
  if (digitalRead(OUTPUT_PINS[index]) != targetLevel) {
    Serial.printf(
        "[WARN] GPIO %u readback mismatch (target=%u, external load may pull voltage)\n",
        static_cast<unsigned int>(OUTPUT_PINS[index]),
        static_cast<unsigned int>(targetLevel)
    );
  }
}

void evaluateAuto() {
  // Mất số đo hợp lệ: đầu ra AUTO phụ thuộc số đo đó về OFF.
  // Đầu ra MANUAL giữ lựa chọn người dùng.

  if (autoModes[0]) {
    if (!temperatureValid) writeOutput(0, false);
    else if (temperature >= FAN_ON_ABOVE) writeOutput(0, true);
    else if (temperature <= FAN_OFF_BELOW) writeOutput(0, false);
  }

  if (autoModes[1]) {
    if (gasRaw >= GAS_ON_ABOVE) writeOutput(1, true);
    else if (gasRaw <= GAS_OFF_BELOW) writeOutput(1, false);
  }

  if (autoModes[2]) {
    if (!humidityValid) writeOutput(2, false);
    else if (humidity <= MIST_ON_BELOW) writeOutput(2, true);
    else if (humidity >= MIST_OFF_ABOVE) writeOutput(2, false);
  }

  if (autoModes[3]) {
    if (!temperatureValid) writeOutput(3, false);
    else if (temperature <= HEAT_ON_BELOW) writeOutput(3, true);
    else if (temperature >= HEAT_OFF_ABOVE) writeOutput(3, false);
  }

  if (autoModes[4]) {
    if (gasRaw >= GAS_ON_ABOVE) writeOutput(4, true);
    else if (gasRaw <= GAS_OFF_BELOW) writeOutput(4, false);
  }
}

void initializeSensors() {
  shtReady = sht31.begin(0x44);
  lightReady =
      lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  Serial.printf(
      "[SENSOR] SHT31=%s BH1750=%s\n",
      shtReady ? "OK" : "FAILED",
      lightReady ? "OK" : "FAILED"
  );
}

void readSensors() {
  unsigned long now = millis();

  if ((!shtReady || !lightReady)
      && now - lastSensorInit >= 30000) {
    lastSensorInit = now;

    if (!shtReady) shtReady = sht31.begin(0x44);
    if (!lightReady) {
      lightReady =
          lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
    }
  }

  temperature = shtReady ? sht31.readTemperature() : NAN;
  humidity = shtReady ? sht31.readHumidity() : NAN;
  lightLux = lightReady ? lightMeter.readLightLevel() : NAN;

  temperatureValid =
      isfinite(temperature)
      && temperature >= -40 && temperature <= 125;

  humidityValid =
      isfinite(humidity)
      && humidity >= 0 && humidity <= 100;

  lightValid = isfinite(lightLux) && lightLux >= 0;

  uint32_t sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(MQ135_PIN);
  }
  gasRaw = int(sum / 8);

  Serial.printf(
      "[SENSOR] temp=%.2f hum=%.2f light=%.1f gasRaw=%d\n",
      temperature, humidity, lightLux, gasRaw
  );

  evaluateAuto();
}

void fillSnapshot(JsonObject root) {
  root["boardId"] = BOARD_ID;
  root["deviceId"] = BOARD_ID;
  root["bootId"] = bootId;
  root["farmId"] = 1;
  root["zoneId"] = 1;

  if (temperatureValid) root["temp"] = temperature;
  if (humidityValid) root["hum"] = humidity;
  if (lightValid) root["light"] = int(lightLux);

  root["gasRaw"] = gasRaw;
  root["clockReady"] = epochMillis() != 0;

  JsonObject relays = root.createNestedObject("relays");
  JsonObject modes = root.createNestedObject("modes");

  for (int i = 0; i < DEVICE_COUNT; i++) {
    relays[TARGETS[i]] = outputStates[i] ? 1 : 0;
    modes[TARGETS[i]] = autoModes[i] ? "AUTO" : "MANUAL";
  }

  JsonObject valid = root.createNestedObject("valid");
  valid["temp"] = temperatureValid;
  valid["hum"] = humidityValid;
  valid["light"] = lightValid;

  // Chưa có driver/công thức CO2 được xác nhận.
  // Không biến gasRaw thành ppm hoặc gửi CO2 giả.
  valid["co2"] = false;
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<1024> doc;
  fillSnapshot(doc.to<JsonObject>());

  char buffer[1024];
  serializeJson(doc, buffer, sizeof(buffer));

  bool sent = mqttClient.publish(TELEMETRY_TOPIC, buffer, false);

  Serial.printf(
      "[Telemetry] %s: %s\n",
      sent ? "SENT" : "FAILED", buffer
  );
}

void publishHeartbeat() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<1024> doc;
  fillSnapshot(doc.to<JsonObject>());

  doc["seq"] = ++heartbeatSequence;
  doc["uptimeMs"] = uint64_t(esp_timer_get_time() / 1000);

  char buffer[1024];
  serializeJson(doc, buffer, sizeof(buffer));
  mqttClient.publish(HEARTBEAT_TOPIC, buffer, false);
}

String makeAck(
    const String &id,
    const String &target,
    bool success,
    int state,
    const String &mode,
    const char *message
) {
  StaticJsonDocument<512> doc;

  doc["commandId"] = id;
  doc["boardId"] = BOARD_ID;
  doc["target"] = target;
  doc["success"] = success;
  doc["state"] = state;
  doc["mode"] = mode;
  doc["message"] = message;

  String output;
  serializeJson(doc, output);
  return output;
}

void publishAck(const String &json) {
  bool sent = mqttClient.publish(ACK_TOPIC, json.c_str(), false);
  Serial.printf("[ACK] %s: %s\n",
                sent ? "SENT" : "FAILED", json.c_str());
}

void rejectCommand(
    const String &id,
    const String &target,
    const char *reason
) {
  publishAck(makeAck(
      id, target, false, -1, "UNKNOWN", reason
  ));
}

void retryAcks() {
  if (!mqttClient.connected()) return;

  unsigned long now = millis();
  uint64_t utc = epochMillis();

  for (int i = 0; i < CACHE_SIZE; i++) {
    CommandResult &r = results[i];

    if (!r.used || r.attempts >= 3) continue;
    if (utc == 0 || utc >= r.expiresAt) continue;
    if (now - r.lastAttempt < 1000) continue;

    r.lastAttempt = now;
    r.attempts++;
    publishAck(r.ackJson);
  }
}

bool applyOperation(int index, const String &operation) {
  if (index < 0 || index >= DEVICE_COUNT) return false;

  if (operation == "ON" || operation == "OFF") {
    autoModes[index] = false;
    bool requested = operation == "ON";
    writeOutput(index, requested);
    return outputStates[index] == requested;
  }

  if (operation == "AUTO") {
    autoModes[index] = true;
    evaluateAuto();
    return true;
  }

  if (operation == "MANUAL") {
    autoModes[index] = false;
    return true;
  }

  return false;
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  if (strcmp(topic, COMMAND_TOPIC) != 0) return;

  StaticJsonDocument<1024> doc;

  if (deserializeJson(doc, payload, length)) {
    Serial.println("[CMD] Invalid JSON");
    return;
  }

  // Copy trước khi publish vì client dùng buffer chung.
  String id = doc["commandId"] | "";
  String board = doc["boardId"] | "";
  String target = doc["target"] | "";
  String action = doc["action"] | "";
  String mode = doc["mode"] | "";

  if (id.length() != 36 || board != BOARD_ID) return;

  if (!doc["expiresAt"].is<uint64_t>()) {
    rejectCommand(id, target, "Missing expiresAt");
    return;
  }

  uint64_t expiresAt = doc["expiresAt"].as<uint64_t>();
  String operation;
  int requestedState = -1;

  if (action == "OVERRIDE") {
    if (!doc["state"].is<int>()) {
      rejectCommand(id, target, "Invalid state");
      return;
    }

    requestedState = doc["state"].as<int>();

    if (requestedState != 0 && requestedState != 1) {
      rejectCommand(id, target, "State must be 0 or 1");
      return;
    }

    if (mode.length() > 0 && mode != "MANUAL") {
      rejectCommand(id, target, "Override requires MANUAL");
      return;
    }

    operation = requestedState == 1 ? "ON" : "OFF";
    mode = "MANUAL";

  } else if (action == "SET_MODE") {
    if (mode != "AUTO" && mode != "MANUAL") {
      rejectCommand(id, target, "Invalid mode");
      return;
    }

    operation = mode;

  } else {
    rejectCommand(id, target, "Unsupported action");
    return;
  }

  String signature =
      action + "|" + target + "|" + mode
      + "|" + String(requestedState);

  for (int i = 0; i < CACHE_SIZE; i++) {
    CommandResult &r = results[i];

    if (!r.used || r.id != id) continue;

    if (r.signature != signature || r.expiresAt != expiresAt) {
      Serial.println("[CMD] Same ID with different payload");
      return;
    }

    Serial.printf("[CMD] DUPLICATE %s\n", id.c_str());
    publishAck(r.ackJson);
    return;
  }

  uint64_t now = epochMillis();

  if (now == 0) {
    rejectCommand(id, target, "Clock not synchronized");
    return;
  }

  if (expiresAt <= now) {
    rejectCommand(id, target, "Command expired");
    return;
  }

  if (expiresAt - now > 330000ULL) {
    rejectCommand(id, target, "Invalid expiry or clock mismatch");
    return;
  }

  int index = targetIndex(target);

  if (index < 0) {
    rejectCommand(id, target, "Unsupported target");
    return;
  }

  int slot = -1;

  for (int i = 0; i < CACHE_SIZE; i++) {
    if (!results[i].used || results[i].expiresAt <= now) {
      slot = i;
      break;
    }
  }

  if (slot < 0) {
    rejectCommand(id, target, "Command cache full");
    return;
  }

  bool applied = applyOperation(index, operation);
  String actualMode = autoModes[index] ? "AUTO" : "MANUAL";

  CommandResult &r = results[slot];
  r.used = true;
  r.id = id;
  r.signature = signature;
  r.expiresAt = expiresAt;
  r.lastAttempt = millis();
  r.attempts = 1;
  r.ackJson = makeAck(
      id, target, applied,
      outputStates[index] ? 1 : 0,
      actualMode,
      applied ? "Applied" : "GPIO verification failed"
  );

  Serial.printf(
      "[CMD] APPLIED id=%s target=%s operation=%s\n",
      id.c_str(), target.c_str(), operation.c_str()
  );

  publishAck(r.ackJson);
  lastHeartbeat = 0;
}

void maintainConnections() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    wifiWasConnected = false;

    if (mqttClient.connected()) mqttClient.disconnect();

    if (now - lastWifiAttempt >= WIFI_RETRY_MS) {
      lastWifiAttempt = now;
      Serial.println("[WiFi] Reconnecting...");
      WiFi.reconnect();
    }
    return;
  }

  if (!wifiWasConnected) {
    wifiWasConnected = true;
    Serial.print("[WiFi] LAN IP: ");
    Serial.println(WiFi.localIP());

    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  }

  if (!timeReadyReported && epochMillis() != 0) {
    timeReadyReported = true;
    Serial.println("[TIME] READY");
  }

  if (!mqttClient.connected()) {
    if (strcmp(cfgMqttHost, "localhost") == 0
        || strcmp(cfgMqttHost, "127.0.0.1") == 0
        || cfgMqttHost[0] == '\0') {
      if (now - lastDiscoveryAttempt >= 3000) {
        lastDiscoveryAttempt = now;
        IPAddress broadcastIp = WiFi.localIP();
        IPAddress mask = WiFi.subnetMask();
        IPAddress subnetBroadcast(
            broadcastIp[0] | (~mask[0]),
            broadcastIp[1] | (~mask[1]),
            broadcastIp[2] | (~mask[2]),
            broadcastIp[3] | (~mask[3])
        );
        if (!discoveryUdpReady) {
          discoveryUdpReady = discoveryUdp.begin(BROKER_DISCOVERY_PORT);
        }
        if (discoveryUdpReady) {
          discoveryUdp.beginPacket(subnetBroadcast, BROKER_DISCOVERY_PORT);
          discoveryUdp.print("SWIFTLET_DISCOVER_MQTT");
          discoveryUdp.endPacket();
          discoveryUdp.beginPacket(IPAddress(255, 255, 255, 255), BROKER_DISCOVERY_PORT);
          discoveryUdp.print("SWIFTLET_DISCOVER_MQTT");
          discoveryUdp.endPacket();
        }
      }
      return;
    }

    if (now - lastMqttAttempt < MQTT_RETRY_MS) return;
    lastMqttAttempt = now;

    StaticJsonDocument<256> status;
    status["boardId"] = BOARD_ID;
    status["bootId"] = bootId;
    status["online"] = false;

    char will[256];
    serializeJson(status, will, sizeof(will));

    String clientId = String("swiftlet-") + WiFi.macAddress();

    bool connected = mqttClient.connect(
        clientId.c_str(),
        STATUS_TOPIC,
        1,
        true,
        will
    );

    if (!connected) {
      Serial.printf("[MQTT] state=%d host=%s\n", mqttClient.state(), cfgMqttHost);
      consecutiveMqttFails++;
      if (consecutiveMqttFails >= 2 && now - lastDiscoveryAttempt >= 5000) {
        lastDiscoveryAttempt = now;
        if (!discoveryUdpReady) {
          discoveryUdpReady = discoveryUdp.begin(BROKER_DISCOVERY_PORT);
        }
        if (discoveryUdpReady) {
          IPAddress ip = WiFi.localIP();
          IPAddress mask = WiFi.subnetMask();
          IPAddress subnetBroadcast(
              ip[0] | (~mask[0]), ip[1] | (~mask[1]),
              ip[2] | (~mask[2]), ip[3] | (~mask[3])
          );
          discoveryUdp.beginPacket(subnetBroadcast, BROKER_DISCOVERY_PORT);
          discoveryUdp.print("SWIFTLET_DISCOVER_MQTT");
          discoveryUdp.endPacket();
          discoveryUdp.beginPacket(IPAddress(255, 255, 255, 255), BROKER_DISCOVERY_PORT);
          discoveryUdp.print("SWIFTLET_DISCOVER_MQTT");
          discoveryUdp.endPacket();
        }
      }
      return;
    }

    consecutiveMqttFails = 0;

    if (!mqttClient.subscribe(COMMAND_TOPIC, 1)) {
      Serial.println("[MQTT] Subscribe failed");
      mqttClient.disconnect();
      return;
    }

    status["online"] = true;
    char online[256];
    serializeJson(status, online, sizeof(online));
    mqttClient.publish(STATUS_TOPIC, online, true);

    Serial.println("[MQTT] Connected; subscribe=OK");
    publishHeartbeat();
    lastHeartbeat = now;
  }

  mqttClient.loop();
}

bool webAuthorized() {
  if (server.authenticate(WEB_USER, WEB_PASSWORD)) return true;
  server.requestAuthentication();
  return false;
}

void handleWebData() {
  if (!webAuthorized()) return;

  StaticJsonDocument<1024> doc;
  fillSnapshot(doc.to<JsonObject>());

  String output;
  serializeJson(doc, output);

  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", output);
}

void handleWebCommand() {
  if (!webAuthorized()) return;

  if (server.header("X-Control-Token") != webToken) {
    server.send(403, "text/plain", "Invalid control token");
    return;
  }

  String target = server.arg("target");
  String operation = server.arg("command");
  operation.toUpperCase();

  if (operation != "ON" && operation != "OFF"
      && operation != "AUTO" && operation != "MANUAL") {
    server.send(400, "text/plain", "Invalid command");
    return;
  }

  int index = targetIndex(target);

  if (index < 0) {
    server.send(400, "text/plain", "Invalid target");
    return;
  }

  bool applied = applyOperation(index, operation);

  if (mqttClient.connected()) publishHeartbeat();

  server.send(
      applied ? 200 : 500,
      "text/plain",
      applied ? "Applied" : "Failed"
  );
}

void copyTruncated(char *dest, size_t maxLen, const char *src) {
  if (!src) {
    dest[0] = '\0';
    return;
  }
  strlcpy(dest, src, maxLen);
}

void loadRuntimeConfig() {
  copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), WIFI_SSID);
  copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), WIFI_PASSWORD);
  copyTruncated(cfgMqttHost, sizeof(cfgMqttHost), MQTT_HOST);
  cfgMqttPort = MQTT_PORT;

  if (!runtimePrefs.begin("swiftlet", true)) return;
  String savedSsid = runtimePrefs.getString("wifi_ssid", "");
  if (savedSsid.length() > 0) {
    copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), savedSsid.c_str());
    String savedPass = runtimePrefs.getString("wifi_pass", "");
    copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), savedPass.c_str());
  }
  String savedHost = runtimePrefs.getString("mqtt_host", "");
  if (savedHost.length() > 0) {
    copyTruncated(cfgMqttHost, sizeof(cfgMqttHost), savedHost.c_str());
  }
  uint16_t savedPort = runtimePrefs.getUShort("mqtt_port", 0);
  if (savedPort > 0) {
    cfgMqttPort = savedPort;
  }
  runtimePrefs.end();
}

void saveRuntimeConfig() {
  if (!runtimePrefs.begin("swiftlet", false)) return;
  runtimePrefs.putString("wifi_ssid", cfgWifiSsid);
  runtimePrefs.putString("wifi_pass", cfgWifiPassword);
  runtimePrefs.putString("mqtt_host", cfgMqttHost);
  runtimePrefs.putUShort("mqtt_port", cfgMqttPort);
  runtimePrefs.end();
}

void applyNetworkConfig(bool reconnectWifi) {
  if (mqttClient.connected()) mqttClient.disconnect();
  mqttClient.setServer(cfgMqttHost, cfgMqttPort);
  consecutiveMqttFails = 0;
  lastMqttAttempt = 0;
  if (reconnectWifi) {
    wifiWasConnected = false;
    lastWifiAttempt = 0;
    WiFi.disconnect(true);
    delay(100);
    WiFi.begin(cfgWifiSsid, cfgWifiPassword);
  }
}

void pollDiscoveryResponse() {
  if (!discoveryUdpReady || WiFi.status() != WL_CONNECTED) return;
  int packetSize = discoveryUdp.parsePacket();
  if (packetSize <= 0) return;

  char buf[256];
  int len = discoveryUdp.read(buf, sizeof(buf) - 1);
  if (len <= 0) return;
  buf[len] = '\0';

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, buf)) return;
  const char *svc = doc["service"] | "";
  const char *host = doc["host"] | "";
  uint16_t port = doc["port"] | 1883;
  if (strcmp(svc, "swiftlet-emqx") != 0 || host[0] == '\0') return;

  if (strcmp(cfgMqttHost, host) != 0 || cfgMqttPort != port) {
    copyTruncated(cfgMqttHost, sizeof(cfgMqttHost), host);
    cfgMqttPort = port;
    saveRuntimeConfig();
    applyNetworkConfig(false);
    Serial.printf("[DISCOVER] Broker %s:%u\n", cfgMqttHost, cfgMqttPort);
  }
}

void handleSerialCfgLine(const String &line) {
  if (!line.startsWith("__SWIFTLET_CFG__:")) return;
  String jsonStr = line.substring(strlen("__SWIFTLET_CFG__:"));
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, jsonStr)) {
    Serial.println("__SWIFTLET_ERR__:{\"error\":\"invalid_json\"}");
    return;
  }

  const char *cmd = doc["cmd"] | "";
  if (strcmp(cmd, "IDENTIFY") == 0) {
    StaticJsonDocument<384> out;
    out["role"] = "esp32-main";
    out["boardId"] = BOARD_ID;
    out["wifiSsid"] = cfgWifiSsid;
    out["mqttHost"] = cfgMqttHost;
    out["mqttPort"] = cfgMqttPort;
    out["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
    out["ip"] = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : "";
    out["mqttConnected"] = mqttClient.connected();
    Serial.print("__SWIFTLET_INFO__:");
    serializeJson(out, Serial);
    Serial.println();
    return;
  }

  if (strcmp(cmd, "RESET_CFG") == 0) {
    if (runtimePrefs.begin("swiftlet", false)) {
      runtimePrefs.clear();
      runtimePrefs.end();
    }
    loadRuntimeConfig();
    applyNetworkConfig(true);
    Serial.println("__SWIFTLET_OK__:{\"role\":\"esp32-main\",\"reset\":true}");
    return;
  }

  bool wifiChanged = false;
  bool mqttChanged = false;
  if (doc.containsKey("wifiSsid")) {
    const char *newSsid = doc["wifiSsid"] | "";
    if (newSsid[0] != '\0') {
      if (strcmp(cfgWifiSsid, newSsid) != 0) wifiChanged = true;
      copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), newSsid);
    }
  }
  if (doc.containsKey("wifiPassword")) {
    const char *newPass = doc["wifiPassword"] | "";
    if (strcmp(cfgWifiPassword, newPass) != 0) wifiChanged = true;
    copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), newPass);
  }
  if (doc.containsKey("mqttHost")) {
    const char *newHost = doc["mqttHost"] | "";
    if (newHost[0] != '\0') {
      if (strcmp(cfgMqttHost, newHost) != 0) mqttChanged = true;
      copyTruncated(cfgMqttHost, sizeof(cfgMqttHost), newHost);
    }
  }
  if (doc.containsKey("mqttPort")) {
    uint16_t newPort = doc["mqttPort"] | 1883;
    if (newPort > 0 && cfgMqttPort != newPort) {
      cfgMqttPort = newPort;
      mqttChanged = true;
    }
  }

  bool save = doc["save"] | true;
  if (save) saveRuntimeConfig();
  if (wifiChanged || mqttChanged || (doc["reconnect"] | false)) {
    applyNetworkConfig(wifiChanged || (WiFi.status() != WL_CONNECTED));
  }

  StaticJsonDocument<256> ack;
  ack["role"] = "esp32-main";
  ack["saved"] = save;
  ack["wifiSsid"] = cfgWifiSsid;
  ack["mqttHost"] = cfgMqttHost;
  ack["mqttPort"] = cfgMqttPort;
  Serial.print("__SWIFTLET_OK__:");
  serializeJson(ack, Serial);
  Serial.println();
}

void pollSerialConfig() {
  while (Serial.available() > 0) {
    char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      serialCfgBuffer.trim();
      if (serialCfgBuffer.length() > 0) {
        handleSerialCfgLine(serialCfgBuffer);
      }
      serialCfgBuffer = "";
    } else if (serialCfgBuffer.length() < 512) {
      serialCfgBuffer += c;
    }
  }
}

void handleWebConfig() {
  if (!webAuthorized()) return;
  if (server.method() == HTTP_POST) {
    String s = server.arg("ssid");
    String p = server.arg("pass");
    String h = server.arg("host");
    int pt = server.arg("port").toInt();
    if (s.length() > 0) copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), s.c_str());
    if (server.hasArg("pass")) copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), p.c_str());
    if (h.length() > 0) copyTruncated(cfgMqttHost, sizeof(cfgMqttHost), h.c_str());
    if (pt > 0 && pt <= 65535) cfgMqttPort = static_cast<uint16_t>(pt);
    saveRuntimeConfig();
    applyNetworkConfig(true);
    server.send(200, "text/html; charset=utf-8",
        "<html><body><h3>Saved! Reconnecting...</h3><a href='/'>Back</a></body></html>");
    return;
  }

  String page = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<title>Wi-Fi & MQTT Config</title></head><body style='font-family:Arial;max-width:480px;margin:25px auto'>"
                "<h3>SwiftletCare — Wi-Fi & MQTT Broker</h3><form method='POST' action='/config'>"
                "Wi-Fi SSID:<br><input name='ssid' value='" + String(cfgWifiSsid) + "' style='width:100%'><br><br>"
                "Wi-Fi Password:<br><input name='pass' type='password' placeholder='(giu nguyen neu de trong)' style='width:100%'><br><br>"
                "MQTT Host:<br><input name='host' value='" + String(cfgMqttHost) + "' style='width:100%'><br><br>"
                "MQTT Port:<br><input name='port' type='number' value='" + String(cfgMqttPort) + "' style='width:100%'><br><br>"
                "<button type='submit'>Save & Connect</button></form><p><a href='/'>Dashboard</a></p></body></html>";
  server.send(200, "text/html; charset=utf-8", page);
}

void handleWebRoot() {
  if (!webAuthorized()) return;

  String html = R"HTML(
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SwiftletCare ESP32</title>
<style>
body{font-family:Arial;max-width:900px;margin:25px auto;padding:15px}
button{margin:4px;padding:8px}
section{padding:12px;border:1px solid #ddd;margin:10px 0}
pre{white-space:pre-wrap}
</style>
</head>
<body>
<h2>SwiftletCare — Điều khiển cục bộ</h2>
<p><a href="/config">Cấu hình Wi-Fi &amp; MQTT Broker</a></p>
<p id="message"></p>
<pre id="sensors">Đang tải...</pre>
<div id="devices"></div>
<script>
const token="{{TOKEN}}";
const targets=["fan","fan_smoke","mist","heat","alarm"];
const root=document.getElementById("devices");
for(const target of targets){
  const box=document.createElement("section");
  const label=document.createElement("strong");
  label.id="label-"+target;
  label.textContent=target;
  box.appendChild(label);
  box.appendChild(document.createElement("br"));
  for(const operation of ["ON","OFF","AUTO","MANUAL"]){
    const button=document.createElement("button");
    button.textContent=operation;
    button.onclick=()=>send(target,operation);
    box.appendChild(button);
  }
  root.appendChild(box);
}
async function load(){
  try{
    const response=await fetch("/data",{cache:"no-store"});
    if(!response.ok) throw new Error("HTTP "+response.status);
    const data=await response.json();
    document.getElementById("sensors").textContent=
      "Nhiệt: "+(data.temp??"--")+" °C\n"+
      "Ẩm: "+(data.hum??"--")+" %\n"+
      "Sáng: "+(data.light??"--")+" lux\n"+
      "Gas ADC: "+(data.gasRaw??"--");
    for(const target of targets){
      document.getElementById("label-"+target).textContent=
        target+" | "+(data.relays[target]===1?"ON":"OFF")
        +" | "+data.modes[target];
    }
  }catch(error){
    document.getElementById("message").textContent=error.message;
  }
}
async function send(target,command){
  try{
    const response=await fetch("/control",{
      method:"POST",
      headers:{
        "Content-Type":"application/x-www-form-urlencoded",
        "X-Control-Token":token
      },
      body:new URLSearchParams({target,command})
    });
    document.getElementById("message").textContent=
      await response.text();
    await load();
  }catch(error){
    document.getElementById("message").textContent=error.message;
  }
}
load();
setInterval(load,2000);
</script>
</body>
</html>
)HTML";

  html.replace("{{TOKEN}}", webToken);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/html; charset=utf-8", html);
}
void logWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[WiFi] Router connected; waiting for IP");
      break;

    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.print("[WiFi] GOT IP: ");
      Serial.println(IPAddress(info.got_ip.ip_info.ip.addr));
      break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf(
          "[WiFi] Disconnected; reason=%u\n",
          static_cast<unsigned int>(
              info.wifi_sta_disconnected.reason
          )
      );
      break;

    default:
      break;
  }
}
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < DEVICE_COUNT; i++) {
    uint8_t offLevel =
        OUTPUT_ON_LEVELS[i] == HIGH ? LOW : HIGH;

    digitalWrite(OUTPUT_PINS[i], offLevel);
    pinMode(OUTPUT_PINS[i], OUTPUT);

    autoModes[i] = BOOT_AUTO;
    outputStates[i] = false;
  }

  pinMode(MQ135_PIN, INPUT);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setTimeOut(50);

  initializeSensors();
  readSensors();

  loadRuntimeConfig();

  WiFi.onEvent(logWiFiEvent);
  WiFi.mode(ENABLE_LOCAL_AP ? WIFI_AP_STA : WIFI_STA);

  if (ENABLE_LOCAL_AP) {
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.print("[WiFi] AP IP: ");
    Serial.println(WiFi.softAPIP());
  }

  WiFi.setAutoReconnect(true);
  WiFi.begin(cfgWifiSsid, cfgWifiPassword);

  bootId = WiFi.macAddress() + "-" + String(esp_random(), HEX);
  webToken = String(esp_random(), HEX)
      + String(esp_random(), HEX)
      + String(esp_random(), HEX)
      + String(esp_random(), HEX);

  mqttClient.setServer(cfgMqttHost, cfgMqttPort);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(15);
  mqttClient.setSocketTimeout(1);

  if (!mqttClient.setBufferSize(1536)) {
    Serial.println("[MQTT] Buffer allocation failed");
  }

  const char *headers[] = {"Authorization", "X-Control-Token"};
  server.collectHeaders(headers, 2);

  server.on("/", HTTP_GET, handleWebRoot);
  server.on("/config", HTTP_GET, handleWebConfig);
  server.on("/config", HTTP_POST, handleWebConfig);
  server.on("/data", HTTP_GET, handleWebData);
  server.on("/control", HTTP_POST, handleWebCommand);

  server.onNotFound([]() {
    if (!webAuthorized()) return;
    server.send(404, "text/plain", "Not found");
  });

  server.begin();
  Serial.println("[WEB] Started; authentication required");
}

void loop() {
  pollSerialConfig();
  pollDiscoveryResponse();
  server.handleClient();
  maintainConnections();
  retryAcks();

  unsigned long now = millis();

  if (now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;
    readSensors();
    publishTelemetry();
  }

  if (mqttClient.connected()
      && now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now;
    publishHeartbeat();
  }

  delay(1);
}