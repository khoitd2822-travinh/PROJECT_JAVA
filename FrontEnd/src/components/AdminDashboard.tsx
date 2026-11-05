"use client";

import React, { useEffect, useState } from "react";
import { Client } from "@stomp/stompjs";
import { birdApi, farmApi } from "../lib/api";

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
  const [message, setMessage] = useState("");

  useEffect(() => {
    farmApi
      .getDevices(1, 1)
      .then((data) => {
        if (data.status === 200 && Array.isArray(data.data)) setDevices(data.data);
      })
      .catch((err) => {
        console.error("Lỗi tải thiết bị:", err);
        setMessage("Không tải được thiết bị. Hãy đăng nhập lại.");
      });

    birdApi
      .logs(1, 1)
      .then((data) => {
        if (data.status === 200 && Array.isArray(data.data)) setLogs(data.data);
      })
      .catch((err) => console.error("Lỗi tải lịch sử đếm chim:", err));
  }, []);

  useEffect(() => {
    const stompClient = new Client({
      brokerURL: "ws://localhost:8080/ws-swiftlet",
      reconnectDelay: 5000,
      onConnect: () => {
        stompClient.subscribe("/topic/alerts", (frame) => {
          const alert = JSON.parse(frame.body);
          if (alert.birdCount == null) return;
          setBirdCount(alert.birdCount);
          setLogs((prev) => [alert, ...prev]);
        });
      },
      onStompError: (frame) => {
        console.error("Lỗi WebSocket STOMP: " + frame.headers["message"]);
      },
    });

    stompClient.activate();
    return () => {
      stompClient.deactivate();
    };
  }, []);

  const handleToggleDevice = async (deviceId: number, currentStatus: string) => {
    const newCommand: "ON" | "OFF" = currentStatus === "ON" ? "OFF" : "ON";
    try {
      const result = await farmApi.control(deviceId, newCommand);
      if (result.status === 200) {
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, status: newCommand } : d))
        );
        setMessage(result.message || "Đã gửi lệnh");
      }
    } catch (error) {
      console.error("Lỗi khi gửi lệnh điều khiển thiết bị:", error);
      setMessage("Gửi lệnh thất bại. Kiểm tra EMQX và token đăng nhập.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">SwiftletCare Admin Dashboard</h1>
      {message ? <p style={{ color: "#9a3412", marginBottom: 12 }}>{message}</p> : null}

      <div className="p-5 bg-blue-50 border border-blue-200 rounded-lg mb-6 shadow-sm">
        <h2 className="text-lg font-semibold text-blue-800">Số lượng chim hiện tại</h2>
<p className="text-4xl font-extrabold text-blue-600 mt-2">
          {birdCount} <span className="text-xl font-normal text-gray-600">con</span>
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Quản lý và điều khiển thiết bị</h2>
        {devices.length === 0 ? (
          <p className="text-gray-500">Chưa có thiết bị trong nhà yến 1 / tầng 1.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {devices.map((device) => (
              <div key={device.id} className="p-4 border rounded-lg shadow-sm bg-white flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">{device.name}</h3>
                  <p className="text-sm text-gray-500">Loại: {device.deviceType}</p>
                  <p className="text-sm mt-1">
                    Trạng thái:{" "}
                    <span className={device.status === "ON" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {device.status}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleToggleDevice(device.id, device.status)}
                  className={`px-4 py-2 rounded-md text-white font-medium transition ${
                    device.status === "ON" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                  }`}
                >
                  {device.status === "ON" ? "Tắt (OFF)" : "Bật (ON)"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Lịch sử đếm chim và cảnh báo</h2>
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
                logs.map((log, index) => (
                  <tr key={`${log.id ?? "live"}-${index}`} className="border-b hover:bg-gray-50">
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
