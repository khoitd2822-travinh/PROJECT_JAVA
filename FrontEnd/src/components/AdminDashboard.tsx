"use client";

import React, { useEffect, useState } from "react";
import { Client } from "@stomp/stompjs";
import { birdApi, farmApi } from "../lib/api";

interface Device {
  id: number;
  name: string;
  deviceType: string;
  status: string;
  controlMode?: string; // Hỗ trợ hiển thị AUTO / MANUAL
  actualState?: number;
  lastAckStatus?: string; // SUCCESS, FAILED, PENDING
  lastMessage?: string;
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
  const [loadingDeviceId, setLoadingDeviceId] = useState<number | null>(null);

  // Tải danh sách thiết bị và log ban đầu
  useEffect(() => {
    farmApi
      .getDevices()
      .then((data) => {
        if (data.status === 200 && Array.isArray(data.data)) {
          setDevices(data.data);
        } else if (Array.isArray(data)) {
          setDevices(data);
        }
      })
      .catch((err) => {
        console.error("Lỗi tải thiết bị:", err);
        setMessage("Không tải được thiết bị. Hãy đăng nhập lại.");
      });

    birdApi
      .logs()
      .then((data) => {
        if (data.status === 200 && Array.isArray(data.data)) {
          setLogs(data.data);
        } else if (Array.isArray(data)) {
          setLogs(data);
        }
      })
      .catch((err) => console.error("Lỗi tải lịch sử đếm chim:", err));
  }, []);

  // Kết nối WebSocket (STOMP) real-time cho Alerts và Device Status / ACK
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws-swiftlet";
    const stompClient = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        // Lắng nghe cảnh báo chim
        stompClient.subscribe("/topic/alerts", (frame) => {
          try {
            const alert = JSON.parse(frame.body);
            if (alert.birdCount != null) {
              setBirdCount(alert.birdCount);
              setLogs((prev) => [alert, ...prev]);
            }
          } catch (e) {
            console.error("Lỗi parse JSON WebSocket alerts:", e);
          }
        });

        // Lắng nghe trạng thái thiết bị và ACK từ phần cứng
        stompClient.subscribe("/topic/device-status", (frame) => {
          try {
            const updatedDevice = JSON.parse(frame.body);
            setDevices((prev) =>
              prev.map((d) => (d.id === updatedDevice.id ? { ...d, ...updatedDevice } : d))
            );
          } catch (e) {
            console.error("Lỗi parse JSON WebSocket device-status:", e);
          }
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

  // Hàm gửi lệnh điều khiển thiết bị (ON, OFF, AUTO, MANUAL)
  const handleControlCommand = async (deviceId: number, command: "ON" | "OFF" | "AUTO" | "MANUAL") => {
    if (loadingDeviceId !== null) return;

    setLoadingDeviceId(deviceId);
    setMessage(`Đang gửi lệnh ${command} cho thiết bị #${deviceId}...`);

    try {
      const result = await farmApi.control(deviceId, command);
      
      if (result) {
        setMessage(`Đã gửi lệnh ${command} thành công! (Đang chờ ACK từ thiết bị...)`);
        
        // Cập nhật trạng thái tạm thời trên giao diện
        setDevices((prev) =>
          prev.map((d) => {
            if (d.id === deviceId) {
              return {
                ...d,
                status: command === "ON" || command === "OFF" ? command : d.status,
                controlMode: command === "AUTO" || command === "MANUAL" ? command : d.controlMode,
                lastAckStatus: "PENDING",
              };
            }
            return d;
          })
        );
      }
    } catch (error: any) {
      console.error("Lỗi khi gửi lệnh điều khiển thiết bị:", error);
      setMessage(error.message || "Gửi lệnh thất bại hoặc Timeout.");
    } finally {
      setLoadingDeviceId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">SwiftletCare Admin Dashboard</h1>
      {message ? <p className="text-amber-700 bg-amber-50 p-3 rounded mb-4 text-sm font-medium">{message}</p> : null}

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
            {devices.map((device) => {
              const isLoading = loadingDeviceId === device.id;
              const isOnline = device.status === "ON";
              const isAuto = device.controlMode === "AUTO";

              return (
                <div key={device.id} className="p-4 border rounded-lg shadow-sm bg-white flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-gray-800">{device.name}</h3>
                      {/* Huy hiệu Chế độ AUTO / MANUAL */}
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                        isAuto ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {device.controlMode || "MANUAL"}
                      </span>
                    </div>

                    <p className="text-sm text-gray-500 mb-2">Loại: {device.deviceType}</p>
                    
                    {/* Trạng thái thiết bị */}
                    <div className="flex items-center justify-between text-sm mt-1 bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Trạng thái:</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                        isOnline ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {device.status || "UNKNOWN"}
                      </span>
                    </div>

                    {/* Khu vực hiển thị kết quả ACK */}
                    <div className="mt-2 text-xs text-gray-600 border-t pt-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-500">Phản hồi ACK:</span>
                        <span className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${
                          device.lastAckStatus === "SUCCESS" ? "bg-green-50 text-green-600" :
                          device.lastAckStatus === "FAILED" ? "bg-red-50 text-red-600" :
                          device.lastAckStatus === "PENDING" ? "bg-yellow-50 text-yellow-600 animate-pulse" :
                          device.lastAckStatus === "TIMED_OUT" ? "bg-orange-50 text-orange-600" :
                          "text-gray-400"
                        }`}>
                          {device.lastAckStatus || "Chưa có lệnh"}
                        </span>
                      </div>
                      {device.lastMessage && (
                        <p className="text-gray-500 mt-1 italic truncate" title={device.lastMessage}>
                          "{device.lastMessage}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Nhóm nút điều khiển ON / OFF / AUTO / MANUAL */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleControlCommand(device.id, isOnline ? "OFF" : "ON")}
                      disabled={isLoading}
                      className={`flex-1 px-3 py-1.5 rounded-md text-white text-sm font-medium transition ${
                        isLoading
                          ? "bg-gray-400 cursor-not-allowed"
                          : isOnline
                          ? "bg-red-500 hover:bg-red-600"
                          : "bg-green-500 hover:bg-green-600"
                      }`}
                    >
                      {isLoading ? "Đang gửi..." : isOnline ? "Tắt (OFF)" : "Bật (ON)"}
                    </button>

                    <button
                      onClick={() => handleControlCommand(device.id, isAuto ? "MANUAL" : "AUTO")}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition"
                    >
                      {isAuto ? "Chuyển MANUAL" : "Chuyển AUTO"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Lịch sử đếm chim và cảnh báo</h2>
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b text-gray-700 text-sm">
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
                  <tr key={`${log.id ?? "live"}-${index}`} className="border-b hover:bg-gray-50 text-sm">
                    <td className="p-3">{log.id}</td>
                    <td className="p-3 font-semibold">{log.birdCount}</td>
                    <td className="p-3">{log.eventType}</td>
                    <td className="p-3">{log.description}</td>
                    <td className="p-3">{log.timestamp}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500 text-sm">
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