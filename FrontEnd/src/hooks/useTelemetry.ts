import { useCallback, useEffect, useState } from "react";
import { telemetryApi } from "../lib/api";
import type { LatestTelemetry, TelemetryPoint } from "../types/telemetry";

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatTime(value: unknown): string {
  if (!value) return "--:--:--";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString("vi-VN");
}

type LatestApiData = {
  temp?: unknown;
  temperature?: unknown;
  hum?: unknown;
  humidity?: unknown;
  co2?: unknown;
  light?: unknown;
  gasRaw?: unknown;
  timestamp?: string | null;
  online?: boolean;
  stale?: boolean;
};

export function useTelemetry(pollingIntervalMs = 2000) {
  const [historyData, setHistoryData] = useState<TelemetryPoint[]>([]);
  const [latestData, setLatestData] = useState<LatestTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refetch = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextHistoryAt = 0;

    async function poll() {
      if (controller.signal.aborted) return;

      const loadHistory = Date.now() >= nextHistoryAt;

      const [latestResult, historyResult] = await Promise.allSettled([
        telemetryApi.latest(1, 1, controller.signal),
        loadHistory
          ? telemetryApi.history(1, 1, "24h", controller.signal)
          : Promise.resolve(null),
      ]);

      if (controller.signal.aborted) return;

      let latestError: string | null = null;
      let historyError: string | null = null;

      if (latestResult.status === "fulfilled" && latestResult.value) {
        const raw = latestResult.value as LatestApiData;

        const fresh = raw.online === true && raw.stale === false;

        setLatestData({
          temperature: fresh
            ? numberOrNull(raw.temp ?? raw.temperature)
            : null,
          humidity: fresh
            ? numberOrNull(raw.hum ?? raw.humidity)
            : null,
          co2: fresh ? numberOrNull(raw.co2) : null,
          light: fresh ? numberOrNull(raw.light) : null,
          gasRaw: fresh ? numberOrNull(raw.gasRaw) : null,
          sound: null,
          timestamp: raw.timestamp ?? null,
          online: raw.online === true,
          stale: !fresh,
        });

        if (!fresh) {
          latestError = "ESP32 offline hoac du lieu da cu.";
        }
      } else {
        latestError = "Khong lay duoc du lieu moi tu Backend/ESP32.";

        // Keep the last known values, but mark them as stale.
        setLatestData((previous) =>
          previous
            ? {
                ...previous,
                online: false,
                stale: true,
              }
            : null
        );
      }

      if (loadHistory) {
        nextHistoryAt = Date.now() + 10000;

        if (
          historyResult.status === "fulfilled" &&
          Array.isArray(historyResult.value)
        ) {
          setHistoryData(
            historyResult.value.map((row: any) => ({
              time: formatTime(row.time),
              temperature: numberOrNull(row.temperature),
              humidity: numberOrNull(row.humidity),
              co2: numberOrNull(row.co2),
              light: numberOrNull(row.light),
              sound: null,
            }))
          );
        } else if (historyResult.status === "rejected") {
          historyError = "Khong tai duoc lich su telemetry.";
        }
      }

      if (latestError) {
        setErrorMessage(latestError);
      } else if (historyError) {
        setErrorMessage(historyError);
      } else {
        setErrorMessage(null);
      }

      setIsLoading(false);

      if (!controller.signal.aborted) {
        timer = setTimeout(
          poll,
          Math.max(1000, pollingIntervalMs)
        );
      }
    }

    void poll();

    return () => {
      controller.abort();

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pollingIntervalMs, revision]);

  return {
    historyData,
    latestData,
    isLoading,
    errorMessage,
    refetch,
  };
}
