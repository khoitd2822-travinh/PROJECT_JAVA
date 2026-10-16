
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { houseApi } from "../lib/api";
import { SwiftletHouse } from "../data/mockData";

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
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Environmental Conditions</h3>
                    <p>Sample temperature readings</p>
                  </div>
                  <span className="small-tag">Today</span>
                </div>
                <div className="chart">
                  <div className="chart-labels">
                    <span>34°C</span>
                    <span>32°C</span>
                    <span>30°C</span>
                    <span>28°C</span>
                    <span>26°C</span>
                  </div>
                  <svg
                    viewBox="0 0 600 200"
                    className="chart-svg"
                    role="img"
                    aria-label="Sample temperature chart"
                  >
                    {[25, 65, 105, 145, 185].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="600"
                        y2={y}
                        stroke="#e8edf3"
                        strokeDasharray="4 5"
                      />
                    ))}
                    <path
                      d="M0 125 L75 110 L150 120 L225 75 L300 90 L375 60 L450 80 L525 45 L600 65"
                      fill="none"
                      stroke="#219b80"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {[
                      [0, 125], [75, 110], [150, 120],
                      [225, 75], [300, 90], [375, 60],
                      [450, 80], [525, 45], [600, 65],
                    ].map(([x, y]) => (
                      <circle key={x} cx={x} cy={y} r="4" fill="#219b80" />
                    ))}
                  </svg>
                </div>
                <div className="chart-times">
                  <span>06:00</span>
                  <span>09:00</span>
                  <span>12:00</span>
                  <span>15:00</span>
                  <span>18:00</span>
                </div>
                <p className="demo-note">
                  Demonstration data — not connected to real sensors.
                </p>
              </section>

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
        <p>Monitor environmental conditions inside your swiftlet house.</p>
      </div>
      <span className="status-pill">● Sensors connected</span>
    </div>

    <div className="stats-grid">
      <StatCard
        label="Temperature"
        value="29.5"
        unit="°C"
        note="Normal range: 26–32°C"
        icon="♨"
        color="orange"
      />
      <StatCard
        label="Humidity"
        value="86"
        unit="%"
        note="Target range: 80–90%"
        icon="♧"
        color="blue"
      />
      <StatCard
        label="CO₂ Level"
        value="720"
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

    <div className="content-grid">
      {/* Camera và tải video */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Swiftlet House Camera</h3>
            <p>Upload a video to preview</p>
          </div>
          <span className="small-tag">Demo</span>
        </div>

        <div className="camera-placeholder">
          {!videoUrl ? (
            <>
              <div className="camera-symbol">◉</div>
              <h3>Camera Preview</h3>
              <p>Chọn video từ máy tính để xem tại đây.</p>
            </>
          ) : (
            <div className="w-full">
              <video
                src={videoUrl}
                controls
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: "400px" }}
              />
              <p className="mt-2">{videoName}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <label
              htmlFor="swiftlet-video"
              className="upload-button"
            >
              📁 Chọn video từ máy tính
            </label>

            {videoUrl && (
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  setVideoUrl((oldUrl) => {
                    if (oldUrl) URL.revokeObjectURL(oldUrl);
                    return "";
                  });
                  setVideoName("");

                  const input = document.getElementById(
                    "swiftlet-video"
                  ) as HTMLInputElement | null;

                  if (input) input.value = "";
                }}
              >
                ✕ Xóa video
              </button>
            )}
          </div>

          <input
            id="swiftlet-video"
            type="file"
            accept="video/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                setVideoUrl((oldUrl) => {
                  if (oldUrl) URL.revokeObjectURL(oldUrl);
                  return URL.createObjectURL(file);
                });
                setVideoName(file.name);
              }
            }}
          />
        </div>

        {!videoUrl && (
          <p className="demo-note">
            Chưa chọn video. Nhấn nút phía trên để tải video từ máy tính.
          </p>
        )}
      </section>

      {/* Trạng thái môi trường */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Environmental Status</h3>
            <p>Sample sensor readings</p>
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
          <span>CO₂</span>
          <strong>720 ppm</strong>
        </div>

        <div className="monitor-row">
          <span>Air circulation</span>
          <strong className="good-text">Normal</strong>
        </div>

        <div className="monitor-row">
          <span>Predator detection</span>
          <strong className="good-text">No demo alert</strong>
        </div>
      </section>
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
      <div className="panel-heading">
        <div>
          <h3>Temperature & Humidity Trend</h3>
          <p>Biểu đồ biến động các chỉ số theo thời gian</p>
        </div>
        <span className="small-tag">Last 7 hours</span>
      </div>

      <div className="analytics-chart">
        <svg
          viewBox="0 0 600 240"
          preserveAspectRatio="none"
          role="img"
          aria-label="Biểu đồ nhiệt độ và độ ẩm minh họa"
        >
          {[30, 75, 120, 165, 210].map((y) => (
            <line
              key={y}
              x1="35"
              y1={y}
              x2="585"
              y2={y}
              stroke="#e7ecf2"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          <polyline
            points="35,145 125,115 215,130 305,75 395,95 485,55 585,80"
            fill="none"
            stroke="#16856b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <polyline
            points="35,185 125,165 215,175 305,145 395,155 485,125 585,140"
            fill="none"
            stroke="#3984cf"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {[
            [35, 145],
            [125, 115],
            [215, 130],
            [305, 75],
            [395, 95],
            [485, 55],
            [585, 80],
          ].map(([x, y]) => (
            <circle
              key={`temp-${x}`}
              cx={x}
              cy={y}
              r="4"
              fill="#16856b"
            />
          ))}

          {[
            [35, 185],
            [125, 165],
            [215, 175],
            [305, 145],
            [395, 155],
            [485, 125],
            [585, 140],
          ].map(([x, y]) => (
            <circle
              key={`humidity-${x}`}
              cx={x}
              cy={y}
              r="4"
              fill="#3984cf"
            />
          ))}
        </svg>
      </div>

      <div className="chart-times">
        <span>08:00</span>
        <span>09:00</span>
        <span>10:00</span>
        <span>11:00</span>
        <span>12:00</span>
        <span>13:00</span>
        <span>14:00</span>
      </div>

      <div className="chart-legend">
        <span>
          <i className="legend-dot temperature-dot" />
          Temperature
        </span>
        <span>
          <i className="legend-dot humidity-dot" />
          Humidity
        </span>
      </div>

      <p className="demo-note">
        Dữ liệu biểu đồ chỉ mang tính minh họa, chưa lấy từ cảm biến thực tế.
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
