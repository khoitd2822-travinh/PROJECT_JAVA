import mqtt, { MqttClient } from 'mqtt';

const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

let client: MqttClient | null = null;

export const getMqttClient = (): MqttClient => {
  if (!client) {
    client = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `swiftlet_web_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
    });

    client.on('connect', () => {
      console.log('✅ Đã kết nối tới MQTT Broker EMQX thành công!');
    });

    client.on('error', (err) => {
      console.error('❌ Lỗi kết nối MQTT:', err);
    });
  }
  return client;
};