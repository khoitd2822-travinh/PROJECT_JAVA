"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {ControlSection,AlertsSection,TelegramSection,} from "../../components/DashboardSections";
import { useDeviceControls } from "../../hooks/useDeviceControls";
import { useTelemetry } from "../../hooks/useTelemetry";

import DeviceControlPanel from "../../components/DeviceControlPanel";
import SensorChart from "../../components/SensorChart";
import CameraStream from "../../components/CameraStream";
import AnalyticsChart from "../../components/AnalyticsChart";
import VideoDemoSection from "../../components/VideoDemoSection";

interface SwiftletHouse {
  id: string;
  name: string;
  location: string;
  status: "online" | "warning" | "offline";
}

const menuItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Monitoring", icon: "◉" },
  { name: "Control", icon: "⚙" },
  { name: "Analytics", icon: "▥" },
  { name: "Alerts", icon: "♧" },
  { name: "Telegram", icon: "➤" },
  { name: "Demo", icon: "▶" },
];

export default function DashboardPage() {
  const router = useRouter();

  const [activePage, setActivePage] = useState("Dashboard");
  const [userName, setUserName] = useState("");

  const {
    historyData,
    latestData,
    isLoading,
    errorMessage,
  } = useTelemetry(2000);

  const isConnected =
    latestData?.online === true &&
    latestData?.stale === false;

  const deviceControls = useDeviceControls(isConnected);

  const [house] = useState<SwiftletHouse>({
    id: "house-01",
    name: "Nhà yến Lâm Sơn",
    location: "Lâm Sơn, Ninh Thuận",
    status: "online",
  });

  useEffect(() => {
    const token =
      localStorage.getItem("token") ||
      sessionStorage.getItem("token");

    if (!token) {
      router.replace("/login");
      return;
    }

    const user =
      localStorage.getItem("currentUser") ||
      sessionStorage.getItem("currentUser");

    if (user) {
      try {
        setUserName(JSON.parse(user).fullName || "");
      } catch {
        setUserName("");
      }
    }
  }, [router]);

  const handleLogout = () => {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem("token");
      storage.removeItem("currentUser");
      storage.removeItem("isAuthenticated");
    }

    router.replace("/login");
  };

  const displayVal = (value: unknown, decimals: number) => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "--";
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number.toFixed(decimals)
      : "--";
  };

  const currentTemp = displayVal(
    latestData?.temperature ?? (latestData as any)?.temp,
    2
  );

  const currentHum = displayVal(
    latestData?.humidity ?? (latestData as any)?.hum,
    2
  );

  const currentCo2 = displayVal(
    latestData?.co2 ?? (latestData as any)?.co2Level,
    0
  );

  const currentLight = displayVal(latestData?.light, 0);

  return (
    <main
      className="app-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f8fafc",
        flexWrap: "wrap",
      }}
    >
      <aside
        className="sidebar"
        style={{
          width: "260px",
          minWidth: "240px",
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="brand"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "32px",
          }}
        >
          <div
            className="brand-icon"
            style={{
              width: "36px",
              height: "36px",
              background: "#4f46e5",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              fontWeight: "bold",
            }}
          >
            S
          </div>

          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "bold",
                color: "#1e293b",
              }}
            >
              SwiftletCare
            </h2>

            <p style={{ fontSize: "11px", color: "#64748b" }}>
              SMART FARMING
            </p>
          </div>
        </div>

        <p
          className="menu-label"
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#94a3b8",
            marginBottom: "12px",
          }}
        >
          MAIN MENU
        </p>

        <nav
          className="menu"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
          }}
        >
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`menu-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() => setActivePage(item.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "none",
                background:
                  activePage === item.name
                    ? "#eef2ff"
                    : "transparent",
                color:
                  activePage === item.name
                    ? "#4f46e5"
                    : "#475569",
                fontWeight:
                  activePage === item.name ? "600" : "500",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <span>{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div
          className="sidebar-bottom"
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: "500",
              color: isConnected ? "#059669" : "#dc2626",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: isConnected ? "#10b981" : "#ef4444",
              }}
            />

            {isConnected
              ? "System connected"
              : "System offline"}
          </div>

          <p style={{ marginTop: "4px" }}>{house.name}</p>
        </div>
      </aside>

      <section
        className="main-area"
        style={{
          flex: 1,
          minWidth: "300px",
          padding: "32px",
          overflowY: "auto",
        }}
      >
        <header
          className="topbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <p
              className="eyebrow"
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "#4f46e5",
                textTransform: "uppercase",
              }}
            >
              SWIFTLET FARM MANAGEMENT
            </p>

            <h1
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#1e293b",
              }}
            >
              {activePage}
            </h1>
          </div>

          <div
            className="user-profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              className="avatar"
              style={{
                width: "40px",
                height: "40px",
                background: "#e0e7ff",
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                fontWeight: "bold",
              }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>

            <div>
              <strong
                style={{ fontSize: "14px", color: "#1e293b" }}
              >
                {userName}
              </strong>

              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                Chủ nhà yến
              </p>

              <button
                onClick={handleLogout}
                style={{
                  background: "none",
                  border: "none",
                  color: "#dc2626",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                  marginTop: "2px",
                }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {errorMessage && (
          <div
            style={{
              marginBottom: "24px",
              padding: "12px 16px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "13px",
            }}
          >
            ⚠️ <strong>Cảnh báo hệ thống:</strong>{" "}
            {errorMessage}
          </div>
        )}

        {/* DASHBOARD */}
        {activePage === "Dashboard" && (
          <div>
            <div
              className="welcome"
              style={{
                marginBottom: "24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#1e293b",
                  }}
                >
                  Welcome back!
                </h2>

                <p style={{ fontSize: "14px", color: "#64748b" }}>
                  Giám sát thông số vi khí hậu nhà yến Lâm Sơn.
                </p>
              </div>

              <span
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  background: isConnected ? "#d1fae5" : "#fee2e2",
                  color: isConnected ? "#065f46" : "#991b1b",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                {isConnected
                  ? "● All systems normal"
                  : "● System disconnected"}
              </span>
            </div>

            <div
              className="stats-grid"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "20px",
                marginBottom: "24px",
              }}
            >
              <StatCard
                label="Temperature"
                value={currentTemp}
                unit="°C"
                note="Mức an toàn (26–32°C)"
                icon="♨"
                color="orange"
              />

              <StatCard
                label="Humidity"
                value={currentHum}
                unit="%"
                note="Mức tối ưu (>75%)"
                icon="♧"
                color="blue"
              />

              <StatCard
                label="Air Quality (CO₂)"
                value={currentCo2}
                unit="ppm"
                note="Khí gas / CO₂ ổn định"
                icon="◉"
                color="green"
              />

              <StatCard
                label="Light Intensity"
                value={currentLight}
                unit="Lux"
                note="Ánh sáng phù hợp"
                icon="☼"
                color="purple"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <CameraStream fitVideo />
            </div>

            <div
              className="content-grid"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "20px",
              }}
            >
              <SensorChart
                data={historyData}
                isLoading={isLoading}
                errorMessage={errorMessage}
              />

              <DeviceControlPanel
                controls={deviceControls}
                dashboardStyle
              />
            </div>
          </div>
        )}

        {/* MONITORING */}
        {activePage === "Monitoring" && (
          <div>
            <div
              className="welcome"
              style={{ marginBottom: "24px" }}
            >
              <h2
                style={{ fontSize: "20px", fontWeight: "bold" }}
              >
                Live Environmental Monitoring
              </h2>

              <p style={{ fontSize: "14px", color: "#64748b" }}>
                Theo dõi trực quan vi khí hậu & camera thời gian
                thực.
              </p>
            </div>

            <div
              className="stats-grid"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              <StatCard
                label="Temperature"
                value={currentTemp}
                unit="°C"
                note="Mức an toàn (26–32°C)"
                icon="♨"
                color="orange"
              />

              <StatCard
                label="Humidity"
                value={currentHum}
                unit="%"
                note="Mức tối ưu (>75%)"
                icon="♧"
                color="blue"
              />

              <StatCard
                label="Air Quality (CO₂)"
                value={currentCo2}
                unit="ppm"
                note="Khí CO₂ ổn định"
                icon="◉"
                color="green"
              />

              <StatCard
                label="Light Intensity"
                value={currentLight}
                unit="Lux"
                note="Ánh sáng phù hợp"
                icon="☼"
                color="amber"
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "20px",
              }}
            >
              <SensorChart
                data={historyData}
                isLoading={isLoading}
                errorMessage={errorMessage}
              />

              <CameraStream />
            </div>
          </div>
        )}

        {/* CONTROL */}
        {activePage === "Control" && (
        <ControlSection controls={deviceControls} />
        )}

        {/* ANALYTICS */}
        {activePage === "Analytics" && (
          <div>
            <div
              className="welcome"
              style={{ marginBottom: "24px" }}
            >
              <h2
                style={{ fontSize: "20px", fontWeight: "bold" }}
              >
                Environmental Analytics
              </h2>
            </div>

            <AnalyticsChart
              data={historyData}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          </div>
        )}

               {/* ALERTS */}
        {activePage === "Alerts" && (
          <AlertsSection
            onOpenTelegram={() => setActivePage("Telegram")}
          />
        )}

        {/* TELEGRAM */}
        {activePage === "Telegram" && (
          <TelegramSection />
        )}


        {/* DEMO */}
        {activePage === "Demo" && (
          <div>
            <div
              className="welcome"
              style={{ marginBottom: "24px" }}
            >
              <h2
                style={{ fontSize: "20px", fontWeight: "bold" }}
              >
                System Demo & Testing
              </h2>

              <p style={{ fontSize: "14px", color: "#64748b" }}>
                Khu vực thử nghiệm thủ công các tính năng phụ trợ.
              </p>
            </div>

            <VideoDemoSection />
          </div>
        )}

        <footer
          className="footer"
          style={{
            marginTop: "40px",
            textAlign: "center",
            fontSize: "12px",
            color: "#94a3b8",
          }}
        >
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
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  icon: string;
  color: string;
}) {
  const displayValue =
    !value || value === "undefined" || value === "null"
      ? "--"
      : value;

  return (
    <article
      className="stat-card"
      style={{
        background: "#fff",
        padding: "20px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "14px",
          color: "#64748b",
          marginBottom: "8px",
        }}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>

      <div
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "#1e293b",
          marginBottom: "4px",
        }}
      >
        {displayValue}{" "}
        <small
          style={{
            fontSize: "14px",
            fontWeight: "normal",
            color: "#64748b",
          }}
        >
          {unit}
        </small>
      </div>

      <p
        style={{
          fontSize: "11px",
          color: "#94a3b8",
          margin: 0,
        }}
      >
        {note}
      </p>
    </article>
  );
}