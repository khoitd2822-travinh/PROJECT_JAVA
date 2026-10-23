'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import mqtt, { MqttClient } from 'mqtt';
import { MQTT_BROKER_URL, TOPIC_TELEMETRY } from '../../../lib/mqtt-config';
import { mockHouses, mockDevices } from '../../../data/mockData';

export default function HouseDetailPage() {
  const params = useParams<{ houseId: string }>();
  const houseId = params?.houseId ?? 'house-01';

  const house = mockHouses.find((h) => h.id === houseId) ?? mockHouses[0];

  const [isConnected, setIsConnected] = useState(false);
  const [mqttClient, setMqttClient] = useState<MqttClient | null>(null);
  const [telemetry, setTelemetry] = useState({
    temp: house.temperature,
    hum: house.humidity,
    co2: house.co2,
    light: house.light,
    sound: 0,
    relays: { mist: house.mistingActive ? 1 : 0, fan: 0, heat: 0, alarm: 0 },
  });

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `swiftlet_web_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
    });

    client.on('connect', () => {
      setIsConnected(true);
      client.subscribe(TOPIC_TELEMETRY);
      console.log('📡 Đang nghe:', TOPIC_TELEMETRY);
    });

    client.on('message', (_topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        setTelemetry((prev) => ({
          temp: data.temp ?? prev.temp,
          hum: data.hum ?? prev.hum,
          co2: data.co2 ?? prev.co2,
          light: data.light ?? prev.light,
          sound: data.sound ?? prev.sound,
          relays: data.relays ?? prev.relays,
        }));
      } catch (e) {
        console.error('Lỗi parse JSON MQTT:', e);
      }
    });

    setMqttClient(client);
    return () => {
      client.end();
    };
  }, []);

  const isTempWarning = telemetry.temp > 31;
  const isHumidWarning = telemetry.hum < 75;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
            ← Quay lại tổng quan
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{house.name}</h1>
          <p className="text-sm text-gray-500">{house.location}</p>
        </div>

        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
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

      {/* Chỉ số môi trường */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: 'Nhiệt độ', value: `${telemetry.temp}°C`, warn: isTempWarning },
          { label: 'Độ ẩm', value: `${telemetry.hum}%`, warn: isHumidWarning },
          { label: 'CO₂', value: `${telemetry.co2} ppm`, warn: telemetry.co2 > 1000 },
          { label: 'Ánh sáng', value: `${telemetry.light} lux`, warn: false },
          { label: 'Âm thanh', value: `${telemetry.sound} dB`, warn: false },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border p-4 shadow-sm ${
              item.warn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
            }`}
          >
            <span className="text-xs text-gray-500">{item.label}</span>
            <p className="mt-1 text-xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Trạng thái thiết bị */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Thiết bị</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {mockDevices.map((dev) => {
            const key = dev.type === 'misting' ? 'mist' : dev.type === 'fan' ? 'fan' : dev.type === 'heater' ? 'heat' : 'alarm';
            const active = telemetry.relays?.[key] === 1;
            return (
              <div key={dev.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-800">{dev.name}</p>
                <p className="mt-1 text-xs text-gray-500">{dev.description}</p>
                <span
                  className={`mt-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {active ? 'Đang bật' : 'Đang tắt'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <Link
        href={`/dashboard/${houseId}/control`}
        className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
      >
        Điều khiển thiết bị →
      </Link>
    </div>
  );
}