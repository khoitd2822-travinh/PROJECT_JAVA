/**
 * SwiftletCare - ESP32-CAM Video Streamer
 * Firmware: Phát luồng video MJPEG HTTP Stream phục vụ AI Đếm chim & Giám sát cửa thu
 * Tác giả: Thành viên 2 (Thanh Liêm) - Dự án SwiftletCare
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "camera_pins.h"
#include "config.h"

// HTTP Server handlers
static httpd_handle_t stream_httpd = NULL;
static httpd_handle_t camera_httpd = NULL;

// Flash LED state
static bool flash_state = false;
static unsigned long frames_served = 0;
static unsigned long last_wifi_check = 0;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// Khởi tạo phần cứng Camera OV2640
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

    // Kiểm tra PSRAM để tối ưu bộ đệm hình ảnh
    if (psramFound()) {
        Serial.println(F("[CAM] Phát hiện PSRAM! Cấu hình độ phân giải cao và double buffer."));
        config.frame_size = DEFAULT_FRAME_SIZE;
        config.jpeg_quality = JPEG_QUALITY;
        config.fb_count = FB_COUNT;
        config.grab_mode = CAMERA_GRAB_LATEST;
    } else {
        Serial.println(F("[CAM] Cảnh báo: Không tìm thấy PSRAM, hạ độ phân giải xuống QVGA."));
        config.frame_size = FRAMESIZE_QVGA;
        config.jpeg_quality = 12;
        config.fb_count = 1;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Lỗi khởi tạo Camera: 0x%x\n", err);
        return err;
    }

    sensor_t* s = esp_camera_sensor_get();
    if (s != NULL) {
        // Tối ưu cân bằng trắng và độ tương phản cho nhà yến
        s->set_brightness(s, 1);
        s->set_contrast(s, 1);
        s->set_saturation(s, 0);
        s->set_whitebal(s, 1);
        s->set_awb_gain(s, 1);
        s->set_wb_mode(s, 0); // Auto White Balance
    }

    Serial.println(F("[CAM] Camera OV2640 đã khởi tạo thành công!"));
    return ESP_OK;
}

// Handler stream MJPEG video
static esp_err_t stream_handler(httpd_req_t *req) {
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
            Serial.println(F("[CAM] Lỗi: Không thể chụp frame từ camera!"));
            res = ESP_FAIL;
        } else {
            size_t hlen = snprintf(part_buf, 64, _STREAM_PART, fb->len);
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
        // Nhường CPU cho các tác vụ Wi-Fi khác
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    return res;
}

// Handler chụp 1 snapshot tĩnh (phục vụ AI Edge / MinIO upload)
static esp_err_t capture_handler(httpd_req_t *req) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println(F("[CAM] Lỗi: Chụp ảnh đơn thất bại!"));
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

// Handler báo cáo trạng thái JSON
static esp_err_t status_handler(httpd_req_t *req) {
    char response[256];
    int rssi = WiFi.RSSI();
    unsigned long uptime = millis() / 1000;
    snprintf(response, sizeof(response),
        "{\"deviceId\":\"ESP32_CAM_01\",\"status\":\"ONLINE\",\"ip\":\"%s\","
        "\"rssi\":%d,\"uptime\":%lu,\"framesServed\":%lu,\"flash\":%d}",
        WiFi.localIP().toString().c_str(), rssi, uptime, frames_served, flash_state ? 1 : 0
    );

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, response, strlen(response));
}

// Handler điều khiển bật/tắt đèn Flash LED (GPIO 4)
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

// Handler trang chủ giao diện Preview trực tiếp
static esp_err_t index_handler(httpd_req_t *req) {
    const char html[] = 
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>SwiftletCare Camera Stream</title>"
        "<style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:20px;text-align:center}"
        ".container{max-width:800px;margin:auto;background:#1e293b;padding:20px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4)}"
        "h1{color:#38bdf8;margin-bottom:10px}img{width:100%;max-width:640px;height:auto;border-radius:8px;border:2px solid #334155}"
        ".btn{background:#0284c7;color:#fff;border:none;padding:10px 20px;margin:8px;border-radius:6px;cursor:pointer;font-weight:bold}"
        ".btn:hover{background:#0369a1}</style></head><body>"
        "<div class='container'><h1>SwiftletCare Camera Monitor</h1>"
        "<p>Camera Cửa Thu Chim Yến (AI-Thinker OV2640)</p>"
        "<img src='/stream' alt='Live Video Stream'><br>"
        "<button class='btn' onclick=\"fetch('/flash?state=1')\">Bật Flash LED</button>"
        "<button class='btn' onclick=\"fetch('/flash?state=0')\">Tắt Flash LED</button>"
        "<button class='btn' onclick=\"window.open('/capture')\">Chụp Ảnh Tĩnh</button>"
        "</div></body></html>";
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, html, strlen(html));
}

// Khởi chạy Web Server đa luồng
void startCameraServer() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = HTTP_PORT;
    config.ctrl_port = HTTP_PORT + 1;

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
        Serial.printf("[HTTP] Web Server chạy trên cổng %d\n", HTTP_PORT);
        Serial.printf("[HTTP] Luồng Stream sẵn sàng tại: http://<IP>:%d/stream\n", HTTP_PORT);
    }
}

void setup() {
    Serial.begin(115200);
    Serial.println(F("\n============================================="));
    Serial.println(F(" SwiftletCare ESP32-CAM Starting (TV2)...   "));
    Serial.println(F("============================================="));

    pinMode(FLASH_LED_PIN, OUTPUT);
    digitalWrite(FLASH_LED_PIN, LOW);

    // Khởi tạo Camera
    if (initCamera() != ESP_OK) {
        Serial.println(F("[CAM] Khởi động Camera thất bại! Vui lòng kiểm tra cáp ribbon."));
        return;
    }

    // Kết nối Wi-Fi
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print(F("[WIFI] Đang kết nối tới: "));
    Serial.println(WIFI_SSID);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(F("."));
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println(F("\n[WIFI] Đã kết nối thành công!"));
        Serial.print(F("[WIFI] Địa chỉ IP: http://"));
        Serial.println(WiFi.localIP());
        startCameraServer();
    } else {
        Serial.println(F("\n[WIFI] Không thể kết nối Wi-Fi! Chạy chế độ chờ kết nối lại..."));
    }
}

void loop() {
    // Tự động khôi phục Wi-Fi nếu mất kết nối
    if (millis() - last_wifi_check > 5000) {
        last_wifi_check = millis();
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println(F("[WIFI] Mất kết nối Wi-Fi, đang thử kết nối lại..."));
            WiFi.reconnect();
        }
    }
    delay(100);
}
