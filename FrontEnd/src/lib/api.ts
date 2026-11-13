// src/lib/api.ts
import { mockHouses, SwiftletHouse } from '../data/mockData';
import { ApiResponse, TelemetryPoint, LatestTelemetry } from '../types/telemetry';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

// Hàm helper lấy token linh hoạt từ cả localStorage (Ghi nhớ) và sessionStorage (Không ghi nhớ)
export function authHeaders(): HeadersInit {
  const token = typeof window === "undefined" 
    ? null 
    : (localStorage.getItem("token") || sessionStorage.getItem("token"));
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Wrapper fetch tự động bắt lỗi 401 Unauthorized (Token hết hạn / Không hợp lệ)
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      // Dọn sạch cả hai nơi lưu trữ khi phiên hết hạn
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login?expired=true";
    }
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  return res;
}

export const authApi = {
  async register(body: { fullName: string; email: string; password: string }): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || "Đăng ký thất bại");
    return text;
  },

  async login(email: string, password: string): Promise<{
    token: string;
    id: number;
    fullName: string;
    email: string;
    roles: string[];
  }> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Sai email hoặc mật khẩu");
    return res.json();
  },
};

export const houseApi = {
  getHouses: async (): Promise<SwiftletHouse[]> => mockHouses,
};

export const farmApi = {
  async getDevices(farmId = 1, zoneId = 1): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/farm/devices?farmId=${farmId}&zoneId=${zoneId}`
    );
    if (!res.ok) throw new Error("Không tải được thiết bị");
    return res.json();
  },

  // Cập nhật command hỗ trợ cả ON, OFF, AUTO, MANUAL
  async control(deviceId: number, command: "ON" | "OFF" | "AUTO" | "MANUAL"): Promise<any> {
    const res = await fetchWithAuth(`${API_BASE_URL}/farm/devices/control`, {
      method: "POST",
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

  // Kiểm tra trạng thái lệnh qua commandId
  async getCommandStatus(commandId: string | number): Promise<any> {
    const res = await fetchWithAuth(`${API_BASE_URL}/actuation/commands/${commandId}`);
    if (!res.ok) throw new Error("Không thể kiểm tra trạng thái lệnh");
    return res.json();
  },
};

export const telemetryApi = {
  async latest(farmId = 1, zoneId = 1): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/telemetry/latest?farmId=${farmId}&zoneId=${zoneId}`,
      {
        cache: "no-store",
      }
    );

    if (!res.ok) {
      throw new Error("Không thể tải thông số cảm biến từ máy chủ.");
    }

    const result = await res.json();
    return typeof result.data === "string"
      ? JSON.parse(result.data)
      : (result.data || result);
  },

  async history(farmId = 1, zoneId = 1, range = "24h"): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/telemetry/history?farmId=${farmId}&zoneId=${zoneId}&range=${range}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Không tải được dữ liệu lịch sử");
    const result = await res.json();
    return result.data || result;
  }
};

export const birdApi = {
  async logs(farmId = 1, zoneId = 1): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/bird-tracking/logs?farmId=${farmId}&zoneId=${zoneId}`
    );
    if (!res.ok) throw new Error("Không tải được log chim");
    return res.json();
  },
};