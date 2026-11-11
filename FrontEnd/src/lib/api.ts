// src/lib/api.ts
import { mockHouses, mockDevices, SwiftletHouse, DeviceItem } from '../data/mockData';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
export function authHeaders(): HeadersInit {
  const token = typeof window === "undefined" ? null : localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
export const authApi = {
  async register(body: { fullName: string; email: string; password: string }) {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || "Đăng ký thất bại");
    return text;
  },
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Sai email hoặc mật khẩu");
    return res.json() as Promise<{
      token: string;
      id: number;
      fullName: string;
      email: string;
      roles: string[];
    }>;
  },
};
export const houseApi = {
  getHouses: async (): Promise<SwiftletHouse[]> => mockHouses,
};
export const farmApi = {
  async getDevices(farmId = 1, zoneId = 1) {
    const res = await fetch(
      `${API_BASE_URL}/farm/devices?farmId=${farmId}&zoneId=${zoneId}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Không tải được thiết bị");
    return res.json();
  },

  // Cập nhật command hỗ trợ cả ON, OFF, AUTO, MANUAL
  async control(deviceId: number, command: "ON" | "OFF" | "AUTO" | "MANUAL") {
    const res = await fetch(`${API_BASE_URL}/farm/devices/control`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ deviceId, command }),
    });
    
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error("Đang có lệnh chờ cho thiết bị này, vui lòng đợi!");
      }
      throw new Error("Gửi lệnh thất bại");
    }
    return res.json(); // Trả về data chứa commandId, status, confirmed...
  },

  // Bổ sung hàm kiểm tra trạng thái lệnh qua commandId
  async getCommandStatus(commandId: string | number) {
    const res = await fetch(`${API_BASE_URL}/actuation/commands/${commandId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Không thể kiểm tra trạng thái lệnh");
    return res.json();
  },
};
export const telemetryApi = {
  async latest(farmId = 1, zoneId = 1) {
    const res = await fetch(
      `${API_BASE_URL}/telemetry/latest?farmId=${farmId}&zoneId=${zoneId}`,
      {
        headers: authHeaders(),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      throw new Error(`Không lấy được dữ liệu mới nhất: ${res.status}`);
    }

    const result = await res.json();

    return typeof result.data === "string"
      ? JSON.parse(result.data)
      : result.data;
  },

  async history(farmId = 1, zoneId = 1, range = "24h") {
    const res = await fetch(
      `${API_BASE_URL}/telemetry/history?farmId=${farmId}&zoneId=${zoneId}&range=${range}`,
      { headers: authHeaders() }
    );

    if (!res.ok) {
      throw new Error("Không tải được lịch sử");
    }

    return res.json();
  },
};
export const birdApi = {
  async logs(farmId = 1, zoneId = 1) {
    const res = await fetch(
      `${API_BASE_URL}/bird-tracking/logs?farmId=${farmId}&zoneId=${zoneId}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Không tải được log chim");
    return res.json();
  },
};