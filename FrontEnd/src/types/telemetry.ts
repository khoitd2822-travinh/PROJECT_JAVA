// src/types/telemetry.ts

export type TelemetryPoint = {
  time: string;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  sound: number | null;
  light: number | null;
};

export type LatestTelemetry = {
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  sound: number | null;
  light: number | null;
  timestamp: string | null;
};

// Thêm type ApiResponse để bọc dữ liệu trả về từ Spring Boot Backend
export type ApiResponse<T> = {
  status?: string | number;
  message?: string;
  data: T;
};

export type UseTelemetryReturn = {
  historyData: TelemetryPoint[];
  latestData: LatestTelemetry | null;
  isLoading: boolean;
  errorMessage: string | null;
  refetch: () => void;
};