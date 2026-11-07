'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import mqtt, { MqttClient } from 'mqtt';

interface SwiftletHouse {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'warning' | 'offline';
  temperature: number;
  humidity: number;
  co2: number;
  birdsInToday: number;
  birdsOutToday: number;
  mistingActive: boolean;
}

export default function DashboardOverviewPage() {
  const [houses, setHouses] = useState<SwiftletHouse[]>([
    {
      id: 'house-01',
      name: 'Nhà yến Lâm Sơn - Tầng 1',
      location: 'Lâm Sơn, Ninh Thuận',
      status: 'online',
      temperature: 28.4,
      humidity: 82.5,
      co2: 650,
      birdsInToday: 1240,
      birdsOutToday: 1190,
      mistingActive: true,
    },
    {
      id: 'house-02',
      name: 'Nhà yến Lâm Sơn - Tầng 2',
      location: 'Lâm Sơn, Ninh Thuận',
      status: 'warning',
      temperature: 31.8,
      humidity: 71.0,
      co2: 820,
      birdsInToday: 850,
      birdsOutToday: 880,
      mistingActive: false,
    },
  ]);

  const [isConnected, setIsConnected] = useState(false);
  const [mqttClient, setMqttClient] = useState<MqttClient | null>(null);

  // Lưu video được chọn từ máy tính
  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");

  // Khởi tạo kết nối MQTT trực tiếp trong trang
  useEffect(() => {
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: `swiftlet_web_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
    });

    client.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Đã kết nối MQTT thành công!');
      client.subscribe('swiftletcare/house-01/sensors');
    });

    client.on('message', (topic, message) => {
      if (topic === 'swiftletcare/house-01/sensors') {
        try {
          const data = JSON.parse(message.toString());
          setHouses((prev) =>
            prev.map((house) =>
              house.id === 'house-01'
                ? {
                    ...house,
                    temperature: data.temperature ?? house.temperature,
                    humidity: data.humidity ?? house.humidity,
                    co2: data.co2 ?? house.co2,
                    mistingActive: data.mistingActive ?? house.mistingActive,
                  }
                : house
            )
          );
        } catch (e) {
          console.error('Lỗi parse JSON MQTT:', e);
        }
      }
    });

    setMqttClient(client);

    return () => {
      client.end();
    };
  }, []);

  // Hàm giả lập gửi dữ liệu cảm biến qua MQTT
  const handleSimulateMqttData = () => {
    if (mqttClient) {
      const fakeData = {
        temperature: parseFloat((27 + Math.random() * 6).toFixed(1)),
        humidity: parseFloat((70 + Math.random() * 20).toFixed(1)),
        co2: Math.floor(500 + Math.random() * 400),
        mistingActive: Math.random() > 0.5,
      };
      mqttClient.publish('swiftletcare/house-01/sensors', JSON.stringify(fakeData));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SwiftletCare - Tổng quan Hệ thống</h1>
          <p className="text-sm text-gray-500">Giám sát vi khí hậu & đếm chim AI thời gian thực.</p>
        </div>

        <div className="flex items-center gap-3">
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

          <button
            onClick={handleSimulateMqttData}
            className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            ⚡ Test Cảm biến (Simulate)
          </button>
        </div>
      </div>
  
      {/* Khu vực video camera nhà yến */}
<div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
  <h2 className="mb-2 text-lg font-semibold text-gray-800">
    Camera nhà yến
  </h2>

  <p className="mb-4 text-sm text-gray-500">
    Tải video từ máy tính để xem và phân tích hoạt động của chim yến.
  </p>

  {/* Chọn video */}
  <div className="flex flex-wrap items-center gap-3">
    <label
      htmlFor="swiftlet-video"
      className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
    >
      📁 Chọn video
    </label>

    <input
      id="swiftlet-video"
      type="file"
      accept="video/*"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];

        if (file) {
          setVideoUrl((oldUrl) => {
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            return URL.createObjectURL(file);
          });

          setVideoName(file.name);
        }
      }}
    />

    <span className="text-sm text-gray-500">
      {videoName || "Chưa chọn file video"}
    </span>
  </div>

  {/* Khung phát video */}
  {videoUrl ? (
    <div className="mt-5">
      <video
        id="swiftlet-video-player"
        src={videoUrl}
        controls
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: "480px" }}
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            const video = document.getElementById(
              "swiftlet-video-player"
            ) as HTMLVideoElement | null;

            video?.play();
          }}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          ▶ Bắt đầu phát
        </button>

        <button
          type="button"
          onClick={() => {
            setVideoUrl((oldUrl) => {
              if (oldUrl) URL.revokeObjectURL(oldUrl);
              return "";
            });
            setVideoName("");

            const input = document.getElementById(
              "swiftlet-video"
            ) as HTMLInputElement | null;

            if (input) input.value = "";
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          ✕ Xóa video
        </button>
      </div>
    </div>
  ) : (
    <div className="mt-5 flex min-h-56 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
      <span className="text-4xl">🎥</span>
      <p className="mt-3 font-medium text-gray-700">
        Chưa có video
      </p>
      <p className="mt-1 text-sm text-gray-500">
        Nhấn “Chọn video” để tải video nhà yến từ máy tính.
      </p>
    </div>
  )}
</div>

      {/* Danh sách nhà yến */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {houses.map((house) => {
          const isTempWarning = house.temperature > 31;
          const isHumidWarning = house.humidity < 75;

          return (
            <div
              key={house.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-gray-800">
                {house.name}
              </h2>

              <p className="text-sm text-gray-500">{house.location}</p>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="text-xs text-gray-500">Nhiệt độ</span>
                  <p className="text-2xl font-bold">
                    {house.temperature}°C
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="text-xs text-gray-500">Độ ẩm</span>
                  <p className="text-2xl font-bold">
                    {house.humidity}%
                  </p>
                </div>
              </div>

              <div className="mt-4 text-sm">
                <p>CO₂: {house.co2} ppm</p>
                <p>Chim ra: {house.birdsOutToday}</p>
                <p>Chim vào: {house.birdsInToday}</p>
                <p>
                  Phun sương: {house.mistingActive ? "Đang bật" : "Đang tắt"}
                </p>
                <p>
                  Trạng thái:
                  {" "}
                  {isTempWarning || isHumidWarning
                    ? "Cảnh báo"
                    : "Bình thường"}
                </p>
              </div>

              <Link
                href={`/dashboard/${house.id}`}
                className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
              >
                Điều khiển →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
