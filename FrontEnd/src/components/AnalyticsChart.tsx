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

export default function AnalyticsChart() {
  const [data, setData] = useState([]);

  const fetchAnalyticsData = async () => {
    try {
      // Sau này khi TV5 làm xong API, chỉ cần trỏ vào đây
      const response = await fetch("http://localhost:8080/api/v1/analytics/trend");
      if (!response.ok) throw new Error("Lỗi gọi API Analytics");
      const result = await response.json();

// Xử lý bóc tách cấu trúc bọc data từ Backend 
      if (result.status === 200 && result.data) {
        const parsedData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
        setData(Array.isArray(parsedData) ? parsedData : [parsedData]);
      } else if (Array.isArray(result)) {
        setData(result);
      }
    
    } catch (error) {
      // Dữ liệu mẫu minh họa theo các mốc giờ trong ngày
      setData([
        { time: "08:00", temperature: 29.0, humidity: 85 },
        { time: "09:00", temperature: 29.5, humidity: 86 },
        { time: "10:00", temperature: 30.1, humidity: 82 },
        { time: "11:00", temperature: 31.0, humidity: 79 },
        { time: "12:00", temperature: 31.5, humidity: 76 },
        { time: "13:00", temperature: 30.8, humidity: 80 },
        { time: "14:00", temperature: 29.9, humidity: 84 },
      ] as any);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  return (
    <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ color: "#1e293b", fontSize: "18px", fontWeight: "600" }}>
          📊 Biểu đồ Biến động Nhiệt độ & Độ ẩm (Analytics)
        </h3>
        <p style={{ fontSize: "13px", color: "#64748b" }}>Phân tích xu hướng môi trường theo thời gian thực</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="time" stroke="#64748b" />
          <YAxis stroke="#64748b" />
          <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
          <Legend />

          <Line type="monotone" dataKey="temperature" name="Nhiệt độ trung bình (°C)" stroke="#16856b" strokeWidth={3} dot={true} />
          <Line type="monotone" dataKey="humidity" name="Độ ẩm trung bình (%)" stroke="#3984cf" strokeWidth={3} dot={true} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}