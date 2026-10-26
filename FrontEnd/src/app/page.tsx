
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { houseApi } from "../lib/api";
import { SwiftletHouse } from "../data/mockData";
import SensorChart from "../components/SensorChart";
import CameraStream from "../components/CameraStream";
import AnalyticsChart from "../components/AnalyticsChart";

const menuItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Monitoring", icon: "◉" },
  { name: "Control", icon: "⚙" },
  { name: "Analytics", icon: "▥" },
  { name: "Alerts", icon: "♧" },
];

const initialDevices = [
  { name: "Misting System", description: "Humidity control", on: true },
  { name: "Ventilation Fan", description: "Air circulation", on: true },
  { name: "Heater", description: "Temperature control", on: false },
  { name: "Bird Sound System", description: "Attract swiftlets", on: true },
];

export default function Home() {
  const router = useRouter();//  Khai báo router
  const [activePage, setActivePage] = useState("Dashboard");
  const [devices, setDevices] = useState(initialDevices);
  const [autoMode, setAutoMode] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");
// Thêm dữ liệu từ API / Mock Data
  const [houses, setHouses] = useState<SwiftletHouse[]>([]);
  const [loading, setLoading] = useState(true);

  const [userName, setUserName] = useState("Administrator"); 
  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated");
    if (!auth) {
      router.push("/login");
    } else {
      // Lấy thông tin tài khoản vừa đăng nhập
      const userStr = localStorage.getItem("currentUser");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.fullName) {
          setUserName(user.fullName); // Cập nhật tên người dùng
        }
      }
    }
  }, [router]);

  const handleLogout = () => {
  localStorage.removeItem("isAuthenticated");
  localStorage.removeItem("currentUser");
  router.push("/login");
};

  // Gọi REST API Service khi load trang
  useEffect(() => {
    async function loadData() {
      try {
        const houseData = await houseApi.getHouses();
        setHouses(houseData);
      } catch (error) {
        console.error("Lỗi:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);
  
// Thêm state quản lý tầng được chọn
  const [selectedHouseIndex, setSelectedHouseIndex] = useState(0);

  // Lấy dữ liệu của tầng đang chọn (mặc định Tầng 1 index = 0)
  const currentHouse = houses[selectedHouseIndex] || houses[0] || {
    temperature: 28.4,
    humidity: 82.5,
    co2: 650,
    light: 120,
  };

  function toggleDevice(index: number) {
    setDevices((current) =>
      current.map((device, i) =>
        i === index ? { ...device, on: !device.on } : device
      )
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div>
            <h2>SwiftletCare</h2>
            <p>SMART FARMING SYSTEM</p>
          </div>
        </div>

        <p className="menu-label">MAIN MENU</p>
        <nav className="menu">
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`menu-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() => setActivePage(item.name)}
            >
              <span className="menu-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="online-dot" />
          System online
          <p>Swiftlet House No. 01</p>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">SWIFTLET FARM MANAGEMENT</p>
            <h1>{activePage}</h1>
          </div>
          <div className="user-profile" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="avatar">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{userName}</strong>
              <p style={{ margin: "2px 0 4px 0", fontSize: "12px", color: "#666" }}>Chủ nhà yến</p>
              
              {/* Nút Đăng xuất ngay dưới */}
              <button
                onClick={handleLogout}
                style={{
                  background: "none",
                  border: "none",
                  color: "#d9534f",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  padding: "0",
                  textDecoration: "underline"
                }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {activePage === "Dashboard" && (
          <>
            <div className="welcome"> // hai tang 
              <div>
                <h2>Welcome back!</h2>
                <p>Here is your swiftlet house overview.</p>
              </div>

              {/* Thêm phần chọn tầng vào đây mà không xóa gì cũ */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {houses.length > 0 && (
                  <select
                    value={selectedHouseIndex}
                    onChange={(e) => setSelectedHouseIndex(Number(e.target.value))}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #d0d7de",
                      fontWeight: "600",
                      backgroundColor: "#ffffff",
                      cursor: "pointer"
                    }}
                  >
                    {houses.map((house, idx) => (
                      <option key={house.id || idx} value={idx}>
                        {house.name}
                      </option>
                    ))}
                  </select>
                )}
                <span className="status-pill">● All systems normal</span>
              </div>
            </div>

            <div className="stats-grid">
              <StatCard
                label="Temperature"
                value={String(currentHouse.temperature)}
                unit="°C"
                note="Mức an toàn (26–32°C)"
                icon="♨"
                color="orange"
              />
              <StatCard
                label="Humidity"
                value={String(currentHouse.humidity)}
                unit="%"
                note="Mức tối ưu (>75%)"
                icon="♧"
                color="blue"
              />
              <StatCard
                label="Air Quality (CO₂)"
                value={String(currentHouse.co2)}
                unit="ppm"
                note="Khí gas / CO₂ ổn định"
                icon="◉"
                color="green"
              />
              <StatCard
                label="Light Intensity"
                value={String(currentHouse.light)}
                unit="Lux"
                note="Ánh sáng phù hợp"
                icon="☼"
                color="purple"
              />
            </div>

            <div className="content-grid">
              {/* ĐƯA BIỂU ĐỒ RECHARTS THẬT VÀO ĐÂY THAY CHO KHỐI SVG CŨ */}
              <SensorChart />

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Device Control</h3>
                    <p>Manage your equipment</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setActivePage("Control")}
                  >
                    View all →
                  </button>
                </div>

                <div className="device-list">
                  {devices.slice(0, 3).map((device) => {
                    const index = devices.indexOf(device);
                    return (
                      <div className="device-row" key={device.name}>
                        <div className="device-symbol">⌘</div>
                        <div className="device-info">
                          <strong>{device.name}</strong>
                          <p>{device.description}</p>
                        </div>
                        <button
                          className={`toggle ${device.on ? "on" : ""}`}
                          aria-label={`Toggle ${device.name}`}
                          aria-pressed={device.on}
                          onClick={() => toggleDevice(index)}
                        >
                          <span />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="demo-note">
                  Controls are simulated in this demo.
                </p>
              </section>
            </div>
           

            <section className="panel alerts-panel">
              <div className="panel-heading">
                <div>
                  <h3>Recent Alerts</h3>
                  <p>Latest system notifications</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActivePage("Alerts")}
                >
                  View all →
                </button>
              </div>
              <div className="alert-row">
                <span className="alert-marker warning">!</span>
                <div>
                  <strong>Humidity level is high</strong>
                  <p>Humidity reached 86% · Sample alert</p>
                </div>
                <span className="alert-time">10:42 AM</span>
              </div>
              <div className="alert-row">
                <span className="alert-marker success">✓</span>
                <div>
                  <strong>All sensors connected</strong>
                  <p>System status · Sample notification</p>
                </div>
                <span className="alert-time">09:15 AM</span>
              </div>
            </section>
          </>
        )}

        
{activePage === "Monitoring" && (
  <>
    <div className="welcome">
      <div>
        <h2>Live Environmental Monitoring</h2>
        <p>Monitor environmental conditions and live stream inside your swiftlet house.</p>
      </div>
      <span className="status-pill">● Sensors & Camera connected</span>
    </div>

    <div className="stats-grid">
      <StatCard
        label="Temperature"
        value={String(currentHouse.temperature)}
        unit="°C"
        note="Normal range: 26–32°C"
        icon="♨"
        color="orange"
      />
      <StatCard
        label="Humidity"
        value={String(currentHouse.humidity)}
        unit="%"
        note="Target range: 80–90%"
        icon="♧"
        color="blue"
      />
      <StatCard
        label="CO₂ Level"
        value={String(currentHouse.co2)}
        unit="ppm"
        note="Sample air quality data"
        icon="◉"
        color="green"
      />
      <StatCard
        label="Bird Activity"
        value="1,248"
        unit="birds"
        note="Estimated today"
        icon="⌁"
        color="purple"
      />
    </div>

    {/* GIAO DIỆN SONG SONG: Biểu đồ Recharts và Khung Camera Stream ESP32-CAM */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px", alignItems: "start" }}>
      <SensorChart />
      <CameraStream />
    </div>
  </>
)}

    


{activePage === "Control" && (
  <>
    <div className="welcome">
      <div>
        <h2>Device Control Center</h2>
        <p>Quản lý thiết bị và chế độ hoạt động của nhà yến.</p>
      </div>
      <span className="status-pill">
        ● {autoMode ? "Automatic Mode" : "Manual Mode"}
      </span>
    </div>

    <section className="panel control-panel">
      <div className="panel-heading">
        <div>
          <h3>Operating Mode</h3>
          <p>Chọn chế độ điều khiển thiết bị.</p>
        </div>
        <span className="small-tag">
          {autoMode ? "AUTO" : "MANUAL"}
        </span>
      </div>

      <div className="mode-row">
        <div>
          <strong>
            {autoMode ? "Chế độ tự động" : "Chế độ thủ công"}
          </strong>
          <p className="subtext">
            {autoMode
              ? "Thiết bị đang ở chế độ mô phỏng tự động."
              : "Bạn có thể bật hoặc tắt từng thiết bị."}
          </p>
        </div>

        <button
          type="button"
          className={`toggle ${autoMode ? "on" : ""}`}
          aria-label="Chuyển chế độ điều khiển"
          aria-pressed={autoMode}
          onClick={() => setAutoMode((current) => !current)}
        >
          <span />
        </button>
      </div>
    </section>

    <section className="panel device-control-panel">
      <div className="panel-heading">
        <div>
          <h3>Equipment Control</h3>
          <p>Trạng thái thiết bị trong nhà yến.</p>
        </div>
        <span className="small-tag">
          {devices.filter((device) => device.on).length}/
          {devices.length} thiết bị bật
        </span>
      </div>

      {devices.map((device, index) => (
        <div className="device-row" key={device.name}>
          <div className="device-symbol">
            {index === 0 ? "💧" :
             index === 1 ? "♨" :
             index === 2 ? "🌡" : "🔊"}
          </div>

          <div className="device-info">
            <strong>{device.name}</strong>
            <p>{device.description}</p>
          </div>

          <span
            className={`device-state ${
              device.on ? "state-on" : ""
            }`}
          >
            {device.on ? "ON" : "OFF"}
          </span>

          <button
            type="button"
            className={`toggle ${device.on ? "on" : ""}`}
            aria-label={`Bật hoặc tắt ${device.name}`}
            aria-pressed={device.on}
            disabled={autoMode}
            title={
              autoMode
                ? "Chuyển sang MANUAL để điều khiển thiết bị"
                : "Bật hoặc tắt thiết bị"
            }
            onClick={() => toggleDevice(index)}
          >
            <span />
          </button>
        </div>
      ))}

      <p className="demo-note">
        {autoMode
          ? "Đang ở chế độ AUTO. Chuyển sang MANUAL để thao tác các công tắc."
          : "Chế độ MANUAL: bạn có thể bật hoặc tắt từng thiết bị."}
      </p>
    </section>
  </>
)}

{activePage === "Analytics" && (
  <>
    <div className="welcome">
      <div>
        <h2>Environmental Analytics</h2>
        <p>
          Theo dõi và phân tích các chỉ số môi trường trong nhà yến.
        </p>
      </div>
      <span className="status-pill">● Demo Data</span>
    </div>

    <div className="stats-grid">
      <StatCard
        label="Average Temperature"
        value="29.5"
        unit="°C"
        note="Nhiệt độ trung bình"
        icon="♨"
        color="orange"
      />
      <StatCard
        label="Average Humidity"
        value="86"
        unit="%"
        note="Độ ẩm trung bình"
        icon="♧"
        color="blue"
      />
      <StatCard
        label="Average CO₂"
        value="720"
        unit="ppm"
        note="Nồng độ CO₂ trung bình"
        icon="◉"
        color="green"
      />
      <StatCard
        label="Bird Activity"
        value="1,248"
        unit="birds"
        note="Hoạt động ước tính"
        icon="⌁"
        color="purple"
      />
    </div>

    <section className="panel analytics-panel">
      <AnalyticsChart />
      <p className="demo-note" style={{ marginTop: "15px" }}>
        Biểu đồ phân tích dữ liệu chuyên sâu tích hợp Recharts.
      </p>
    </section>

    <section className="panel analytics-panel">
      <div className="panel-heading">
        <div>
          <h3>Environmental Summary</h3>
          <p>Tổng hợp trạng thái môi trường</p>
        </div>
      </div>

      <div className="monitor-row">
        <span>Temperature</span>
        <strong>29.5 °C</strong>
      </div>

      <div className="monitor-row">
        <span>Humidity</span>
        <strong>86%</strong>
      </div>

      <div className="monitor-row">
        <span>CO₂ Level</span>
        <strong>720 ppm</strong>
      </div>

      <div className="monitor-row">
        <span>Air circulation</span>
        <strong className="good-text">Normal</strong>
      </div>
    </section>
  </>
)}

{activePage === "Alerts" && (
  <>
    <div className="welcome">
      <div>
        <h2>Alerts & Notifications</h2>
        <p>
          Theo dõi các cảnh báo về môi trường và thiết bị trong nhà yến.
        </p>
      </div>

      <span className="status-pill">● System Monitoring</span>
    </div>

    <div className="stats-grid">
  <StatCard
    label="Temperature"
    value={String(currentHouse.temperature)}
    unit="°C"
    note="Mức an toàn (26–32°C)"
    icon="♨"
    color="orange"
  />
  <StatCard
    label="Humidity"
    value={String(currentHouse.humidity)}
    unit="%"
    note="Mức tối ưu (>75%)"
    icon="♧"
    color="blue"
  />
  <StatCard
    label="Air Quality (CO₂)"
    value={String(currentHouse.co2)}
    unit="ppm"
    note="Khí gas / CO₂ ổn định"
    icon="◉"
    color="green"
  />
  <StatCard
    label="Light Intensity"
    value={String(currentHouse.light)}
    unit="Lux"
    note="Ánh sáng phù hợp"
    icon="☼"
    color="purple"
  />
</div>

    <section className="panel alerts-panel">
      <div className="panel-heading">
        <div>
          <h3>Recent Alerts</h3>
          <p>Danh sách cảnh báo gần đây</p>
        </div>

        <span className="small-tag">Demo Data</span>
      </div>

      <div className="alert-row">
        <div className="alert-marker warning">!</div>
        <div>
          <strong>High Humidity Warning</strong>
          <p>Độ ẩm mẫu đạt 92%, vượt ngưỡng mục tiêu.</p>
        </div>
        <span className="alert-time">10:30</span>
      </div>

      <div className="alert-row">
        <div className="alert-marker warning">!</div>
        <div>
          <strong>Temperature Alert</strong>
          <p>Nhiệt độ mẫu đạt 34°C, cần kiểm tra hệ thống thông gió.</p>
        </div>
        <span className="alert-time">09:45</span>
      </div>

      <div className="alert-row">
        <div className="alert-marker success">✓</div>
        <div>
          <strong>Misting System</strong>
          <p>Thiết bị đang hoạt động bình thường trong dữ liệu mô phỏng.</p>
        </div>
        <span className="alert-time">09:15</span>
      </div>

      <div className="alert-row">
        <div className="alert-marker success">✓</div>
        <div>
          <strong>System Status</strong>
          <p>Giao diện giám sát đang hoạt động.</p>
        </div>
        <span className="alert-time">08:50</span>
      </div>

      <p className="demo-note">
        Các cảnh báo hiện là dữ liệu mẫu, chưa được tạo tự động từ cảm biến thật.
      </p>
    </section>
  </>
)}

{activePage !== "Dashboard" &&
  activePage !== "Monitoring" &&
  activePage !== "Control" &&
  activePage !== "Analytics" &&
  activePage !== "Alerts" && (
    <section className="panel placeholder-panel">
      <h2>{activePage}</h2>
      <p>This page has not been implemented yet.</p>
    </section>
)}

<footer className="footer">
  SwiftletCare © 2026 · Smart Swiftlet House Monitoring
</footer>
</section>
</main>
);
}

function StatCard({
  label,
  value,
  unit,
  note,
  icon,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  icon: string;
  color: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className="stat-value">
        {value} <small>{unit}</small>
      </div>
      <p>{note}</p>
    </article>
  );
}
