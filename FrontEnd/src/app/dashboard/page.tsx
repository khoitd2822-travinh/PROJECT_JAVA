'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { farmApi } from '../../lib/api';
import { useTelemetry } from '../../hooks/useTelemetry';
import SensorChart from '../../components/SensorChart';
import CameraStream from '../../components/CameraStream';
import AnalyticsChart from '../../components/AnalyticsChart';
import VideoDemoSection from '../../components/VideoDemoSection';

interface SwiftletHouse {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'warning' | 'offline';
}

const menuItems = [
  { name: 'Dashboard', icon: '▦' },
  { name: 'Monitoring', icon: '◉' },
  { name: 'Control', icon: '⚙' },
  { name: 'Analytics', icon: '▥' },
  { name: 'Alerts', icon: '♧' },
  { name: 'Demo', icon: '▶' },
];

const initialDevices = [
  { id: 1, name: 'Misting System', description: 'Hệ thống phun sương tạo ẩm', on: false },
  { id: 2, name: 'Ventilation Fan', description: 'Quạt thông gió và lưu thông khí', on: false },
  { id: 3, name: 'Heater', description: 'Hệ thống sưởi ấm điều hòa nhiệt độ', on: false },
  { id: 4, name: 'Bird Sound System', description: 'Loa dẫn dụ và phát tiếng chim yến', on: false },
];

export default function DashboardPage() {
  const router = useRouter();
  const [activePage, setActivePage] = useState('Dashboard');
  const [devices, setDevices] = useState<any[]>(initialDevices);
  const [autoMode, setAutoMode] = useState(true);
  const [userName, setUserName] = useState('Administrator');
  const [commandLoading, setCommandLoading] = useState<number | null>(null);

  // Sử dụng ref để theo dõi active intervals nhằm cleanup khi unmount
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sử dụng custom hook useTelemetry (polling mỗi 5 giây)
  const { historyData, latestData, isLoading, errorMessage } = useTelemetry(5000);

  const [house, setHouse] = useState<SwiftletHouse>({
    id: 'house-01',
    name: 'Nhà yến Lâm Sơn',
    location: 'Lâm Sơn, Ninh Thuận',
    status: 'online',
  });

  // Cleanup toàn bộ interval khi component unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Kiểm tra đăng nhập
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
      return;
    }

    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.fullName) setUserName(user.fullName);
      } catch {
        localStorage.removeItem('currentUser');
      }
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    router.replace('/login');
  };

  // Tải danh sách thiết bị thật từ Backend kèm AbortController chống rò rỉ request
  useEffect(() => {
    const controller = new AbortController();

    async function fetchDevices() {
      if (!localStorage.getItem('token')) return;
      try {
        const data = await farmApi.getDevices(1, 1);
        const rawList = Array.isArray(data) ? data : data.data || [];
        
        const standardDevices = [
          { defaultName: 'Misting System', description: 'Hệ thống phun sương tạo ẩm' },
          { defaultName: 'Ventilation Fan', description: 'Quạt thông gió và lưu thông khí' },
          { defaultName: 'Heater', description: 'Hệ thống sưởi ấm điều hòa nhiệt độ' },
          { defaultName: 'Bird Sound System', description: 'Loa dẫn dụ và phát tiếng chim yến' },
        ];

        const mappedDevices = standardDevices.map((std, index) => {
          const found = rawList.find((d: any) => 
            d.name?.toLowerCase().includes(std.defaultName.toLowerCase()) ||
            d.deviceType?.toLowerCase().includes(std.defaultName.toLowerCase())
          );

          if (found) {
            return {
              id: found.id,
              name: found.name,
              description: std.description,
              on: found.status === 'ON' || found.actualState === 1 || found.status === true,
              controlMode: found.controlMode,
              lastAckStatus: found.lastAckStatus,
              lastMessage: found.lastMessage,
            };
          } else {
            return {
              id: index + 1,
              name: std.defaultName,
              description: std.description,
              on: false,
            };
          }
        });

        setDevices(mappedDevices);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Không tải được thiết bị từ backend", err);
        }
      }
    }

    fetchDevices();

    return () => {
      controller.abort();
    };
  }, []);

  async function toggleDevice(index: number) {
    const targetDevice = devices[index];
    if (!targetDevice) return;

    const newStatus = !targetDevice.on;
    const commandName = newStatus ? 'ON' : 'OFF';
    const deviceId = (targetDevice as any).id;

    if (typeof deviceId !== 'number' || deviceId <= 5) {
      setDevices((current) =>
        current.map((device, i) => (i === index ? { ...device, on: newStatus } : device))
      );
      return;
    }

    try {
      setCommandLoading(index);
      setDevices((current) =>
        current.map((device, i) => 
          i === index 
            ? { ...device, lastAckStatus: 'PENDING', lastMessage: 'Đang gửi lệnh xuống thiết bị...' } 
            : device
        )
      );

      let res;
      try {
        res = await farmApi.control(deviceId, commandName);
      } catch (err: any) {
        setCommandLoading(null);
        const failMessage = err.response?.data?.message || err.message || "Gửi lệnh thất bại";
        setDevices((current) =>
          current.map((device, i) => 
            i === index 
              ? { ...device, lastAckStatus: 'PUBLISH_FAILED', lastMessage: failMessage } 
              : device
          )
        );
        return;
      }

      const commandId = res?.data?.commandId || res?.commandId;

      if (commandId) {
        let attempts = 0;
        const maxAttempts = 30;

        // Clear interval cũ nếu có trước khi tạo mới
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }

        pollIntervalRef.current = setInterval(async () => {
          try {
            attempts++;
            const statusRes = await farmApi.getCommandStatus(commandId);
            const cmdData = statusRes.data || statusRes;
            
            const isFinished = [
              'SUCCESS', 'CONFIRMED', 'FAILED', 'TIMED_OUT', 'PUBLISH_FAILED', 'REJECTED'
            ].includes(cmdData.status);

            if (isFinished || attempts >= maxAttempts) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setCommandLoading(null);

              const finalStatus = (!isFinished && attempts >= maxAttempts) ? 'TIMED_OUT' : cmdData.status;
              const isSuccess = finalStatus === 'SUCCESS' || finalStatus === 'CONFIRMED';

              setDevices((current) =>
                current.map((device, i) => 
                  i === index 
                    ? { 
                        ...device, 
                        on: isSuccess ? newStatus : device.on,
                        lastAckStatus: finalStatus, 
                        lastMessage: cmdData.message || (finalStatus === 'TIMED_OUT' ? 'Quá thời gian phản hồi (Timeout)' : '') 
                      } 
                    : device
                )
              );
            }
          } catch (e) {
            console.warn("Lỗi kết nối khi polling trạng thái lệnh, đang thử lại...", e);
            if (attempts >= maxAttempts) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setCommandLoading(null);
              setDevices((current) =>
                current.map((device, i) => 
                  i === index 
                    ? { ...device, lastAckStatus: 'TIMED_OUT', lastMessage: 'Mất kết nối kiểm tra trạng thái (Timeout)' } 
                    : device
                )
              );
            }
          }
        }, 2000);
      } else {
        setCommandLoading(null);
        setDevices((current) =>
          current.map((device, i) => 
            i === index ? { ...device, lastAckStatus: 'FAILED', lastMessage: 'Phản hồi từ server thiếu Command ID' } : device
          )
        );
      }
    } catch (err: any) {
      setCommandLoading(null);
      setDevices((current) =>
        current.map((device, i) => 
          i === index ? { ...device, lastAckStatus: 'FAILED', lastMessage: err.message || "Gửi lệnh thất bại" } : device
        )
      );
    }
  }

  // Helper hiển thị số đo an toàn
  const displayVal = (val: unknown, decimals: number) => {
    if (val === null || val === undefined || val === '') return '--';
    const num = Number(val);
    return Number.isFinite(num) ? num.toFixed(decimals) : '--';
  };
    const isConnected = !errorMessage;

// Chỉ hiển thị khi có dữ liệu trả về từ server/phần cứng thực tế
const currentTemp = displayVal(latestData?.temperature ?? (latestData as any)?.temp, 2);
const currentHum = displayVal(latestData?.humidity ?? (latestData as any)?.hum, 2);
const currentCo2 = displayVal(latestData?.co2 ?? (latestData as any)?.co2Level, 0);
const currentLight = displayVal(latestData?.light, 0);

  return (
    <main className="app-shell" style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', flexWrap: 'wrap' }}>
      {/* SIDEBAR */}
      <aside className="sidebar" style={{ width: '260px', minWidth: '240px', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div className="brand-icon" style={{ width: '36px', height: '36px', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontWeight: 'bold' }}>S</div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>SwiftletCare</h2>
            <p style={{ fontSize: '11px', color: '#64748b' }}>SMART FARMING</p>
          </div>
        </div>

        <p className="menu-label" style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '12px' }}>MAIN MENU</p>
        <nav className="menu" style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`menu-item ${activePage === item.name ? 'active' : ''}`}
              onClick={() => setActivePage(item.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activePage === item.name ? '#eef2ff' : 'transparent',
                color: activePage === item.name ? '#4f46e5' : '#475569',
                fontWeight: activePage === item.name ? '600' : '500',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span>{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', fontSize: '12px', color: '#64748b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', color: isConnected ? '#059669' : '#dc2626' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isConnected ? '#10b981' : '#ef4444' }} />
              {isConnected ? 'System connected' : 'System offline'}
          </div>
          <p style={{ marginTop: '4px' }}>Nhà yến Lâm Sơn</p>
        </div>
      </aside>

      {/* MAIN AREA */}
      <section className="main-area" style={{ flex: 1, minWidth: '300px', padding: '32px', overflowY: 'auto' }}>
        <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="eyebrow" style={{ fontSize: '12px', fontWeight: 'bold', color: '#4f46e5', textTransform: 'uppercase' }}>SWIFTLET FARM MANAGEMENT</p>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>{activePage}</h1>
          </div>
          <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="avatar" style={{ width: '40px', height: '40px', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 'bold' }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong style={{ fontSize: '14px', color: '#1e293b' }}>{userName}</strong>
              <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>Chủ nhà yến</p>
              <button
                onClick={handleLogout}
                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', padding: '0', textDecoration: 'underline', marginTop: '2px' }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {errorMessage && (
          <div style={{ marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
            ⚠️ <strong>Cảnh báo hệ thống:</strong> {errorMessage}
          </div>
        )}

        {/* --- TAB 1: DASHBOARD --- */}
        {activePage === 'Dashboard' && (
          <div>
            <div className="welcome" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>Welcome back!</h2>
                <p style={{ fontSize: '14px', color: '#64748b' }}>Giám sát thông số vi khí hậu nhà yến Lâm Sơn.</p>
              </div>
              <span style={{ 
                padding: '6px 14px', 
                borderRadius: '20px', 
                background: isConnected ? '#d1fae5' : '#fee2e2', 
                color: isConnected ? '#065f46' : '#991b1b', 
                fontSize: '12px', 
                fontWeight: '600' 
              }}>
                {isConnected ? '● All systems normal' : '● System disconnected'}
              </span>
            </div>

            {/* Responsive Grid thay vì chia cột cứng */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <StatCard label="Temperature" value={currentTemp} unit="°C" note="Mức an toàn (26–32°C)" icon="♨" color="orange" />
              <StatCard label="Humidity" value={currentHum} unit="%" note="Mức tối ưu (>75%)" icon="♧" color="blue" />
              <StatCard label="Air Quality (CO₂)" value={currentCo2} unit="ppm" note="Khí gas / CO₂ ổn định" icon="◉" color="green" />
              <StatCard label="Light Intensity" value={currentLight} unit="Lux" note="Ánh sáng phù hợp" icon="☼" color="purple" />
            </div>

            <div className="content-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <SensorChart data={historyData} isLoading={isLoading} errorMessage={errorMessage} />
              <section className="panel" style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Device Control</h3>
                    <p style={{ fontSize: '12px', color: '#64748b' }}>Quản lý thiết bị nhanh</p>
                  </div>
                  <button onClick={() => setActivePage('Control')} style={{ background: 'none', border: 'none', color: '#4f46e5', fontWeight: '600', cursor: 'pointer' }}>View all →</button>
                </div>
                <div className="device-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {devices.slice(0, 3).map((device, index) => (
                    <div key={device.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                      <div>
                        <strong>{device.name}</strong>
                        <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>{device.description}</p>
                      </div>
                      <button
                        onClick={() => toggleDevice(index)}
                        style={{ width: '40px', height: '22px', borderRadius: '11px', background: device.on ? '#4f46e5' : '#cbd5e1', border: 'none', position: 'relative', cursor: 'pointer' }}
                      >
                        <span style={{ position: 'absolute', top: '2px', left: device.on ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* --- TAB 2: MONITORING --- */}
        {activePage === 'Monitoring' && (
          <div>
            <div className="welcome" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Live Environmental Monitoring</h2>
              <p style={{ fontSize: '14px', color: '#64748b' }}>Theo dõi trực quan vi khí hậu & camera thời gian thực.</p>
            </div>

            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Temperature" value={currentTemp} unit="°C" note="Mức an toàn (26–32°C)" icon="♨" color="orange" />
              <StatCard label="Humidity" value={currentHum} unit="%" note="Mức tối ưu (>75%)" icon="♧" color="blue" />
              <StatCard label="Air Quality (CO₂)" value={currentCo2} unit="ppm" note="Khí CO₂ ổn định" icon="◉" color="green" />
              <StatCard label="Light Intensity" value={currentLight} unit="Lux" note="Ánh sáng phù hợp" icon="☼" color="amber" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <SensorChart data={historyData} isLoading={isLoading} errorMessage={errorMessage} />
              <CameraStream />
            </div>
          </div>
        )}

        {/* --- TAB 3: CONTROL --- */}
        {activePage === 'Control' && (
          <div>
            <div className="welcome" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Device Control Center</h2>
              <p style={{ fontSize: '14px', color: '#64748b' }}>Quản lý thiết bị và chế độ hoạt động.</p>
            </div>
            <section className="panel" style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <strong>{autoMode ? 'Chế độ tự động (AUTO)' : 'Chế độ thủ công (MANUAL)'}</strong>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Chuyển đổi chế độ vận hành thiết bị phần cứng.</p>
                </div>
                <button
                  onClick={() => setAutoMode(!autoMode)}
                  style={{ width: '48px', height: '26px', borderRadius: '13px', background: autoMode ? '#4f46e5' : '#cbd5e1', border: 'none', position: 'relative', cursor: 'pointer' }}
                >
                  <span style={{ position: 'absolute', top: '3px', left: autoMode ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {devices.map((device, index) => (
                  <div key={(device as any).id || device.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#f8fafc', borderRadius: '8px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <strong>{device.name}</strong>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{device.description}</p>
                   
                      {(device as any).lastAckStatus && (() => {
                        const status = (device as any).lastAckStatus;
                        let color = '#d97706'; 
                        let text = `Trạng thái: ${status}`;

                        if (status === 'PENDING') {
                          color = '#d97706'; 
                          text = '⏳ Đang chờ phản hồi (ACK)...';
                        } else if (status === 'SUCCESS' || status === 'CONFIRMED') {
                          color = '#059669'; 
                          text = '✅ Thực thi thành công';
                        } else if (status === 'FAILED' || status === 'PUBLISH_FAILED' || status === 'REJECTED') {
                          color = '#dc2626'; 
                          text = `❌ Thực thi thất bại (${status})`;
                        } else if (status === 'TIMED_OUT') {
                          color = '#9333ea'; 
                          text = '⏱️ Quá thời gian (Timeout)';
                        }

                        return (
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color, display: 'block', marginTop: '4px' }}>
                            {text} {(device as any).lastMessage ? `(${(device as any).lastMessage})` : ''}
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: device.on ? '#059669' : '#64748b' }}>
                        {commandLoading === index ? 'Đang gửi...' : (device.on ? 'ON' : 'OFF')}
                      </span>
                      <button
                        disabled={autoMode || commandLoading === index}
                        onClick={() => toggleDevice(index)}
                        style={{ width: '40px', height: '22px', borderRadius: '11px', background: device.on ? '#4f46e5' : '#cbd5e1', border: 'none', position: 'relative', cursor: autoMode ? 'not-allowed' : 'pointer', opacity: autoMode ? 0.6 : 1 }}
                      >
                        <span style={{ position: 'absolute', top: '2px', left: device.on ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* --- TAB 4: ANALYTICS --- */}
        {activePage === 'Analytics' && (
          <div>
            <div className="welcome" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Environmental Analytics</h2>
            </div>
            <AnalyticsChart data={historyData} isLoading={isLoading} errorMessage={errorMessage} />
          </div>
        )}

        {/* --- TAB 5: ALERTS --- */}
        {activePage === 'Alerts' && (
          <div>
            <div className="welcome" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Alerts & Notifications</h2>
            </div>
            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <p>{isConnected ? 'Hệ thống kết nối ổn định với phần cứng.' : 'Mất kết nối với server backend.'}</p>
            </div>
          </div>
        )}

        {/* --- TAB 6: DEMO --- */}
        {activePage === 'Demo' && (
          <div>
            <div className="welcome" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>System Demo & Testing</h2>
              <p style={{ fontSize: '14px', color: '#64748b' }}>Khu vực thử nghiệm thủ công các tính năng phụ trợ.</p>
            </div>
            <VideoDemoSection />
          </div>
        )}

        <footer className="footer" style={{ marginTop: '40px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
          SwiftletCare © 2026 · Smart Swiftlet House Monitoring
        </footer>
      </section>
    </main>
  );
}

function StatCard({ label, value, unit, note, icon, color }: { label: string; value: string; unit: string; note: string; icon: string; color: string }) {
  // Nếu value là rỗng, null hoặc chưa có kết nối thì hiển thị dấu --
  const displayValue = (!value || value === 'undefined' || value === 'null') ? '--' : value;

  return (
    <article className="stat-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
        {displayValue} <small style={{ fontSize: '14px', fontWeight: 'normal', color: '#64748b' }}>{unit}</small>
      </div>
      <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{note}</p>
    </article>
  );
}