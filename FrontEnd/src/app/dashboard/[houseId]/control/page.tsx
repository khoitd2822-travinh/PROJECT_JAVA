'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import mqtt, { MqttClient } from 'mqtt';
import { MQTT_BROKER_URL, TOPIC_TELEMETRY, TOPIC_COMMAND } from '../../../../lib/mqtt-config';

type RelayKey = 'mist' | 'fan' | 'heat' | 'alarm';

const RELAY_META: { key: RelayKey; label: string; description: string }[] = [
  { key: 'mist', label: 'Máy phun sương', description: 'Tăng độ ẩm khi độ ẩm < 75%' },
  { key: 'fan', label: 'Quạt hút thông gió', description: 'Hạ nhiệt khi nhiệt độ > 31°C hoặc CO₂ cao' },
  { key: 'heat', label: 'Thiết bị sưởi ấm', description: 'Sưởi ấm khi nhiệt độ xuống thấp ban đêm' },
  { key: 'alarm', label: 'Còi báo / LED', description: 'Báo trạng thái kết nối và cảnh báo lỗi' },
];

export default function ControlPage() {
  const params = useParams<{ houseId: string }>();
  const houseId = params?.houseId ?? 'house-01';

  const [isConnected, setIsConnected] = useState(false);
  const [mqttClient, setMqttClient] = useState<MqttClient | null>(null);
  const [relays, setRelays] = useState<Record<RelayKey, number>>({
    mist: 0,
    fan: 0,
    heat: 0,
    alarm: 0,
  });
  const [autoMode, setAutoMode] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString('vi-VN');
    setLog((prev) => [`[${t}] ${msg}`, ...prev].slice(0, 8));
  };

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `swiftlet_web_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
    });

    client.on('connect', () => {
      setIsConnected(true);
      client.subscribe(TOPIC_TELEMETRY);
      addLog('Đã kết nối MQTT Broker');
    });

    client.on('message', (_topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.relays) {
          setRelays(data.relays);
        }
      } catch (e) {
        console.error('Lỗi parse JSON MQTT:', e);
      }
    });

    client.on('error', (err) => {
      console.error('Lỗi MQTT:', err);
      addLog('Lỗi kết nối MQTT');
    });

    setMqttClient(client);
    return () => {
      client.end();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gửi lệnh điều khiển. mode MANUAL = giữ trạng thái, AUTO = trả về
  // cho ESP32 tự điều khiển theo cảm biến.
  const sendCommand = (target: RelayKey, state: number) => {
    if (!mqttClient || !isConnected) {
      addLog('Chưa kết nối MQTT - không gửi được lệnh');
      return;
    }
    const payload = JSON.stringify({
      command: 'RELAY_CONTROL',
      target,
      state,
      mode: 'MANUAL',
    });
    mqttClient.publish(TOPIC_COMMAND, payload);
    addLog(`Gửi lệnh: ${target} = ${state ? 'BẬT' : 'TẮT'}`);
    setRelays((prev) => ({ ...prev, [target]: state }));
  };

  const setAuto = (on: boolean) => {
    setAutoMode(on);
    if (!mqttClient || !isConnected) return;
    const payload = JSON.stringify({
      command: 'RELAY_CONTROL',
      target: 'all',
      state: 0,
      mode: on ? 'AUTO' : 'MANUAL',
    });
    mqttClient.publish(TOPIC_COMMAND, payload);
    addLog(on ? 'Chuyển sang chế độ TỰ ĐỘNG' : 'Chuyển sang chế độ THỦ CÔNG');
  };

  const toggleRelay = (key: RelayKey) => {
    const next = relays[key] === 1 ? 0 : 1;
    sendCommand(key, next);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/${houseId}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            ← Quay lại chi tiết nhà
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Điều khiển thiết bị
          </h1>
          <p className="text-sm text-gray-500">
            Nhà yến Lâm Sơn - Tầng 1
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            isConnected
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span
            className={`mr-1.5 h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
            }`}
          ></span>
          {isConnected ? 'MQTT Online' : 'MQTT Disconnected'}
        </span>
      </div>

      {/* Chế độ điều khiển */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Chế độ điều khiển</h2>
            <p className="mt-1 text-sm text-gray-500">
              {autoMode
                ? 'ESP32 tự điều khiển relay theo ngưỡng cảm biến.'
                : 'Đang điều khiển thủ công từ web.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAuto(true)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                autoMode
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              Tự động
            </button>
            <button
              onClick={() => setAuto(false)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                !autoMode
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              Thủ công
            </button>
          </div>
        </div>
      </div>

      {/* Relay */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {RELAY_META.map((relay) => {
          const on = relays[relay.key] === 1;
          return (
            <div
              key={relay.key}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-base font-semibold text-gray-800">
                {relay.label}
              </h3>
              <p className="mt-1 text-xs text-gray-500">{relay.description}</p>

              <div className="mt-4 flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    on
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {on ? 'Đang bật' : 'Đang tắt'}
                </span>

                <button
                  onClick={() => toggleRelay(relay.key)}
                  disabled={!isConnected}
                  className={`relative h-7 w-14 rounded-full transition-colors disabled:opacity-50 ${
                    on ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                  aria-label={`Bật/tắt ${relay.label}`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      on ? 'left-8' : 'left-1'
                    }`}
                  ></span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Nhật ký */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          Nhật ký lệnh
        </h2>
        {log.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có lệnh nào được gửi.</p>
        ) : (
          <ul className="space-y-1">
            {log.map((line, i) => (
              <li key={i} className="font-mono text-xs text-gray-600">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}