"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

function handleLogin(e: React.FormEvent) {
  e.preventDefault();
  
  // 1. Lấy danh sách tài khoản đã đăng ký trong bộ nhớ LocalStorage
  const registeredUsers = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
  
  // 2. Kiểm tra xem danh sách có tài khoản nào trùng khớp Email/SĐT và Mật khẩu hay không
  const user = registeredUsers.find(
    (u: any) => (u.email === email || u.phone === email) && u.password === password
  );

  // 3. Nếu KHÔNG tìm thấy -> Báo lỗi ngay lập tức, bắt buộc người dùng phải bấm Đăng ký
  if (!user) {
    alert("Tài khoản không tồn tại hoặc mật khẩu không chính xác! Vui lòng đăng ký tài khoản mới.");
    return; // Dừng lại, không cho phép chuyển trang Dashboard
  }

  // 4. Nếu ĐÃ ĐĂNG KÝ -> Lưu thông tin và chuyển hướng vào Dashboard
  localStorage.setItem("isAuthenticated", "true");
  localStorage.setItem("currentUser", JSON.stringify(user));
  
  router.push("/");
}

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "36px" }}>🕊️</div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: "8px 0" }}>SwiftletCare</h1>
          <p style={{ color: "#666", fontSize: "14px" }}>Hệ thống điều khiển và giám sát nhà yến</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <input
              type="text"
              name="email"                 
              autoComplete="email"
              placeholder="✉ Email / SĐT"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              name="password"              
              autoComplete="current-password"
              placeholder="🔒 Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="checkbox"
              id="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="remember">Ghi nhớ đăng nhập</label>
          </div>

          <button type="submit" style={buttonStyle}>
            Đăng nhập
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <a href="#" style={{ color: "#666", textDecoration: "none" }}>Quên mật khẩu?</a>
          <p style={{ color: "#666", margin: 0 }}>
            Chưa có tài khoản?{" "}
            <Link href="/register" style={{ color: "#16856b", fontWeight: "bold" }}>
              Đăng ký
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Inline Styles hỗ trợ giao diện nhanh chuẩn đẹp
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