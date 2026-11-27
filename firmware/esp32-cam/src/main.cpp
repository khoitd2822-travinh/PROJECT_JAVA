#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "camera_pins.h"
#include "config.h"

static httpd_handle_t camera_httpd = NULL;
static httpd_handle_t stream_httpd = NULL;
static bool flash_state = false;
static bool camera_ready = false;
static bool mdns_started = false;
static bool wifi_ready_logged = false;
static unsigned long frames_served = 0;
static unsigned long last_wifi_check = 0;

static Preferences camPrefs;
static char cfgWifiSsid[65] = WIFI_SSID;
static char cfgWifiPassword[65] = WIFI_PASSWORD;
static String serialCfgBuffer;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static void copyTruncated(char* dest, size_t maxLen, const char* src) {
    if (!src) {
        dest[0] = '\0';
        return;
    }
    strlcpy(dest, src, maxLen);
}

static void loadRuntimeConfig() {
    copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), WIFI_SSID);
    copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), WIFI_PASSWORD);

    if (!camPrefs.begin("swiftlet-cam", true)) return;
    String savedSsid = camPrefs.getString("wifi_ssid", "");
    if (savedSsid.length() > 0) {
        copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), savedSsid.c_str());
        String savedPass = camPrefs.getString("wifi_pass", "");
        copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), savedPass.c_str());
    }
    camPrefs.end();
}

static void saveRuntimeConfig() {
    if (!camPrefs.begin("swiftlet-cam", false)) return;
    camPrefs.putString("wifi_ssid", cfgWifiSsid);
    camPrefs.putString("wifi_pass", cfgWifiPassword);
    camPrefs.end();
}

esp_err_t initCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;

    if (psramFound()) {
        config.frame_size = DEFAULT_FRAME_SIZE;
        config.jpeg_quality = JPEG_QUALITY;
        config.fb_count = FB_COUNT;
        config.grab_mode = CAMERA_GRAB_LATEST;
    } else {
        config.frame_size = FRAMESIZE_QVGA;
        config.jpeg_quality = 12;
        config.fb_count = 1;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        return err;
    }

    sensor_t* s = esp_camera_sensor_get();
    if (s != NULL) {
        s->set_brightness(s, 1);
        s->set_contrast(s, 1);
        s->set_saturation(s, 0);
        s->set_whitebal(s, 1);
        s->set_awb_gain(s, 1);
        s->set_wb_mode(s, 0);
    }
    return ESP_OK;
}

static esp_err_t stream_handler(httpd_req_t *req) {
    if (!camera_ready) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    char part_buf[64];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if (res != ESP_OK) {
        return res;
    }
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    while (true) {
        fb = esp_camera_fb_get();
        if (!fb) {
            res = ESP_FAIL;
        } else {
            size_t hlen = snprintf(part_buf, sizeof(part_buf), _STREAM_PART, fb->len);
            res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
            if (res == ESP_OK) {
                res = httpd_resp_send_chunk(req, part_buf, hlen);
            }
            if (res == ESP_OK) {
                res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
            }
            esp_camera_fb_return(fb);
            fb = NULL;
            frames_served++;
        }
        if (res != ESP_OK) {
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    return res;
}

static esp_err_t capture_handler(httpd_req_t *req) {
    if (!camera_ready) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    return res;
}

static esp_err_t status_handler(httpd_req_t *req) {
    char response[288];
    int rssi = WiFi.RSSI();
    unsigned long uptime = millis() / 1000;
    snprintf(response, sizeof(response),
        "{\"deviceId\":\"ESP32_CAM_01\",\"status\":\"%s\",\"cameraReady\":%s,\"ip\":\"%s\",\"streamPort\":%d,"
        "\"rssi\":%d,\"uptime\":%lu,\"framesServed\":%lu,\"flash\":%d}",
        camera_ready ? "ONLINE" : "CAMERA_ERROR",
        camera_ready ? "true" : "false",
        WiFi.localIP().toString().c_str(), STREAM_PORT, rssi, uptime, frames_served, flash_state ? 1 : 0
    );

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, response, strlen(response));
}

static esp_err_t flash_handler(httpd_req_t *req) {
    char buf[32];
    if (httpd_req_get_url_query_str(req, buf, sizeof(buf)) == ESP_OK) {
        char param[16];
        if (httpd_query_key_value(buf, "state", param, sizeof(param)) == ESP_OK) {
            if (strcmp(param, "1") == 0 || strcmp(param, "on") == 0) {
                flash_state = true;
                digitalWrite(FLASH_LED_PIN, HIGH);
            } else {
                flash_state = false;
                digitalWrite(FLASH_LED_PIN, LOW);
            }
        }
    }
    return status_handler(req);
}

static esp_err_t index_handler(httpd_req_t *req) {
    char html[960];
    snprintf(
        html,
        sizeof(html),
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>SwiftletCare Camera</title>"
        "<style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:20px;text-align:center}"
        ".container{max-width:800px;margin:auto;background:#1e293b;padding:20px;border-radius:12px}"
        "img{width:100%%;max-width:640px;height:auto;border-radius:8px}"
        ".btn{background:#0284c7;color:#fff;border:none;padding:10px 20px;margin:8px;border-radius:6px;cursor:pointer}"
        "</style></head><body>"
        "<div class='container'><h1>SwiftletCare Camera</h1>"
        "<img id='stream' alt='Live Video Stream'><br>"
        "<button class='btn' onclick=\"fetch('/flash?state=1')\">Flash ON</button>"
        "<button class='btn' onclick=\"fetch('/flash?state=0')\">Flash OFF</button>"
        "<button class='btn' onclick=\"window.open('/capture')\">Capture</button>"
        "</div><script>"
        "document.getElementById('stream').src=location.protocol+'//'+location.hostname+':%d/stream';"
        "</script></body></html>",
        STREAM_PORT
    );
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, html, strlen(html));
}

void startCameraServer() {
    if (camera_httpd != NULL) return;

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = HTTP_PORT;
    config.ctrl_port = 32768;

    httpd_uri_t index_uri = { .uri = "/", .method = HTTP_GET, .handler = index_handler, .user_ctx = NULL };
    httpd_uri_t capture_uri = { .uri = "/capture", .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
    httpd_uri_t status_uri = { .uri = "/status", .method = HTTP_GET, .handler = status_handler, .user_ctx = NULL };
    httpd_uri_t flash_uri = { .uri = "/flash", .method = HTTP_GET, .handler = flash_handler, .user_ctx = NULL };
    httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };

    if (httpd_start(&camera_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(camera_httpd, &index_uri);
        httpd_register_uri_handler(camera_httpd, &capture_uri);
        httpd_register_uri_handler(camera_httpd, &status_uri);
        httpd_register_uri_handler(camera_httpd, &flash_uri);
        httpd_register_uri_handler(camera_httpd, &stream_uri);
    }

    httpd_config_t stream_config = HTTPD_DEFAULT_CONFIG();
    stream_config.server_port = STREAM_PORT;
    stream_config.ctrl_port = 32769;

    if (httpd_start(&stream_httpd, &stream_config) == ESP_OK) {
        httpd_register_uri_handler(stream_httpd, &stream_uri);
    }
}

static void onWifiReady() {
    if (!mdns_started) {
        if (MDNS.begin(MDNS_HOSTNAME)) {
            MDNS.addService("http", "tcp", HTTP_PORT);
            mdns_started = true;
            Serial.printf("[mDNS] http://%s.local/\n", MDNS_HOSTNAME);
        }
    }
    startCameraServer();
    if (!wifi_ready_logged) {
        wifi_ready_logged = true;
        Serial.printf("[HTTP] Web UI : http://%s/\n", WiFi.localIP().toString().c_str());
        Serial.printf("[NET] READY IP=%s STREAM=http://%s:%d/stream\n",
                      WiFi.localIP().toString().c_str(),
                      WiFi.localIP().toString().c_str(),
                      STREAM_PORT);
    }
}

static void applyWifiConfig() {
    wifi_ready_logged = false;
    mdns_started = false;
    WiFi.disconnect(true);
    delay(100);
    WiFi.begin(cfgWifiSsid, cfgWifiPassword);
}

static void handleSerialCfgLine(const String& line) {
    if (!line.startsWith("__SWIFTLET_CFG__:")) return;
    String jsonStr = line.substring(strlen("__SWIFTLET_CFG__:"));
    StaticJsonDocument<384> doc;
    if (deserializeJson(doc, jsonStr)) {
        Serial.println("__SWIFTLET_ERR__:{\"error\":\"invalid_json\"}");
        return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "IDENTIFY") == 0) {
        StaticJsonDocument<384> out;
        out["role"] = "esp32-cam";
        out["deviceId"] = "ESP32_CAM_01";
        out["cameraReady"] = camera_ready;
        out["wifiSsid"] = cfgWifiSsid;
        out["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
        out["ip"] = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : "";
        out["streamPort"] = STREAM_PORT;
        out["mdns"] = String(MDNS_HOSTNAME) + ".local";
        Serial.print("__SWIFTLET_INFO__:");
        serializeJson(out, Serial);
        Serial.println();
        return;
    }

    if (strcmp(cmd, "RESET_CFG") == 0) {
        if (camPrefs.begin("swiftlet-cam", false)) {
            camPrefs.clear();
            camPrefs.end();
        }
        loadRuntimeConfig();
        applyWifiConfig();
        Serial.println("__SWIFTLET_OK__:{\"role\":\"esp32-cam\",\"reset\":true}");
        return;
    }

    bool changed = false;
    if (doc.containsKey("wifiSsid")) {
        const char* s = doc["wifiSsid"] | "";
        if (s[0] != '\0') {
            if (strcmp(cfgWifiSsid, s) != 0) changed = true;
            copyTruncated(cfgWifiSsid, sizeof(cfgWifiSsid), s);
        }
    }
    if (doc.containsKey("wifiPassword")) {
        const char* p = doc["wifiPassword"] | "";
        if (strcmp(cfgWifiPassword, p) != 0) changed = true;
        copyTruncated(cfgWifiPassword, sizeof(cfgWifiPassword), p);
    }

    bool save = doc["save"] | true;
    if (save) saveRuntimeConfig();
    if (changed || (WiFi.status() != WL_CONNECTED) || (doc["reconnect"] | false)) {
        applyWifiConfig();
    }

    StaticJsonDocument<256> ack;
    ack["role"] = "esp32-cam";
    ack["saved"] = save;
    ack["wifiSsid"] = cfgWifiSsid;
    Serial.print("__SWIFTLET_OK__:");
    serializeJson(ack, Serial);
    Serial.println();
}

static void pollSerialConfig() {
    while (Serial.available() > 0) {
        char c = static_cast<char>(Serial.read());
        if (c == '\r') continue;
        if (c == '\n') {
            serialCfgBuffer.trim();
            if (serialCfgBuffer.length() > 0) {
                handleSerialCfgLine(serialCfgBuffer);
            }
            serialCfgBuffer = "";
        } else if (serialCfgBuffer.length() < 384) {
            serialCfgBuffer += c;
        }
    }
}

void setup() {
    Serial.begin(115200);
    Serial.println("\n[ESP32-CAM] Starting SwiftletCare Camera firmware...");

    pinMode(FLASH_LED_PIN, OUTPUT);
    digitalWrite(FLASH_LED_PIN, LOW);

    loadRuntimeConfig();

    esp_err_t camErr = initCamera();
    if (camErr != ESP_OK) {
        Serial.printf("[CAM] Init failed with error 0x%x (Serial Wi-Fi config still active)\n", camErr);
        camera_ready = false;
    } else {
        camera_ready = true;
        Serial.println("[CAM] Camera initialized");
    }

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(cfgWifiSsid, cfgWifiPassword);
    Serial.printf("[WiFi] Connecting to %s", cfgWifiSsid);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
        pollSerialConfig();
        delay(400);
        Serial.print(".");
        attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        onWifiReady();
    } else {
        Serial.println("[WiFi] Initial connection timed out; retrying in loop()");
    }
}

void loop() {
    pollSerialConfig();

    if (millis() - last_wifi_check > 5000) {
        last_wifi_check = millis();
        if (WiFi.status() != WL_CONNECTED) {
            wifi_ready_logged = false;
            Serial.println("[WiFi] Reconnecting...");
            WiFi.reconnect();
        } else {
            onWifiReady();
        }
    }
    delay(50);
}
