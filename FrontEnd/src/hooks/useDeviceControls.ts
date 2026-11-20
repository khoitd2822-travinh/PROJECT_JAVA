"use client";

import {useCallback,useEffect,useRef, useState,} from "react";
import { farmApi } from "../lib/api";

export type DeviceCommand = "ON" | "OFF" | "AUTO" | "MANUAL";
export type DeviceView = {
  id: number;
  name: string;
  deviceType: string;
  status: string;
  controlMode: string | null;
  lastAckStatus?: string;
  lastMessage?: string;
};

const order = [
  "FAN",
  "FAN_SMOKE",
  "HUMIDIFIER",
  "HEATER",
  "ALARM",
];

const aliases: Record<string, string> = {
  FAN1: "FAN",
  FAN2: "FAN_SMOKE",
  SMOKE_FAN: "FAN_SMOKE",
  MIST: "HUMIDIFIER",
  HEAT: "HEATER",
  BUZZER: "ALARM",
};

const unwrap = (value: any) => value?.data ?? value;

function mapDevices(response: any): DeviceView[] {
  const list = unwrap(response);

  if (!Array.isArray(list)) {
    throw new Error("Danh sách thiết bị không hợp lệ");
  }

  return list.flatMap((raw: any) => {
      const id = Number(raw.id);
      const rawType = String(raw.deviceType ?? "").toUpperCase();
      const type = aliases[rawType] ?? rawType;

      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !order.includes(type)
      ) {
        return [];
      }

      return [{
        id,
        name: String(raw.name || type),
        deviceType: type,
        status: String(raw.status ?? "UNKNOWN"),
        controlMode: raw.controlMode ?? null,
        lastAckStatus: raw.lastAckStatus,
        lastMessage: raw.lastMessage,
      }];
    })
    .sort(
      (a, b) =>
        order.indexOf(a.deviceType) -
        order.indexOf(b.deviceType)
    );
}

export function useDeviceControls(online: boolean) {
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deviceError, setDeviceError] = useState("");

  const busyRef = useRef(false);
  const commandAbort = useRef<AbortController | null>(null);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async (signal: AbortSignal) => {
    const sequence = ++refreshSequence.current;

    const list = mapDevices(
      await farmApi.getDevices(1, 1, signal)
    );

    if (
      !signal.aborted &&
      sequence === refreshSequence.current
    ) {
      setDevices(list);
      setDeviceError("");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        await refresh(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          setDeviceError(
            error instanceof Error
              ? error.message
              : "Không tải được thiết bị"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          timer = setTimeout(poll, 2000);
        }
      }
    }

    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
      commandAbort.current?.abort();
    };
  }, [refresh]);

  async function execute(
    device: DeviceView,
    command: DeviceCommand,
    signal: AbortSignal
  ) {
    const submitted = unwrap(
      await farmApi.control(device.id, command, signal)
    );

    if (!submitted?.commandId) {
      throw new Error("BE chưa trả commandId");
    }

    let result = submitted;

    const duration =
      Date.parse(submitted.expiresAt) -
      Date.parse(submitted.createdAt);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("BE trả thời hạn command không hợp lệ");
    }

    // Chờ theo thời hạn BE trả về, không cố định 30 lần nữa.
    const stopWaitingAt = Date.now() + duration + 15000;

    while (result.status === "PENDING") {
      if (signal.aborted) return false;

      if (Date.now() > stopWaitingAt) {
        throw new Error(
          "Chưa lấy được kết quả cuối cùng. Command ID: " +
            submitted.commandId
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (signal.aborted) return false;

      try {
        result = unwrap(
          await farmApi.getCommandStatus(
            submitted.commandId,
            signal
          )
        );
      } catch {
        if (signal.aborted) return false;

        setMessage(
          "Đang thử lấy lại kết quả lệnh " +
            submitted.commandId
        );

        continue;
      }

      if (!result?.status) {
        throw new Error(
          "Phản hồi trạng thái command không hợp lệ"
        );
      }
    }

    if (signal.aborted) return false;

    const success = result.status === "CONFIRMED";

    setDevices((current) =>
      current.map((item) =>
        item.id === device.id
          ? {
              ...item,

              status:
                success &&
                (result.actualState === 0 ||
                  result.actualState === 1)
                  ? result.actualState === 1
                    ? "ON"
                    : "OFF"
                  : item.status,

              controlMode: success
                ? result.mode ?? item.controlMode
                : item.controlMode,

              lastAckStatus: result.status,
              lastMessage: result.message,
            }
          : item
      )
    );

    setMessage(
      device.name +
        ": " +
        result.status +
        " — " +
        (result.message || "")
    );

    return success;
  }

  async function run(
    operation: (signal: AbortSignal) => Promise<void>
  ) {
    if (busyRef.current) return;

    if (!online) {
      setMessage("ESP32 đang offline hoặc dữ liệu đã cũ.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setMessage("Đang gửi lệnh và chờ ESP32 xác nhận...");

    const controller = new AbortController();
    commandAbort.current = controller;

    try {
      await operation(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Không xác định được kết quả lệnh"
        );
      }
    } finally {
      busyRef.current = false;

      if (!controller.signal.aborted) {
        setBusy(false);
        void refresh(controller.signal).catch(() => {});
      }
    }
  }

  async function send(
    index: number,
    command: DeviceCommand
  ) {
    const device = devices[index];
    if (!device) return;

    await run(async (signal) => {
      await execute(device, command, signal);
    });
  }

  async function setAllMode(mode: "AUTO" | "MANUAL") {
    await run(async (signal) => {
      let completed = 0;

      for (const device of devices) {
        if (signal.aborted) return;
        if (device.controlMode === mode) continue;

        if (!await execute(device, mode, signal)) {
          setMessage(
            "Đổi chế độ chưa hoàn tất. " +
              "Kiểm tra kết quả từng thiết bị."
          );
          return;
        }

        completed++;
      }

      if (!signal.aborted) {
        setMessage(
          "Đã xác nhận chế độ " +
            mode +
            " cho " +
            completed +
            " thiết bị cần đổi."
        );
      }
    });
  }

  return {
    devices,
    busy,
    message,
    deviceError,
    online,
    send,
    setAllMode,
  };
}

export type DeviceControls =
  ReturnType<typeof useDeviceControls>;