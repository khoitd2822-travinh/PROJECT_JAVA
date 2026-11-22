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

async function fetchWithAuth( url: string,options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const source = options.signal;

  if (source?.aborted) {
    controller.abort();
  } else {
    source?.addEventListener("abort", abort, { once: true });
  }

  const timer = setTimeout(abort, 10000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });

    if (res.status === 401) {
      for (const storage of [localStorage, sessionStorage]) {
        storage.removeItem("token");
        storage.removeItem("currentUser");
        storage.removeItem("isAuthenticated");
      }

      window.location.href = "/login?expired=true";
      throw new Error("Phiên đăng nhập đã hết hạn.");
    }

    const body = await res.text();

    return new Response(body || null, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } finally {
    clearTimeout(timer);
    source?.removeEventListener("abort", abort);
  }
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

export const telegramApi = {
  async linkStatus(): Promise<{ linked: boolean }> {
    const res = await fetch(`${API_BASE_URL}/notification/telegram/link-status`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Không kiểm tra được trạng thái Telegram");
    return res.json();
  },
  async createLinkCode(): Promise<{ code: string; expiresInSeconds: number }> {
    const res = await fetch(`${API_BASE_URL}/notification/telegram/link-code`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || "Không tạo được mã liên kết Telegram");
    }
    return res.json();
  },
  async unlink(): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/notification/telegram/link`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Không thể ngắt liên kết Telegram");
  },
};
export const houseApi = {
  getHouses: async (): Promise<SwiftletHouse[]> => mockHouses,
};

export const farmApi = { async getDevices(farmId = 1,zoneId = 1,signal?: AbortSignal): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/farm/devices?farmId=${farmId}&zoneId=${zoneId}`,
      { cache: "no-store", signal }
    );

    if (!res.ok) {
      throw new Error("Không tải được thiết bị: HTTP " + res.status);
    }

    return res.json();
  },

  async control(
    deviceId: number,
    command: "ON" | "OFF" | "AUTO" | "MANUAL",
    signal?: AbortSignal
  ): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/farm/devices/control`,
      {
        method: "POST",
        signal,
        body: JSON.stringify({ deviceId, command }),
      }
    );

    const result = await res.json();

    if (!res.ok && !result?.data?.commandId) {
      throw new Error(
        res.status === 409
          ? "Thiết bị đang có lệnh chờ ACK."
          : result.message ||
              result.detail ||
              "Gửi lệnh thất bại: HTTP " + res.status
      );
    }

    return result;
  },

  async getCommandStatus(
    commandId: string | number,
    signal?: AbortSignal
  ): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/actuation/commands/${commandId}`,
      { cache: "no-store", signal }
    );

    if (!res.ok) {
      throw new Error("Không kiểm tra được lệnh: HTTP " + res.status);
    }

    return res.json();
  },
};

export const telemetryApi = {async latest(farmId = 1,zoneId = 1,signal?: AbortSignal): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/telemetry/latest?farmId=${farmId}&zoneId=${zoneId}`,
      { cache: "no-store", signal }
    );

    if (!res.ok) {
      throw new Error("Không tải được telemetry: HTTP " + res.status);
    }

    const result = await res.json();
    const data = result.data ?? result;

    return typeof data === "string" ? JSON.parse(data) : data;
  },

  async history(farmId = 1,zoneId = 1,range = "24h",signal?: AbortSignal): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/telemetry/history?farmId=${farmId}&zoneId=${zoneId}&range=${range}`,
      { cache: "no-store", signal }
    );

    if (!res.ok) {
      throw new Error("Không tải được lịch sử: HTTP " + res.status);
    }

    const result = await res.json();
    return result.data ?? result;
  },
};

export const birdApi = {
  async logs(farmId = 1, zoneId = 1): Promise<any> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/bird-tracking/logs?farmId=${farmId}&zoneId=${zoneId}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error(
        "Không tải được sự kiện: HTTP " + res.status
      );
    }

    return res.json();
  },

  async imageUrl(snapshotKey: string): Promise<string> {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/storage/url?fileName=${encodeURIComponent(snapshotKey)}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error(
        "Không lấy được địa chỉ ảnh: HTTP " + res.status
      );
    }

    const result = await res.json();
    const url = new URL(result.url);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Địa chỉ ảnh không hợp lệ.");
    }

    return url.toString();
  },
};