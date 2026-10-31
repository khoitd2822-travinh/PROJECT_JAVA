'use client';

import React, { useEffect, useState } from 'react';
import { Client } from '@stomp/stompjs';

interface Device {
  id: number;
  name: string;
  deviceType: string;
  status: string;
  zoneId: number;
  farmId: number;
}

interface BirdLog {
  id: number;
  birdCount: number;
  eventType: string;
  description: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [birdCount, setBirdCount] = useState<number>(0);
  const [logs, setLogs] = useState<BirdLog[]>([]);

  // 1. Gọi REST API lấy danh sách thiết bị và lịch sử ban đầu
  useEffect(() => {
    fetch('http://localhost:8080/api/v1/farm/devices?farmId=1&zoneId=1')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 200) setDevices(data.data);
      })
      .catch((err) => console.error('Lỗi tải thiết bị:', err));

    fetch('http://localhost:8080/api/v1/bird-tracking/logs?farmId=1&zoneId=1')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 200) setLogs(data.data);
      })
      .catch((err) => console.error('Lỗi tải lịch sử đếm chim:', err));
  }, []);

  // 2. Tích hợp WebSocket Client bằng @stomp/stompjs để nhận dữ liệu real-time
  useEffect(() => {
    const stompClient = new Client({
      brokerURL: 'ws://localhost:8080/ws-swiftlet', // Đường dẫn WebSocket kết nối xuống Backend Spring Boot
      reconnectDelay: 5000,
      onConnect: () => {
        console.log('Đã kết nối thành công với WebSocket Server!');

        // Lắng nghe kênh realtime từ backend đẩy về
        stompClient.subscribe('/topic/bird-tracking', (message) => {
          const newLog: BirdLog = JSON.parse(message.body);
          setBirdCount(newLog.birdCount); // Nhảy số lượng chim real-time trên giao diện
          setLogs((prev) => [newLog, ...prev]); // Thêm log mới vào đầu danh sách
        });
      },
      onStompError: (frame) => {
        console.error('Lỗi WebSocket STOMP: ' + frame.headers['message']);
      },
    });

    stompClient.activate();

    // Cleanup khi component unmount
    return () => {
      stompClient.deactivate();
    };
  }, []);

  // 3. Xử lý sự kiện bấm công tắc gạt On/Off để gọi API điều khiển thiết bị
  const handleToggleDevice = async (deviceId: number, currentStatus: string) => {
    const newCommand = currentStatus === 'ON' ? 'OFF' : 'ON';

    try {
      const response = await fetch('http://localhost:8080/api/v1/farm/devices/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, command: newCommand }),
      });

      const result = await response.json();
      if (result.status === 200) {
        // Cập nhật lại state giao diện ngay lập tức sau khi gọi API thành công
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, status: newCommand } : d))
        );
      }
    } catch (error) {
      console.error('Lỗi khi gửi lệnh điều khiển thiết bị:', error);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">SwiftletCare Admin Dashboard</h1>

      {/* Widget hiển thị số lượng chim nhảy số Real-time */}
      <div className="p-5 bg-blue-50 border border-blue-200 rounded-lg mb-6 shadow-sm">
        <h2 className="text-lg font-semibold text-blue-800">Số lượng chim hiện tại (Real-time WebSocket):</h2>
        <p className="text-4xl font-extrabold text-blue-600 mt-2">{birdCount} <span className="text-xl font-normal text-gray-600">con</span></p>
      </div>

      {/* Khu vực quản lý thiết bị phần cứng & Công tắc gạt On/Off */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Quản lý & Điều khiển thiết bị</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {devices.map((device) => (
            <div key={device.id} className="p-4 border rounded-lg shadow-sm bg-white flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-800">{device.name}</h3>
                <p className="text-sm text-gray-500">Loại: {device.deviceType}</p>
                <p className="text-sm mt-1">
                  Trạng thái:{' '}
                  <span className={device.status === 'ON' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                    {device.status}
                  </span>
                </p>
              </div>
              {/* Nút bấm công tắc gạt On/Off */}
              <button
                onClick={() => handleToggleDevice(device.id, device.status)}
                className={`px-4 py-2 rounded-md text-white font-medium transition ${
                  device.status === 'ON' 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {device.status === 'ON' ? 'Tắt (OFF)' : 'Bật (ON)'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Bảng lịch sử đếm chim & cảnh báo */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Lịch sử đếm chim & Cảnh báo</h2>
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b text-gray-700">
                <th className="p-3">ID</th>
                <th className="p-3">Số lượng chim</th>
                <th className="p-3">Sự kiện</th>
                <th className="p-3">Mô tả</th>
                <th className="p-3">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{log.id}</td>
                    <td className="p-3 font-semibold">{log.birdCount}</td>
                    <td className="p-3">{log.eventType}</td>
                    <td className="p-3">{log.description}</td>
                    <td className="p-3">{log.timestamp}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    Chưa có dữ liệu lịch sử nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}