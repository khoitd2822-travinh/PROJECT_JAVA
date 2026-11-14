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
import { telemetryApi } from "../lib/api";

type AnalyticsPoint = {
  time: string;
  temperature: number;
  humidity: number;
};

const fallback: AnalyticsPoint[] = [
  { time: "08:00", temperature: 29.0, humidity: 85 },
  { time: "09:00", temperature: 29.5, humidity: 86 },
  { time: "10:00", temperature: 30.1, humidity: 82 },
  { time: "11:00", temperature: 31.0, humidity: 79 },
  { time: "12:00", temperature: 31.5, humidity: 76 },
  { time: "13:00", temperature: 30.8, humidity: 80 },
  { time: "14:00", temperature: 29.9, humidity: 84 },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function AnalyticsChart() {
  const [data, setData] = useState<AnalyticsPoint[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await telemetryApi.history(1, 1, "24h");
        const raw = Array.isArray(result?.data) ? result.data : [];
        const points: AnalyticsPoint[] = raw.map((row: Record<string, number | string>) => ({
          time: formatTime(String(row.time ?? "")),
          temperature: Number(row.temperature ?? 0),
          humidity: Number(row.humidity ?? 0),
        }));
        if (!cancelled) setData(points.length > 0 ? points : fallback);
      } catch (error) {
        console.warn("Chưa lấy được analytics, dùng dữ liệu mẫu:", error);
        if (!cancelled) setData(fallback);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ color: "#1e293b", fontSize: "18px", fontWeight: "600" }}>
          Biểu đồ biến động nhiệt độ và độ ẩm
        </h3>
        <p style={{ fontSize: "13px", color: "#64748b" }}>Cùng nguồn lịch sử 24 giờ với biểu đồ cảm biến</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="time" stroke="#64748b" />
          <YAxis stroke="#64748b" />
          <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
          <Legend />
          <Line type="monotone" dataKey="temperature" name="Nhiệt độ trung bình (°C)" stroke="#16856b" strokeWidth={3} dot />
          <Line type="monotone" dataKey="humidity" name="Độ ẩm trung bình (%)" stroke="#3984cf" strokeWidth={3} dot />
        </LineChart>
</ResponsiveContainer>
    </div>
  );
}