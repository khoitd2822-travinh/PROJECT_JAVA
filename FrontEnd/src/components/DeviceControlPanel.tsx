"use client";

import type { DeviceControls } from "../hooks/useDeviceControls";

function resultLabel(status?: string) {
  if (status === "SUCCESS" || status === "CONFIRMED") {
    return "Đã xác nhận";
  }

  if (status === "PENDING") {
    return "Đang chờ phản hồi";
  }

  if (status === "TIMED_OUT") {
    return "Hết thời gian chờ";
  }

  if (
    ["FAILED", "REJECTED", "PUBLISH_FAILED"].includes(status || "")
  ) {
    return "Lệnh chưa thành công";
  }

  return "Chưa có lệnh";
}

export default function DeviceControlPanel({
  controls,
  dashboardStyle = false,
}: {
  controls: DeviceControls;
  dashboardStyle?: boolean;
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
    busy ||
    !online ||
    Boolean(deviceError) ||
    !devices.length;

  return (
    <section
      className={
        dashboardStyle
          ? "control-panel dashboard-style"
          : "control-panel"
      }
    >
      <header>
        <div>
          <h3>Điều khiển thiết bị</h3>

          <p>
            {online
              ? "Theo dõi và điều khiển thiết bị trong nhà yến."
              : "Offline · Trạng thái bên dưới là lần cuối nhận được."}
          </p>
        </div>

        <span
          className={
            online ? "connection online" : "connection"
          }
        >
          <i />
          {online ? "Đã kết nối" : "Offline"}
        </span>
      </header>

      <div className="all-modes">
        <span>Áp dụng cho tất cả</span>

        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void setAllMode("AUTO")}
          >
            Tự động
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => void setAllMode("MANUAL")}
          >
            Thủ công
          </button>
        </div>
      </div>

      {deviceError && (
        <p role="alert" className="notice error">
          {deviceError}
        </p>
      )}

      {message && (
        <p role="status" className="notice">
          {busy ? "⏳ " : ""}
          {message}
        </p>
      )}

      {!devices.length && (
        <p className="empty">
          Chưa tải được danh sách thiết bị.
        </p>
      )}

      <div className="device-list">
        {devices.map((device, index) => {
          const on = device.status === "ON";
          const known = on || device.status === "OFF";

          const failed = [
            "FAILED",
            "REJECTED",
            "PUBLISH_FAILED",
            "TIMED_OUT",
          ].includes(device.lastAckStatus || "");

          return (
            <article key={device.id} className="device-card">
              <div className="device-heading">
                <h4>{device.name}</h4>

                <span
                  className={
                    online && on ? "state active" : "state"
                  }
                >
                  <i />
                  {known
                    ? on
                      ? "Đang bật"
                      : "Đang tắt"
                    : "Chưa xác định"}
                </span>
              </div>

              <p className="mode-label">
                Chế độ:{" "}
                <strong>
                  {device.controlMode === "AUTO"
                    ? "Tự động"
                    : device.controlMode === "MANUAL"
                      ? "Thủ công"
                      : "Chưa xác định"}
                </strong>
              </p>

              <div className="device-actions">
                <div
                  className="power-group"
                  role="group"
                  aria-label={"Bật tắt " + device.name}
                >
                  <button
                    type="button"
                    className={
                      on ? "power selected-on" : "power"
                    }
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => void send(index, "ON")}
                  >
                    Bật
                  </button>

                  <button
                    type="button"
                    className={
                      device.status === "OFF"
                        ? "power selected-off"
                        : "power"
                    }
                    aria-pressed={device.status === "OFF"}
                    disabled={disabled}
                    onClick={() => void send(index, "OFF")}
                  >
                    Tắt
                  </button>
                </div>

                <div
                  className="mode-group"
                  role="group"
                  aria-label={"Chế độ " + device.name}
                >
                  <button
                    type="button"
                    aria-pressed={device.controlMode === "AUTO"}
                    disabled={disabled}
                    onClick={() => void send(index, "AUTO")}
                  >
                    Tự động
                  </button>

                  <button
                    type="button"
                    aria-pressed={device.controlMode === "MANUAL"}
                    disabled={disabled}
                    onClick={() => void send(index, "MANUAL")}
                  >
                    Thủ công
                  </button>
                </div>
              </div>

              <div
                className={failed ? "result failed" : "result"}
              >
                {resultLabel(device.lastAckStatus)}

                {device.lastMessage && (
                  <span> · {device.lastMessage}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="footnote">
        Bấm Bật / Tắt sẽ chuyển thiết bị đó sang chế độ thủ công.
      </p>

      <style jsx>{`
        .control-panel {
          background: #fff;
          padding: 22px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          min-width: 0;
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        h3 {
          margin: 0;
          color: #1e293b;
          font-size: 18px;
          font-weight: 600;
        }

        header p {
          font-size: 12px;
          color: #64748b;
          line-height: 1.6;
          margin: 7px 0 0;
        }

        .connection {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 20px;
          background: #f1f5f9;
          color: #64748b;
          font-size: 11px;
          white-space: nowrap;
        }

        .connection.online {
          background: #ecfdf5;
          color: #059669;
        }

        .connection i,
        .state i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          display: inline-block;
        }

        .all-modes {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: #f8fafc;
          border: 1px solid #edf2f7;
          border-radius: 9px;
          padding: 11px 12px;
          margin-bottom: 16px;
        }

        .all-modes > span {
          font-size: 12px;
          color: #64748b;
        }

        .all-modes > div {
          display: flex;
          gap: 8px;
        }

        .all-modes button {
          color: #4f46e5;
          border-color: #dfe3ff;
          background: #fff;
        }

        .device-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .device-card {
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          background: #fff;
        }

        .device-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }

        .state {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          font-size: 11px;
        }

        .state.active {
          color: #059669;
        }

        .mode-label {
          font-size: 12px;
          color: #94a3b8;
          margin: 8px 0 14px;
        }

        .mode-label strong {
          font-weight: 500;
          color: #64748b;
        }

        .device-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .power-group,
        .mode-group {
          display: flex;
          gap: 6px;
        }

        button {
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #64748b;
          padding: 8px 13px;
          border-radius: 7px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }

        button:hover:not(:disabled) {
          border-color: #a5b4fc;
          background: #f5f7ff;
        }

        .power {
          min-width: 60px;
        }

        .power.selected-on,
        .power.selected-on:hover:not(:disabled) {
          background: #059669;
          border-color: #059669;
          color: #fff;
        }

        .power.selected-off,
        .power.selected-off:hover:not(:disabled) {
          background: #64748b;
          border-color: #64748b;
          color: #fff;
        }

        .mode-group button[aria-pressed="true"] {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4f46e5;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        button:focus-visible {
          outline: 3px solid #c7d2fe;
          outline-offset: 2px;
        }

        .result {
          border-top: 1px solid #f1f5f9;
          padding-top: 11px;
          margin-top: 14px;
          font-size: 11px;
          line-height: 1.6;
          color: #94a3b8;
          overflow-wrap: anywhere;
        }

        .result.failed {
          color: #dc2626;
        }

        .notice {
          padding: 10px 12px;
          border-radius: 8px;
          background: #eef2ff;
          color: #4338ca;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
          margin: 0 0 14px;
        }

        .notice.error {
          background: #fef2f2;
          color: #b91c1c;
        }

        .footnote,
        .empty {
          font-size: 11px;
          line-height: 1.7;
          color: #94a3b8;
          margin: 15px 0 0;
        }

        /* Chỉ áp dụng ở Dashboard */
        .dashboard-style .device-list {
          gap: 10px;
        }

        .dashboard-style .device-card {
          padding: 14px 16px;
          border: 1px solid #e7ecf4;
          border-left: 3px solid #c7d2fe;
          border-radius: 10px;
          background: linear-gradient(
            110deg,
            #fafbff 0%,
            #ffffff 60%
          );
        }

        .dashboard-style .state {
          padding: 4px 8px;
          border-radius: 6px;
          background: #f1f5f9;
        }

        .dashboard-style .state.active {
          background: #ecfdf5;
          color: #059669;
        }

        .dashboard-style .mode-label {
          margin: 7px 0 12px;
        }

        .dashboard-style .all-modes {
          background: #f5f7ff;
          border-color: #e0e7ff;
          padding: 12px;
        }

        .dashboard-style button {
          min-height: 34px;
          padding: 7px 13px;
          border-radius: 8px;
          font-weight: 600;
          box-shadow: 0 1px 2px #0f172a04;
        }

        .dashboard-style .power-group {
          gap: 0;
        }

        .dashboard-style .power-group button:first-child {
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
        }

        .dashboard-style .power-group button:last-child {
          border-top-left-radius: 0;
          border-bottom-left-radius: 0;
        }

        .dashboard-style .power.selected-on,
        .dashboard-style .power.selected-on:hover:not(:disabled) {
          background: #059669;
          border-color: #059669;
          color: #fff;
        }

        .dashboard-style .power.selected-off,
        .dashboard-style .power.selected-off:hover:not(:disabled) {
          background: #475569;
          border-color: #475569;
          color: #fff;
        }

        .dashboard-style .mode-group button[aria-pressed="true"] {
          background: #4f46e5;
          border-color: #4f46e5;
          color: #fff;
        }

        .dashboard-style .result {
          border-top: 0;
          margin-top: 10px;
          padding-top: 0;
          font-size: 11px;
        }

        @media (max-width: 480px) {
          .control-panel {
            padding: 16px;
          }

          .device-card {
            padding: 14px;
          }

          .device-actions {
            align-items: stretch;
          }

          .power-group,
          .mode-group {
            flex: 1;
          }

          .device-actions button {
            flex: 1;
            padding: 8px 10px;
          }

          .all-modes > div {
            flex: 1;
            justify-content: flex-end;
          }
        }
      `}</style>
    </section>
  );
}