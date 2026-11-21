// src/components/AnalyticsChart.tsx
"use client";

import React from "react";
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
import { TelemetryPoint } from "../types/telemetry";

type AnalyticsChartProps = {
  data: TelemetryPoint[];
  isLoading: boolean;
  errorMessage: string | null;
};

export default function AnalyticsChart({ data, isLoading, errorMessage }: AnalyticsChartProps) {
  return (
    <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ color: "#1e293b", fontSize: "18px", fontWeight: "600" }}>
          Biểu đồ phân tích môi trường và vi khí hậu (24h)
        </h3>
        <p style={{ fontSize: "13px", color: "#64748b" }}>Cùng nguồn lịch sử 24 giờ với biểu đồ cảm biến</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "16px", fontSize: "12px", color: "#475569" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "3px", backgroundColor: "#f97316", display: "inline-block", borderRadius: "2px" }}></span> Nhiệt độ (°C)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "3px", backgroundColor: "#3b82f6", display: "inline-block", borderRadius: "2px" }}></span> Độ ẩm (%)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "3px", backgroundColor: "#10b981", display: "inline-block", borderRadius: "2px" }}></span> CO₂ (ppm)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "3px", backgroundColor: "#8b5cf6", display: "inline-block", borderRadius: "2px" }}></span> Âm thanh (dB)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "3px", backgroundColor: "#f59e0b", display: "inline-block", borderRadius: "2px" }}></span> Ánh sáng (Lux)
        </span>
      </div>

      {errorMessage && (
        <div style={{ marginBottom: "16px", padding: "10px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13px" }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "14px" }}>
          Đang tải dữ liệu biểu đồ...
        </div>
      ) : data.length === 0 ? (
        <div style={{ height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", border: "2px dashed #e2e8f0", borderRadius: "8px", padding: "20px", textAlign: "center" }}>
          <span style={{ fontSize: "28px", marginBottom: "8px" }}>📊</span>
          <p style={{ fontWeight: "500", color: "#334155", fontSize: "14px" }}>Chưa có dữ liệu lịch sử hiển thị</p>
          <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Trục biểu đồ sẽ tự động vẽ khi hệ thống nhận được bản tin telemetry.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" stroke="#64748b" />
            <YAxis yAxisId="left" stroke="#64748b" domain={["auto", "auto"]} />
            <YAxis yAxisId="right" orientation="right" stroke="#10b981" domain={["auto", "auto"]} />
            
            <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
            <Legend />
            
            <Line yAxisId="left" type="monotone" dataKey="temperature" name="Nhiệt độ (°C)" stroke="#f97316" strokeWidth={2} dot={false} connectNulls={false} />
            <Line yAxisId="left" type="monotone" dataKey="humidity" name="Độ ẩm (%)" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
            <Line yAxisId="right" type="monotone" dataKey="co2" name="CO₂ (ppm)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
            <Line yAxisId="left" type="monotone" dataKey="light" name="Ánh sáng (Lux)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}