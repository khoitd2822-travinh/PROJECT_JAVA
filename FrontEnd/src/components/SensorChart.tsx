"use client";

import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function SensorChart() {
  const [data, setData] = useState([]);

  const fetchSensorData = async () => {
    try {
      const response = await fetch("http://localhost:8080/api/v1/telemetry/history?range=24h");
      if (!response.ok) throw new Error("Lỗi gọi API lịch sử");
      const result = await response.json();

    // Kiểm tra cấu trúc bọc data mới từ Backend (TV5)
      if (result.status === 200 && result.data) {
        const parsedData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
        // Nếu API trả về dạng mảng lịch sử thì set trực tiếp, nếu là object đơn lẻ thì đưa vào mảng
        setData(Array.isArray(parsedData) ? parsedData : [parsedData]);
      } else if (Array.isArray(result)) {
        // Trường hợp API trả thẳng về mảng
        setData(result);
      }
    } catch (error) {
      // Dữ liệu mẫu 24h giả lập 4 chỉ số khi phần cứng/backend chưa sẵn sàng
      setData([
        { time: "00:00", temperature: 27.5, humidity: 85, co2: 500, sound: 65 },
        { time: "04:00", temperature: 26.8, humidity: 88, co2: 480, sound: 40 },
        { time: "08:00", temperature: 28.0, humidity: 82, co2: 550, sound: 85 },
        { time: "12:00", temperature: 31.2, humidity: 75, co2: 620, sound: 90 },
        { time: "16:00", temperature: 30.0, humidity: 78, co2: 590, sound: 85 },
        { time: "20:00", temperature: 28.2, humidity: 83, co2: 520, sound: 70 },
      ] as any);
    }
  };

  useEffect(() => {
    fetchSensorData();
    const interval = setInterval(fetchSensorData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ color: "#1e293b", fontSize: "18px", fontWeight: "600" }}>
          📊 Biểu đồ Lịch sử Vi Khí Hậu & Âm Thanh (24h)
        </h3>
        <p style={{ fontSize: "13px", color: "#64748b" }}>Theo dõi biến động nhiệt, ẩm, CO2 và cường độ âm thanh loa dẫn dụ</p>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="time" stroke="#64748b" />
          <YAxis stroke="#64748b" />
          <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
          <Legend />

          <Line type="monotone" dataKey="temperature" name="Nhiệt độ (°C)" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="humidity" name="Độ ẩm (%)" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="co2" name="Khí CO₂ (ppm)" stroke="#10b981" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="sound" name="Âm thanh loa (dB)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}