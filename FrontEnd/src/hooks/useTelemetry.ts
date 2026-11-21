
"use client";

import { useState, useEffect, useCallback } from "react";
import { Client, IMessage } from "@stomp/stompjs";
import { telemetryApi } from "../lib/api";
import { TelemetryPoint, LatestTelemetry } from "../types/telemetry";

const WS_URL = "ws://localhost:8080/ws-swiftlet";
const TELEMETRY_TOPIC = "/topic/telemetry/1/1";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapLatest(raw: any): LatestTelemetry {
  return {
    temperature: toNumber(raw.temperature ?? raw.temp),
    humidity: toNumber(raw.humidity ?? raw.hum),
    co2: toNumber(raw.co2 ?? raw.co2Level),
    sound: toNumber(raw.sound ?? raw.soundDb),
    light: toNumber(raw.light ?? raw.lightLevel),
    timestamp: raw.timestamp ? String(raw.timestamp) : new Date().toISOString(),
  };
}

function toHistoryPoint(data: LatestTelemetry): TelemetryPoint {
  return {
    time: formatTime(data.timestamp ?? new Date().toISOString()),
    temperature: data.temperature,
    humidity: data.humidity,
    co2: data.co2,
    sound: data.sound,
    light: data.light,
  };
}

export function useTelemetry(_pollingIntervalMs: number = 5000) {
  const [historyData, setHistoryData] = useState<TelemetryPoint[]>([]);
  const [latestData, setLatestData] = useState<LatestTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);

      const historyResult = await telemetryApi.history(1, 1, "24h");
      const resData = historyResult as any;

      const rawHistory = Array.isArray(resData)
        ? resData
        : Array.isArray(resData?.data)
          ? resData.data
          : [];

      const telemetryPoints: TelemetryPoint[] = rawHistory.map(
        (row: Record<string, unknown>) => ({
          time: formatTime(String(row.time ?? row.timestamp ?? "")),
          temperature: toNumber(row.temperature ?? row.temp),
          humidity: toNumber(row.humidity ?? row.hum),
          co2: toNumber(row.co2 ?? row.co2Level),
          sound: toNumber(row.sound ?? row.soundDb),
          light: toNumber(row.light ?? row.lightLevel),
        })
      );

      setHistoryData(telemetryPoints);

      try {
        const latestResult = await telemetryApi.latest(1, 1);
        const rawLatest =
          latestResult &&
          typeof latestResult === "object" &&
          "data" in latestResult
            ? (latestResult as any).data
            : latestResult;

        const parsedLatest =
          typeof rawLatest === "string" ? JSON.parse(rawLatest) : rawLatest;

        if (parsedLatest && typeof parsedLatest === "object") {
          setLatestData(mapLatest(parsedLatest));
        }
      } catch (error) {
        console.warn("Không thể tải telemetry mới nhất:", error);
      }
    } catch (error) {
      console.error("Lỗi tải lịch sử telemetry:", error);
      setErrorMessage("Không thể tải dữ liệu lịch sử từ Backend.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Tải dữ liệu ban đầu qua REST API.
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Kết nối WebSocket STOMP để nhận dữ liệu realtime.
  useEffect(() => {
    const client = new Client({
      brokerURL: WS_URL,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      onConnect: () => {
        console.log("[STOMP] Đã kết nối Backend");

        setErrorMessage(null);

        client.subscribe(TELEMETRY_TOPIC, (message: IMessage) => {
          try {
            const raw = JSON.parse(message.body);
            const latest = mapLatest(raw);

            setLatestData(latest);

            const point = toHistoryPoint(latest);

            setHistoryData((previous) => {
              const updated = [...previous, point];
              return updated.slice(-500);
            });

            console.log("[STOMP] Nhận telemetry:", raw);
          } catch (error) {
            console.error("[STOMP] Không thể xử lý dữ liệu:", error);
          }
        });
      },

      onStompError: (frame) => {
        console.error("[STOMP] Broker báo lỗi:", frame.headers["message"]);
      },

      onWebSocketError: (event) => {
        console.error("[STOMP] Lỗi WebSocket:", event);
      },

      onWebSocketClose: () => {
        console.warn("[STOMP] WebSocket đã đóng. Đang chờ kết nối lại...");
      },
    });

    client.activate();

    return () => {
      client.deactivate();
    };
  }, []);

  return {
    historyData,
    latestData,
    isLoading,
    errorMessage,
    refetch: fetchData,
  };
}
