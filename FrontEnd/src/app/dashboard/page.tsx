'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface SwiftletHouse {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'warning' | 'offline';
  temperature: number | string;
  humidity: number | string;
  co2: number | string;
  sound?: number | string;
  light?: number | string;
  birdsInToday: number;
  birdsOutToday: number;
  mistingActive: boolean;
}

export default function DashboardOverviewPage() {
  // Quản lý nhà yến bằng mảng houses
  const [houses, setHouses] = useState<SwiftletHouse[]>([
    {
      id: 'house-01',
      name: 'Nhà yến Lâm Sơn',
      location: 'Lâm Sơn, Ninh Thuận',
      status: 'online',
      temperature: '--',
      humidity: '--',
      co2: '--',
      sound: '--',
      light: '--',
      birdsInToday: 0,
      birdsOutToday: 0,
      mistingActive: false,
    },
  ]);

  // Trạng thái kết nối API thực tế để hiển thị thông báo lỗi/thiếu dữ liệu
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'loading'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Lưu video được chọn từ máy tính
  const [videoUrl, setVideoUrl] = useState('');
  const [videoName, setVideoName] = useState('');

  // Lấy số đo thật trực tiếp từ Backend (Spring Boot) qua REST API
  useEffect(() => {
    const fetchRealtimeData = async () => {
      try {
        const response = await fetch('http://localhost:8080/api/v1/telemetry/latest?farmId=1&zoneId=1');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status === 200 && result.data) {
          const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
          
          setHouses((prev) =>
            prev.map((house) =>
              house.id === 'house-01'
                ? {
                    ...house,
                    temperature: data.temperature ?? house.temperature,
                    humidity: data.humidity ?? house.humidity,
                    co2: data.co2 ?? data.co2Level ?? house.co2,
                    sound: data.sound ?? data.soundDb ?? house.sound,
                    light: data.light ?? house.light,
                    mistingActive: data.mist === 1 || data.mistingActive || house.mistingActive,
                    status: 'online',
                  }
                : house
            )
          );
          setConnectionStatus('connected');
          setErrorMessage(null);
        } else {
          // KHÔNG dùng dữ liệu mẫu khi API lỗi/trống -> Reset về '--' và offline
          setConnectionStatus('error');
          setErrorMessage('Phản hồi từ Server không hợp lệ hoặc dữ liệu trống.');
          setHouses((prev) =>
            prev.map((house) =>
              house.id === 'house-01'
                ? {
                    ...house,
                    status: 'offline',
                    temperature: '--',
                    humidity: '--',
                    co2: '--',
                    sound: '--',
                    light: '--',
                    mistingActive: false,
                  }
                : house
            )
          );
        }
      } catch (err) {
        console.error('Lỗi kết nối Backend:', err);
        setConnectionStatus('error');
        setErrorMessage('Không thể kết nối đến Backend (Kiểm tra lại Spring Boot hoặc Redis).');
        // KHÔNG dùng dữ liệu mẫu khi mất kết nối -> Xóa sạch dữ liệu hiển thị thành '--'
        setHouses((prev) =>
          prev.map((house) =>
            house.id === 'house-01'
              ? {
                  ...house,
                  status: 'offline',
                  temperature: '--',
                  humidity: '--',
                  co2: '--',
                  sound: '--',
                  light: '--',
                  mistingActive: false,
                }
              : house
          )
        );
      }
    };

    fetchRealtimeData();
    const interval = setInterval(fetchRealtimeData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SwiftletCare - Tổng quan Hệ thống</h1>
          <p className="text-sm text-gray-500">Giám sát vi khí hậu & đếm chim AI thời gian thực.</p>
        </div>

        {/* Badge trạng thái kết nối động (Xử lý lỗi / mất dữ liệu) */}
        <div className="flex items-center gap-3">
          {connectionStatus === 'connected' && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Đã kết nối (Real-time Polling)
            </span>
          )}
          {connectionStatus === 'loading' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
              Đang kết nối thiết bị...
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-rose-500"></span>
              Mất kết nối / Lỗi dữ liệu
            </span>
          )}
        </div>
      </div>

      {/* Banner thông báo lỗi chi tiết nếu mất kết nối */}
      {errorMessage && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span><strong>Cảnh báo hệ thống:</strong> {errorMessage}</span>
          </div>
          <span className="text-xs text-rose-500 italic">Đang tự động thử lại mỗi 5s...</span>
        </div>
      )}
  
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
            className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
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
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
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

      {/* Thông tin nhà yến duy nhất */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {houses.map((house) => {
          // Tính toán trạng thái dựa trên số đo thực tế
          const isNoData = house.temperature === '--' || house.humidity === '--';
          const isTempWarning = !isNoData && Number(house.temperature) > 31;
          const isHumidWarning = !isNoData && Number(house.humidity) < 75;
          const hasWarning = isTempWarning || isHumidWarning;

          // Xác định nhãn hiển thị động
          let statusText = 'Đang cập nhật';
          let statusColorClass = 'bg-gray-100 text-gray-600';
          let borderIndicatorColor = 'bg-gray-300';

          if (isNoData || connectionStatus === 'error' || house.status === 'offline') {
            statusText = 'Mất kết nối / Chưa có dữ liệu';
            statusColorClass = 'bg-gray-100 text-gray-600';
            borderIndicatorColor = 'bg-gray-300';
          } else if (hasWarning) {
            statusText = isTempWarning && isHumidWarning ? 'Nhiệt & Độ ẩm bất thường' : isTempWarning ? 'Nhiệt độ cao' : 'Độ ẩm thấp';
            statusColorClass = 'bg-amber-100 text-amber-800';
            borderIndicatorColor = 'bg-amber-500';
          } else {
            statusText = 'Hoạt động ổn định';
            statusColorClass = 'bg-emerald-100 text-emerald-800';
            borderIndicatorColor = 'bg-emerald-500';
          }

          return (
            <div
              key={house.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm relative overflow-hidden"
            >
              {/* Thanh trạng thái màu dọc bên trái thẻ */}
              <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                house.status === 'offline' ? 'bg-gray-300' :
                isTempWarning || isHumidWarning ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />

              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">
                    {house.name}
                  </h2>
                  <p className="text-sm text-gray-500">{house.location}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  house.status === 'offline' ? 'bg-gray-100 text-gray-600' :
                  isTempWarning || isHumidWarning ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {house.status === 'offline' ? 'Mất kết nối' : isTempWarning || isHumidWarning ? 'Cảnh báo' : 'Ổn định'}
                </span>
              </div>

              {/* Khu vực hiển thị thông số kèm đơn vị chuẩn (Xử lý thông minh khi thiếu dữ liệu) */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="text-xs text-gray-500">Nhiệt độ</span>
                  <p className="text-2xl font-bold">
                    {isNoData ? '--' : `${house.temperature}°C`}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="text-xs text-gray-500">Độ ẩm</span>
                  <p className="text-2xl font-bold">
                    {isNoData ? '--' : `${house.humidity}%`}
                  </p>
                </div>
              </div>

              <div className="mt-4 text-sm space-y-1.5 text-gray-600">
                <div className="flex justify-between">
                  <span>CO₂:</span>
                  <span className="font-medium">{isNoData ? '--' : `${house.co2} ppm`}</span>
                </div>
                <div className="flex justify-between">
                  <span>Âm thanh:</span>
                  <span className="font-medium">{house.sound !== '--' && house.sound !== undefined ? `${house.sound} dB` : '-- dB'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ánh sáng:</span>
                  <span className="font-medium">{house.light !== '--' && house.light !== undefined ? `${house.light} Lux` : '-- Lux'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chim ra hôm nay:</span>
                  <span className="font-medium">{house.birdsOutToday} con</span>
                </div>
                <div className="flex justify-between">
                  <span>Chim vào hôm nay:</span>
                  <span className="font-medium">{house.birdsInToday} con</span>
                </div>
                <div className="flex justify-between">
                  <span>Phun sương:</span>
                  <span className={`font-semibold ${house.mistingActive ? 'text-indigo-600' : 'text-gray-500'}`}>
                    {house.mistingActive ? 'Đang bật 💧' : 'Đang tắt'}
                  </span>
                </div>
              </div>

              <Link
                href={`/dashboard/${house.id}`}
                className="mt-5 block w-full text-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                Điều khiển chi tiết →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}