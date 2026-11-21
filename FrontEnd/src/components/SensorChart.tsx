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

type SensorPoint = {
  time: string;
  temperature: number;
  humidity: number;
  co2: number;
  sound: number;
};

const fallback: SensorPoint[] = [
  { time: "00:00", temperature: 27.5, humidity: 85, co2: 500, sound: 65 },
  { time: "04:00", temperature: 26.8, humidity: 88, co2: 480, sound: 40 },
  { time: "08:00", temperature: 28.0, humidity: 82, co2: 550, sound: 85 },
  { time: "12:00", temperature: 31.2, humidity: 75, co2: 620, sound: 90 },
  { time: "16:00", temperature: 30.0, humidity: 78, co2: 590, sound: 85 },
  { time: "20:00", temperature: 28.2, humidity: 83, co2: 520, sound: 70 },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function SensorChart() {
  const [data, setData] = useState<SensorPoint[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await telemetryApi.history(1, 1, "24h");
        const raw = Array.isArray(result?.data) ? result.data : [];
        const points: SensorPoint[] = raw.map((row: Record<string, number | string>) => ({
          time: formatTime(String(row.time ?? "")),
          temperature: Number(row.temperature ?? 0),
          humidity: Number(row.humidity ?? 0),
          co2: Number(row.co2 ?? 0),
          sound: Number(row.sound ?? 0),
        }));
        if (!cancelled) setData(points);
      } catch (error) {
        console.warn("Chưa lấy được lịch sử cảm biến, dùng dữ liệu mẫu:", error);
        if (!cancelled) setData(fallback);
      }
    }

    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ color: "#1e293b", fontSize: "18px", fontWeight: "600" }}>
          Biểu đồ lịch sử vi khí hậu và âm thanh (24h)
        </h3>
        <p style={{ fontSize: "13px", color: "#64748b" }}>
          Theo dõi nhiệt độ, độ ẩm, CO2 và âm thanh
        </p>
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
          <Line type="monotone" dataKey="co2" name="Khí CO2 (ppm)" stroke="#10b981" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="sound" name="Âm thanh (dB)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
