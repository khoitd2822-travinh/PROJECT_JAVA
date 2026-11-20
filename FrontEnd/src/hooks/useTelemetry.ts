import { useCallback, useEffect, useState } from "react";
import { telemetryApi } from "../lib/api";
import type { LatestTelemetry,TelemetryPoint,} from "../types/telemetry";

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

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
    let timer: ReturnType<typeof setTimeout>;
    let nextHistoryAt = 0;

    async function poll() {
      const loadHistory = Date.now() >= nextHistoryAt;

      const [latest, history] = await Promise.allSettled([
        telemetryApi.latest(1, 1, controller.signal),

        loadHistory
          ? telemetryApi.history(1, 1, "24h", controller.signal)
          : Promise.resolve(null),
      ]);

      if (controller.signal.aborted) return;

      if (latest.status === "fulfilled" && latest.value) {
        const raw = latest.value;
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

        setErrorMessage(
          fresh ? null : "ESP32 offline hoặc dữ liệu đã cũ."
        );
      } else {
        setLatestData(null);
        setErrorMessage("Không lấy được dữ liệu mới từ BE/ESP32.");
      }

      if (loadHistory) {
        nextHistoryAt = Date.now() + 10000;

        if (
          history.status === "fulfilled" &&
          Array.isArray(history.value)
        ) {
          setHistoryData(
            history.value.map((row: any) => ({
              time: new Date(row.time).toLocaleTimeString("vi-VN"),
              temperature: numberOrNull(row.temperature),
              humidity: numberOrNull(row.humidity),
              co2: numberOrNull(row.co2),
              light: numberOrNull(row.light),
              sound: null,
            }))
          );
        }
      }

      setIsLoading(false);

      timer = setTimeout(
        poll,
        Math.max(1000, pollingIntervalMs)
      );
    }

    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
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