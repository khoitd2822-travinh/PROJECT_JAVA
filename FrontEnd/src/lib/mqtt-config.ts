// Config MQTT dung chung cho Frontend.
// PHẢI khớp với firmware/esp32-main/include/mqtt_config.h và
// BackEnd/src/main/resources/application.yaml
//
// Đổi TENANT/BROKER ở ĐÂY và 2 chỗ kia cùng lúc.

export const MQTT_TENANT = 'thanhliem';

// Broker local qua docker-compose (khuyến nghị khi test)
// Đổi 'public' thành wss://broker.emqx.io:8084/mqtt nếu cần test nhanh
export const MQTT_BROKER_MODE = 'local' as const;

export const MQTT_BROKER_URL =
  MQTT_BROKER_MODE === 'local'
    ? (process.env.NEXT_PUBLIC_MQTT_URL ?? 'ws://localhost:8083/mqtt')
    : 'wss://broker.emqx.io:8084/mqtt';

// Topic nhận telemetry từ ESP32.
// Cấu trúc: swiftlet/<tenant>/<farmId>/<zoneId>/<deviceId>/telemetry  -> 6 doan
// Dấu + thay cho farmId, zoneId, deviceId -> nghe MỌI thiết bị trong tenant.
// ESP32 phát: swiftlet/thanhliem/1/1/ESP32_MAIN_01/telemetry
export const TOPIC_TELEMETRY = `swiftlet/${MQTT_TENANT}/+/+/+/telemetry`;

// Topic trạng thái online/offline (retained)
export const TOPIC_STATUS = `swiftlet/${MQTT_TENANT}/+/+/+/status`;

// Topic GỬI LỆNH điều khiển relay.
// Mỗi thiết bị có topic riêng - KHÔNG dùng broadcast 'command/all'
// vì khi nhiều ESP32 cùng nghe topic chung, 1 lệnh sẽ kích hoạt tất cả.
export const TOPIC_COMMAND = `swiftlet/${MQTT_TENANT}/1/1/ESP32_MAIN_01/command`;