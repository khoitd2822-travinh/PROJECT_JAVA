"use client";

import { useEffect, useState } from "react";
import { birdApi } from "../lib/api";
import type { DeviceControls } from "../hooks/useDeviceControls";
import TelegramNotificationSettings from "./TelegramNotificationSettings";

function commandResult(status?: string) {
  const labels: Record<string, string> = {
    SUCCESS: "Đã xác nhận",
    CONFIRMED: "Đã xác nhận",
    PENDING: "Đang chờ phản hồi",
    TIMED_OUT: "Hết thời gian chờ",
    FAILED: "Chưa thành công",
    REJECTED: "Thiết bị từ chối",
    PUBLISH_FAILED: "Không gửi được lệnh",
  };

  return labels[status || ""] || "Chưa có lệnh";
}

/* ======================== CONTROL ======================== */

export function ControlSection({
  controls,
}: {
  controls: DeviceControls;
}) {
  const {
    devices,
    busy,
    online,
    message,
    deviceError,
    send,
    setAllMode,
  } = controls;

  const disabled =
    busy || !online || Boolean(deviceError) || !devices.length;

  const onCount = devices.filter(
    (device) => device.status === "ON"
  ).length;

  const autoCount = devices.filter(
    (device) => device.controlMode === "AUTO"
  ).length;

  const symbols: Record<string, string> = {
    FAN: "≋",
    FAN_SMOKE: "↗",
    HUMIDIFIER: "♧",
    HEATER: "♨",
    ALARM: "◉",
  };

  return (
    <div className="work-tabs">
      <div className="ops-page-heading">
        <div>
          <h2>Điều khiển thiết bị</h2>
          <p>
            Quản lý hoạt động và chế độ vận hành trong nhà yến.
          </p>
        </div>

        <span
          className={
            online ? "ops-badge green" : "ops-badge gray"
          }
        >
          <i />
          {online ? "ESP32 đã kết nối" : "ESP32 offline"}
        </span>
      </div>

      <div className="ops-stats">
        <div className="ops-stat">
          <span>Thiết bị đã cấu hình</span>
          <strong>{devices.length}</strong>
        </div>

        <div className="ops-stat">
          <span>Trạng thái bật gần nhất</span>
          <strong>
            {onCount}
            <small> / {devices.length}</small>
          </strong>
        </div>

        <div className="ops-stat">
          <span>Chế độ tự động gần nhất</span>
          <strong>
            {autoCount}
            <small> / {devices.length}</small>
          </strong>
        </div>
      </div>

      <div className="ops-toolbar ops-card">
        <div>
          <strong>Chế độ toàn bộ</strong>
          <p>
            Áp dụng lần lượt và chờ từng thiết bị xác nhận.
          </p>
        </div>

        <div className="ops-actions">
          <button
            className="ops-primary"
            disabled={disabled}
            onClick={() => void setAllMode("AUTO")}
          >
            Tất cả tự động
          </button>

          <button
            className="ops-secondary"
            disabled={disabled}
            onClick={() => void setAllMode("MANUAL")}
          >
            Tất cả thủ công
          </button>
        </div>
      </div>

      {!online && (
        <p className="ops-notice amber">
          Đang hiển thị trạng thái nhận gần nhất. Các nút điều
          khiển sẽ mở lại khi ESP32 gửi dữ liệu mới.
        </p>
      )}

      {deviceError && (
        <p className="ops-notice red" role="alert">
          {deviceError}
        </p>
      )}

      {message && (
        <p className="ops-notice" role="status">
          {busy ? "Đang xử lý · " : ""}
          {message}
        </p>
      )}

      <div className="ops-control-grid">
        {devices.map((device, index) => {
          const isOn = device.status === "ON";
          const known = isOn || device.status === "OFF";

          return (
            <article
              key={device.id}
              className="ops-card ops-device"
            >
              <div className="ops-device-heading">
                <span
                  className="ops-device-icon"
                  data-kind={device.deviceType}
                >
                  {symbols[device.deviceType] || "⚙"}
                </span>

                <div>
                  <h3>{device.name}</h3>
                  <p>Thiết bị #{device.id}</p>
                </div>

                <span
                  className={
                    online && isOn
                      ? "ops-badge green"
                      : "ops-badge gray"
                  }
                >
                  {known
                    ? isOn
                      ? "Đang bật"
                      : "Đang tắt"
                    : "Chưa rõ"}
                </span>
              </div>

              <div className="ops-control-row">
                <span>Nguồn thiết bị</span>

                <div
                  className="ops-segment"
                  role="group"
                  aria-label={"Nguồn " + device.name}
                >
                  <button
                    aria-pressed={isOn}
                    disabled={disabled}
                    onClick={() => void send(index, "ON")}
                  >
                    Bật
                  </button>

                  <button
                    aria-pressed={device.status === "OFF"}
                    disabled={disabled}
                    onClick={() => void send(index, "OFF")}
                  >
                    Tắt
                  </button>
                </div>
              </div>

              <div className="ops-control-row">
                <span>Chế độ vận hành</span>

                <div
                  className="ops-segment"
                  role="group"
                  aria-label={"Chế độ " + device.name}
                >
                  <button
                    aria-pressed={device.controlMode === "AUTO"}
                    disabled={disabled}
                    onClick={() => void send(index, "AUTO")}
                  >
                    Tự động
                  </button>

                  <button
                    aria-pressed={device.controlMode === "MANUAL"}
                    disabled={disabled}
                    onClick={() => void send(index, "MANUAL")}
                  >
                    Thủ công
                  </button>
                </div>
              </div>

              <div className="ops-device-result">
                <span>
                  {commandResult(device.lastAckStatus)}
                </span>

                {device.lastMessage && (
                  <p>{device.lastMessage}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!devices.length && (
        <div className="ops-card ops-empty">
          Chưa tải được thiết bị. Kiểm tra kết nối và danh sách
          thiết bị trên BE.
        </div>
      )}

      <p className="ops-footnote">
        Bật / Tắt chuyển thiết bị sang thủ công. Chọn Tự động
        để ESP32 điều khiển theo ngưỡng.
      </p>

      <SectionStyles />
    </div>
  );
}

/* ======================== ALERTS ======================== */

type EventLog = {
  id: number;
  eventType: string;
  description: string;
  timestamp: string;
  cameraId: string;
  inCount: number | null;
  outCount: number | null;
  currentCount: number | null;
  snapshotKey?: string | null;
};

function eventTitle(type: string) {
  if (type === "THREAT_ALERT") {
    return "AI phát hiện đối tượng nguy cơ";
  }

  if (type === "COUNT_IN") {
    return "Ghi nhận chim bay vào";
  }

  if (type === "COUNT_OUT") {
    return "Ghi nhận chim bay ra";
  }

  return "Hoạt động đếm chim";
}

function formatDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("vi-VN");
}

export function AlertsSection({
  onOpenTelegram,
}: {
  onOpenTelegram: () => void;
}) {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");

  const [images, setImages] = useState<Record<number, string>>({});
  const [imageLoading, setImageLoading] = useState<number | null>(
    null
  );
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const response = await birdApi.logs(1, 1);

        const rows = Array.isArray(response)
          ? response
          : response.data;

        if (!Array.isArray(rows)) {
          throw new Error("Dữ liệu sự kiện không hợp lệ.");
        }

        if (active) {
          setLogs(rows);
          setError("");
          setLastUpdated(
            new Date().toLocaleTimeString("vi-VN")
          );
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Không tải được sự kiện."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(load, 10000);
        }
      }
    }

    void load();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [revision]);

  async function showImage(entry: EventLog) {
    if (!entry.snapshotKey || imageLoading !== null) return;

    setImageLoading(entry.id);
    setImageError("");

    try {
      const url = await birdApi.imageUrl(entry.snapshotKey);

      setImages((current) => ({
        ...current,
        [entry.id]: url,
      }));
    } catch (cause) {
      setImageError(
        cause instanceof Error
          ? cause.message
          : "Không tải được ảnh."
      );
    } finally {
      setImageLoading(null);
    }
  }

  const threats = logs.filter(
    (entry) => entry.eventType === "THREAT_ALERT"
  );

  const counts = logs.filter(
    (entry) =>
      entry.eventType?.startsWith("COUNT_") ||
      entry.eventType === "INFO_COUNT"
  );

  const filtered =
    filter === "THREAT"
      ? threats
      : filter === "COUNT"
        ? counts
        : logs;

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / 8)
  );

  const currentPage = Math.min(page, totalPages);

  const visible = filtered.slice(
    (currentPage - 1) * 8,
    currentPage * 8
  );

  return (
    <div className="work-tabs">
      <div className="ops-page-heading">
        <div>
          <h2>Cảnh báo & sự kiện</h2>
          <p>
            Theo dõi các sự kiện AI đã được hệ thống ghi nhận.
          </p>
        </div>

        <button
          className="ops-secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Làm mới
        </button>
      </div>

      <div className="ops-stats">
        <div className="ops-stat">
          <span>Tổng sự kiện trong danh sách</span>
          <strong>{logs.length}</strong>
        </div>

        <div className="ops-stat danger">
          <span>Cảnh báo từ AI</span>
          <strong>{threats.length}</strong>
        </div>

        <div className="ops-stat">
          <span>Sự kiện đếm chim</span>
          <strong>{counts.length}</strong>
        </div>
      </div>

      <div className="ops-telegram-banner">
        <div>
          <strong>Nhận cảnh báo qua Telegram</strong>
          <p>
            Liên kết tài khoản để nhận thông báo và ảnh khi
            hệ thống gửi cảnh báo.
          </p>
        </div>

        <button
          className="ops-primary"
          onClick={onOpenTelegram}
        >
          Thiết lập Telegram ↗
        </button>
      </div>

      <section className="ops-card ops-events">
        <div className="ops-toolbar">
          <div
            className="ops-filter"
            role="group"
            aria-label="Lọc sự kiện"
          >
            {[
              ["ALL", "Tất cả"],
              ["THREAT", "Cảnh báo AI"],
              ["COUNT", "Đếm chim"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="ops-muted">
            {lastUpdated
              ? "Cập nhật " + lastUpdated
              : "Đang tải dữ liệu"}
          </span>
        </div>

        {error && (
          <p className="ops-notice red" role="alert">
            {error} Dữ liệu đang thấy có thể là lần cập nhật trước.
          </p>
        )}

        {imageError && (
          <p className="ops-notice red" role="alert">
            {imageError}
          </p>
        )}

        {loading ? (
          <div className="ops-empty">
            Đang tải sự kiện...
          </div>
        ) : !visible.length ? (
          <div className="ops-empty">
            <strong>Chưa có sự kiện phù hợp</strong>
            <p>
              Sự kiện sẽ xuất hiện khi AI gửi kết quả đếm chim
              hoặc cảnh báo.
            </p>
          </div>
        ) : (
          visible.map((entry) => (
            <article className="ops-event" key={entry.id}>
              <div
                className={
                  entry.eventType === "THREAT_ALERT"
                    ? "ops-event-marker threat"
                    : "ops-event-marker"
                }
              >
                {entry.eventType === "THREAT_ALERT" ? "!" : "↔"}
              </div>

              <div className="ops-event-body">
                <div className="ops-event-heading">
                  <h3>{eventTitle(entry.eventType)}</h3>
                  <time>{formatDate(entry.timestamp)}</time>
                </div>

                <p>
                  {entry.description ||
                    "Hệ thống đã ghi nhận sự kiện."}
                </p>

                <div className="ops-event-meta">
                  <span>
                    Camera: {entry.cameraId || "—"}
                  </span>

                  {entry.eventType !== "THREAT_ALERT" && (
                    <span>
                      IN {entry.inCount ?? "—"}
                      {" · "}OUT {entry.outCount ?? "—"}
                      {" · "}Còn lại {entry.currentCount ?? "—"}
                    </span>
                  )}

                  {entry.snapshotKey ? (
                    <button
                      className="ops-text-button"
                      disabled={imageLoading !== null}
                      onClick={() => void showImage(entry)}
                    >
                      {imageLoading === entry.id
                        ? "Đang mở ảnh..."
                        : images[entry.id]
                          ? "Tải lại ảnh"
                          : "Xem ảnh"}
                    </button>
                  ) : entry.eventType === "THREAT_ALERT" ? (
                    <span>Chưa có ảnh đính kèm</span>
                  ) : null}
                </div>

                {images[entry.id] && (
                  <img
                    className="ops-snapshot"
                    src={images[entry.id]}
                    alt="Ảnh của sự kiện AI"
                    onError={() => {
                      setImages((current) => {
                        const next = { ...current };
                        delete next[entry.id];
                        return next;
                      });

                      setImageError(
                        "Không mở được ảnh. Thử tải lại hoặc kiểm tra dịch vụ lưu ảnh."
                      );
                    }}
                  />
                )}
              </div>
            </article>
          ))
        )}

        <div className="ops-pagination">
          <span>
            Trang {currentPage} / {totalPages}
          </span>

          <div className="ops-actions">
            <button
              className="ops-secondary"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Trước
            </button>

            <button
              className="ops-secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Sau
            </button>
          </div>
        </div>
      </section>

      <SectionStyles />
    </div>
  );
}

/* ======================== TELEGRAM ======================== */

export function TelegramSection() {
  return (
    <div className="work-tabs">
      <div className="ops-page-heading">
        <div>
          <h2>Kết nối Telegram</h2>
          <p>
            Quản lý kênh nhận cảnh báo cho tài khoản của bạn.
          </p>
        </div>
      </div>

      <div className="ops-telegram-grid">
        <div className="telegram-box">
          <TelegramNotificationSettings />
        </div>

        <aside className="ops-card ops-guide">
          <span className="ops-badge blue">
            HƯỚNG DẪN LIÊN KẾT
          </span>

          <h3>Ba bước để nhận thông báo</h3>

          <ol>
            <li>
              <strong>Tạo mã trên website</strong>
              <p>
                Bấm “Tạo mã liên kết” trong khung bên cạnh.
              </p>
            </li>

            <li>
              <strong>Gửi mã cho bot Telegram</strong>
              <p>
                Mở bot của hệ thống, gửi /start rồi gửi
                nguyên mã vừa tạo.
              </p>
            </li>

            <li>
              <strong>Xác nhận liên kết</strong>
              <p>
                Quay lại đây và bấm “Kiểm tra liên kết”.
              </p>
            </li>
          </ol>

          <p className="ops-footnote">
            Mã dùng một lần và có thời hạn. Ảnh cảnh báo chỉ
            được gửi khi hệ thống đã lưu và cung cấp được ảnh.
          </p>
        </aside>
      </div>

      <SectionStyles />
    </div>
  );
}

/* Các style chỉ nằm trong .work-tabs */

function SectionStyles() {
  return (
    <style jsx global>{`
      .work-tabs {
        color: #1e293b;
        min-width: 0;
      }

      .work-tabs .ops-page-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }

      .work-tabs h2 {
        font-size: 23px;
        font-weight: 700;
        margin: 0 0 8px;
      }

      .work-tabs h3 {
        font-size: 15px;
        font-weight: 600;
        margin: 0;
        color: #1e293b;
      }

      .work-tabs p {
        font-size: 13px;
        line-height: 1.7;
        color: #64748b;
        margin: 6px 0 0;
      }

      .work-tabs button {
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s;
      }

      .work-tabs button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .work-tabs button:focus-visible {
        outline: 3px solid #c7d2fe;
        outline-offset: 3px;
      }

      .work-tabs .ops-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px;
        border-radius: 20px;
        font-size: 11px;
        white-space: nowrap;
      }

      .work-tabs .ops-badge i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .work-tabs .green {
        background: #ecfdf5;
        color: #059669;
      }

      .work-tabs .gray {
        background: #f1f5f9;
        color: #64748b;
      }

      .work-tabs .blue {
        background: #eff6ff;
        color: #2563eb;
      }

      .work-tabs .ops-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 22px;
      }

      .work-tabs .ops-stat,
      .work-tabs .ops-card {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
      }

      .work-tabs .ops-stat {
        padding: 20px;
      }

      .work-tabs .ops-stat > span {
        display: block;
        font-size: 12px;
        color: #64748b;
      }

      .work-tabs .ops-stat > strong {
        display: block;
        margin-top: 12px;
        font-size: 29px;
        line-height: 1.2;
        font-weight: 700;
        color: #1e293b;
      }

      .work-tabs .ops-stat small {
        font-size: 15px;
        font-weight: 400;
        color: #94a3b8;
      }

      .work-tabs .ops-stat.danger > strong {
        color: #e11d48;
      }

      .work-tabs .ops-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }

      .work-tabs .ops-toolbar.ops-card {
        padding: 18px 20px;
        margin-bottom: 18px;
      }

      .work-tabs .ops-toolbar strong {
        font-size: 14px;
      }

      .work-tabs .ops-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .work-tabs .ops-primary,
      .work-tabs .ops-secondary {
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
      }

      .work-tabs .ops-primary {
        border: 1px solid #4f46e5;
        background: #4f46e5;
        color: #fff;
      }

      .work-tabs .ops-primary:hover:not(:disabled) {
        background: #4338ca;
      }

      .work-tabs .ops-secondary {
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #475569;
      }

      .work-tabs .ops-secondary:hover:not(:disabled) {
        background: #f8fafc;
      }

      .work-tabs .ops-control-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(min(100%, 320px), 1fr));
        gap: 16px;
      }

      .work-tabs .ops-device {
        padding: 20px;
      }

      .work-tabs .ops-device-heading {
        display: flex;
        align-items: center;
        gap: 11px;
        margin-bottom: 22px;
      }

      .work-tabs .ops-device-heading > div {
        flex: 1;
        min-width: 0;
      }

      .work-tabs .ops-device-heading h3 {
        overflow-wrap: anywhere;
      }

      .work-tabs .ops-device-heading p {
        font-size: 11px;
        margin: 3px 0 0;
      }

      .work-tabs .ops-device-icon {
        width: 40px;
        height: 40px;
        border-radius: 11px;
        background: #eef2ff;
        color: #6366f1;
        display: grid;
        place-items: center;
        font-size: 24px;
        flex-shrink: 0;
      }

      .work-tabs .ops-device-icon[data-kind="HEATER"] {
        background: #fff7ed;
        color: #ea580c;
      }

      .work-tabs .ops-device-icon[data-kind="HUMIDIFIER"] {
        background: #ecfeff;
        color: #0891b2;
      }

      .work-tabs .ops-device-icon[data-kind="ALARM"] {
        background: #fff1f2;
        color: #e11d48;
      }

      .work-tabs .ops-control-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      .work-tabs .ops-control-row > span {
        font-size: 12px;
        color: #64748b;
      }

      .work-tabs .ops-segment {
        display: flex;
        gap: 3px;
        background: #f1f5f9;
        padding: 4px;
        border-radius: 9px;
      }

      .work-tabs .ops-segment button {
        border: 0;
        background: transparent;
        color: #64748b;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
      }

      .work-tabs .ops-segment button[aria-pressed="true"] {
        background: #fff;
        color: #4f46e5;
        box-shadow: 0 1px 4px #0f172a12;
      }

      .work-tabs .ops-device-result {
        border-top: 1px solid #f1f5f9;
        margin-top: 20px;
        padding-top: 13px;
        font-size: 11px;
        color: #64748b;
      }

      .work-tabs .ops-device-result p {
        font-size: 11px;
        overflow-wrap: anywhere;
      }

      .work-tabs .ops-notice {
        padding: 12px 14px;
        background: #eef2ff;
        color: #4338ca;
        border-radius: 9px;
        font-size: 12px;
        line-height: 1.7;
        margin: 0 0 16px;
        overflow-wrap: anywhere;
      }

      .work-tabs .ops-notice.red {
        background: #fef2f2;
        color: #b91c1c;
      }

      .work-tabs .ops-notice.amber {
        background: #fffbeb;
        color: #92400e;
      }

      .work-tabs .ops-footnote {
        font-size: 12px;
        color: #94a3b8;
        margin-top: 16px;
      }

      .work-tabs .ops-telegram-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
        background: #eef2ff;
        border: 1px solid #e0e7ff;
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 22px;
      }

      .work-tabs .ops-telegram-banner strong {
        font-size: 15px;
        color: #3730a3;
      }

      .work-tabs .ops-events {
        padding: 20px;
      }

      .work-tabs .ops-filter {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .work-tabs .ops-filter button {
        padding: 8px 12px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: #f8fafc;
        color: #64748b;
        font-size: 12px;
      }

      .work-tabs .ops-filter button[aria-pressed="true"] {
        background: #eef2ff;
        color: #4f46e5;
        border-color: #e0e7ff;
      }

      .work-tabs .ops-muted {
        font-size: 11px;
        color: #94a3b8;
      }

      .work-tabs .ops-event {
        display: flex;
        gap: 14px;
        padding: 20px 0;
        border-bottom: 1px solid #f1f5f9;
      }

      .work-tabs .ops-event-marker {
        width: 35px;
        height: 35px;
        flex-shrink: 0;
        border-radius: 10px;
        background: #eff6ff;
        color: #2563eb;
        display: grid;
        place-items: center;
        font-size: 18px;
      }

      .work-tabs .ops-event-marker.threat {
        background: #fff1f2;
        color: #e11d48;
        font-weight: 700;
      }

      .work-tabs .ops-event-body {
        flex: 1;
        min-width: 0;
      }

      .work-tabs .ops-event-heading {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .work-tabs .ops-event-heading time {
        font-size: 11px;
        color: #94a3b8;
      }

      .work-tabs .ops-event-body > p {
        overflow-wrap: anywhere;
      }

      .work-tabs .ops-event-meta {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        font-size: 11px;
        color: #94a3b8;
        margin-top: 10px;
      }

      .work-tabs .ops-text-button {
        background: none;
        border: 0;
        padding: 0;
        color: #4f46e5;
        font-size: 12px;
        font-weight: 600;
      }

      .work-tabs .ops-snapshot {
        display: block;
        max-width: 100%;
        max-height: 350px;
        object-fit: contain;
        border-radius: 10px;
        margin-top: 14px;
      }

      .work-tabs .ops-pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 18px;
        font-size: 12px;
        color: #64748b;
      }

      .work-tabs .ops-empty {
        text-align: center;
        padding: 44px 18px;
        color: #94a3b8;
        font-size: 13px;
      }

      .work-tabs .ops-empty strong {
        color: #475569;
      }

      .work-tabs .ops-telegram-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }

      .work-tabs .telegram-box .panel {
        box-sizing: border-box;
        max-width: none !important;
        width: 100%;
        margin: 0;
        padding: 24px;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #fff;
      }

      .work-tabs .telegram-box .panel-heading {
        margin-bottom: 20px;
      }

      .work-tabs .telegram-box .text-button {
        display: inline-block;
        background: #4f46e5;
        border: 1px solid #4f46e5;
        color: #fff;
        border-radius: 8px;
        padding: 10px 14px;
        margin: 14px 8px 0 0;
        font-size: 12px;
        text-decoration: none;
      }

      .work-tabs .telegram-box p[role="status"] {
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        background: #ecfdf5;
        color: #047857;
      }

      .work-tabs .telegram-box p[role="alert"] {
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        background: #fef2f2;
      }

      .work-tabs .ops-guide {
        padding: 24px;
      }

      .work-tabs .ops-guide h3 {
        margin-top: 18px;
        font-size: 18px;
      }

      .work-tabs .ops-guide ol {
        padding-left: 20px;
        margin: 20px 0 0;
      }

      .work-tabs .ops-guide li {
        padding-left: 7px;
        margin-bottom: 20px;
        font-size: 13px;
      }

      .work-tabs .ops-guide li::marker {
        color: #6366f1;
        font-weight: 700;
      }

      @media (max-width: 760px) {
        .work-tabs .ops-stats {
          gap: 10px;
        }

        .work-tabs .ops-stat {
          padding: 14px;
        }

        .work-tabs .ops-stat > strong {
          font-size: 24px;
        }

        .work-tabs .ops-telegram-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 480px) {
        .work-tabs .ops-stats {
          grid-template-columns: 1fr;
        }

        .work-tabs .ops-stat {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .work-tabs .ops-stat > strong {
          margin-top: 0;
        }

        .work-tabs .ops-events,
        .work-tabs .ops-device {
          padding: 16px;
        }
      }
    `}</style>
  );
}