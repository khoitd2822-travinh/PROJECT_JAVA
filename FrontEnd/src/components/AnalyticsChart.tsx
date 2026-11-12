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

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function AnalyticsChart() {
  const [data, setData] = useState<AnalyticsPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        // Gọi API history từ telemetryApi trong src/lib/api.ts
        const result = await telemetryApi.history(1, 1, "24h");
        
        // Hỗ trợ cả 2 dạng phản hồi: { data: [...] [...] } hoặc [...] trực tiếp
        const raw = Array.isArray(result?.data) 
          ? result.data 
          : (Array.isArray(result) ? result : []);

        const points: AnalyticsPoint[] = raw.map((row: Record<string, number | string>) => ({
          time: formatTime(String(row.time ?? "")),
          temperature: Number(row.temperature ?? 0),
          humidity: Number(row.humidity ?? 0),
        }));

        if (!cancelled) {
          setData(points);
          if (points.length === 0) {
            setErrorMessage("Chưa có dữ liệu lịch sử từ máy chủ.");
          }
        }
      } catch (error) {
        console.warn("Lỗi khi tải dữ liệu analytics lịch sử:", error);
        if (!cancelled) {
          // TUYỆT ĐỐI KHÔNG DÙNG FALLBACK -> Reset về mảng rỗng để hiển thị No-data state
          setData([]);
          setErrorMessage("Không thể kết nối đến Backend để lấy dữ liệu lịch sử.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
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

      {/* Thông báo lỗi / mất kết nối chi tiết */}
      {errorMessage && (
        <div style={{ marginBottom: "16px", padding: "10px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13px" }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Trạng thái tải, trống hoặc hiển thị biểu đồ thật */}
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
            <YAxis stroke="#64748b" domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
            <Legend />
            <Line type="monotone" dataKey="temperature" name="Nhiệt độ trung bình (°C)" stroke="#16856b" strokeWidth={3} dot />
            <Line type="monotone" dataKey="humidity" name="Độ ẩm trung bình (%)" stroke="#3984cf" strokeWidth={3} dot />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}