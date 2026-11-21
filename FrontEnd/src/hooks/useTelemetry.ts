// src/hooks/useTelemetry.ts

import { useState, useEffect, useCallback } from "react";
import { telemetryApi } from "../lib/api";
import { TelemetryPoint, LatestTelemetry } from "../types/telemetry";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function useTelemetry(pollingIntervalMs: number = 5000) {
  const [historyData, setHistoryData] = useState<TelemetryPoint[]>([]);
  const [latestData, setLatestData] = useState<LatestTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);

      // 1. Gọi API lịch sử 24h
      const historyResult = await telemetryApi.history(1, 1, "24h");
      const resData = historyResult as any;
      const rawHistory = Array.isArray(resData) 
        ? resData 
        : (resData && Array.isArray(resData.data) ? resData.data : []);

      const telemetryPoints: TelemetryPoint[] = rawHistory.map((row: Record<string, unknown>) => ({
        time: formatTime(String(row.time ?? "")),
        temperature: row.temperature !== null && row.temperature !== undefined ? Number(row.temperature) : null,
        humidity: row.humidity !== null && row.humidity !== undefined ? Number(row.humidity) : null,
        co2: row.co2 !== null && row.co2 !== undefined ? Number(row.co2) : null,
        sound: row.sound !== null && row.sound !== undefined ? Number(row.sound) : null,
        light: row.light !== null && row.light !== undefined ? Number(row.light) : null,
      }));

      setHistoryData(telemetryPoints);
      // (Đã bỏ đoạn setErrorMessage khi mảng rỗng để không bị hiểu lầm là mất kết nối server)

      // 2. Gọi API lấy giá trị mới nhất
      try {
        const latestResult = await telemetryApi.latest(1, 1);
        const rawLatest = (latestResult && typeof latestResult === 'object' && 'data' in latestResult)
          ? (latestResult as any).data 
          : latestResult;

        if (rawLatest && typeof rawLatest === "object") {
          setLatestData({
            temperature: rawLatest.temperature !== null && rawLatest.temperature !== undefined ? Number(rawLatest.temperature) : (rawLatest.temp !== undefined ? Number(rawLatest.temp) : null),
            humidity: rawLatest.humidity !== null && rawLatest.humidity !== undefined ? Number(rawLatest.humidity) : (rawLatest.hum !== undefined ? Number(rawLatest.hum) : null),
            co2: rawLatest.co2 !== null && rawLatest.co2 !== undefined ? Number(rawLatest.co2) : (rawLatest.co2Level !== undefined ? Number(rawLatest.co2Level) : null),
            sound: rawLatest.sound !== null && rawLatest.sound !== undefined ? Number(rawLatest.sound) : (rawLatest.soundDb !== undefined ? Number(rawLatest.soundDb) : null),
            light: rawLatest.light !== null && rawLatest.light !== undefined ? Number(rawLatest.light) : null,
            timestamp: rawLatest.timestamp ? String(rawLatest.timestamp) : null,
          });
        } else {
          setLatestData(null);
        }
      } catch {
        setLatestData(null);
      }

    } catch (error) {
      console.warn("Lỗi khi tải dữ liệu telemetry:", error);
      setHistoryData([]);
      setLatestData(null);
      setErrorMessage("Không thể kết nối đến Backend để lấy dữ liệu.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      setIsLoading(true);
      if (!cancelled) {
        await fetchData();
      }
    }

    initialLoad();

    const interval = setInterval(() => {
      if (!cancelled) {
        fetchData();
      }
    }, pollingIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchData, pollingIntervalMs]);

  return {
    historyData,
    latestData,
    isLoading,
    errorMessage,
    refetch: fetchData,
  };
}