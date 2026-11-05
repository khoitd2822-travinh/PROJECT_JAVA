"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

async function handleRegister(e: React.FormEvent) {
  e.preventDefault();
  if (password !== confirmPassword) {
    alert("Mật khẩu nhập lại không khớp!");
    return;
  }
  if (password.length < 8) {
    alert("Mật khẩu phải có ít nhất 8 ký tự.");
    return;
  }

  try {
    await authApi.register({ fullName, email, password });
    alert("Đăng ký thành công! Vui lòng đăng nhập.");
    router.push("/login");
  } catch (error) {
    alert(error instanceof Error ? error.message : "Đăng ký thất bại");
  }
}

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "36px" }}>🕊️</div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: "8px 0" }}>SwiftletCare</h1>
          <p style={{ color: "#666", fontSize: "14px" }}>Hệ thống điều khiển và giám sát nhà yến</p>
        </div>

        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            type="text"
            placeholder="Họ và tên"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            style={inputStyle}
          />

          <input
            type="text"
            placeholder="✉ Email / SĐT"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          <input
            type="password"
            placeholder="🔒 Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="🔒 Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={eyeButtonStyle}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          <button type="submit" style={buttonStyle}>
            Đăng ký
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "14px" }}>
          <p style={{ color: "#666", margin: 0 }}>
            Đã có tài khoản?{" "}
            <Link href="/login" style={{ color: "#16856b", fontWeight: "bold" }}>
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  backgroundColor: "#f4f6f8",
  padding: "20px",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  padding: "32px",
  borderRadius: "16px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  width: "100%",
  maxWidth: "400px",
  border: "1px solid #e1e4e8",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#16856b",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "8px",
};

const eyeButtonStyle: React.CSSProperties = {
  position: "absolute",
  right: "12px",
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "16px",
};