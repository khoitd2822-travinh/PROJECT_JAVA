import mqtt, { MqttClient } from 'mqtt';
import { MQTT_BROKER_URL, MQTT_TENANT, TOPIC_TELEMETRY, TOPIC_STATUS } from './mqtt-config';

let client: MqttClient | null = null;

export const getMqttClient = (): MqttClient => {
  if (client) return client;

  client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `swiftlet_web_${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    connectTimeout: 4000,
  });

  client.on('connect', () => {
    console.log('✅ Đã kết nối MQTT Broker thành công!');
    // Nghe đúng topic mà ESP32 thực sự phát
    client?.subscribe([TOPIC_TELEMETRY, TOPIC_STATUS]);
    console.log(`📡 Đang nghe: ${TOPIC_TELEMETRY} | ${TOPIC_STATUS}`);
  });

  client.on('error', (err) => {
    console.error('❌ Lỗi kết nối MQTT:', err);
  });

  return client;
};

export { MQTT_TENANT, TOPIC_TELEMETRY, TOPIC_STATUS };