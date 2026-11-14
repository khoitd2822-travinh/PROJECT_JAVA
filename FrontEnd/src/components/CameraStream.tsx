"use client";

import React, { useState } from "react";

export default function CameraStream() {
  // Thay đổi địa chỉ IP theo mạng LAN của ESP32-CAM thực tế
  const [streamUrl, setStreamUrl] = useState("http://192.168.1.100/stream");
  const [isStreaming, setIsStreaming] = useState(false);

  return (
    <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <div>
          <h3 style={{ color: "#1e293b", fontSize: "18px", fontWeight: "600" }}>🎥 Camera Trực Tiếp (ESP32-CAM)</h3>
          <p style={{ fontSize: "13px", color: "#64748b" }}>Quan sát cửa thu chim yến thời gian thực</p>
        </div>
        <span className={`status-pill ${isStreaming ? "online" : ""}`}>
          ● {isStreaming ? "Đang kết nối Stream" : "Chờ kết nối"}
        </span>
      </div>

      {/* Khung hiển thị Video Stream trực tiếp bằng thẻ img */}
      <div style={{ width: "100%", height: "300px", background: "#0f172a", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {isStreaming ? (
          <img
            src={streamUrl}
            alt="ESP32-CAM Stream"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => {
              alert("Không thể kết nối tới ESP32-CAM. Kiểm tra lại IP hoặc nguồn điện!");
              setIsStreaming(false);
            }}
          />
        ) : (
          <div style={{ textAlign: "center", color: "#94a3b8" }}>
            <p style={{ fontSize: "40px", marginBottom: "10px" }}>📷</p>
            <p>Luồng video đang tắt hoặc chưa cấu hình IP</p>
          </div>
        )}
      </div>

      {/* Điều khiển nhập IP stream */}
      <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          placeholder="Nhập URL Stream (VD: http://192.168.1.50/stream)"
          style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
        />
        <button
          onClick={() => setIsStreaming(!isStreaming)}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: isStreaming ? "#ef4444" : "#10b981",
            color: "#ffffff",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          {isStreaming ? "Ngắt kết nối" : "Kết nối Stream"}
        </button>
      </div>
    </div>
  );
}