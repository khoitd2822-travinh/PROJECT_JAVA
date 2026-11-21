"use client";

import { useEffect, useState } from "react";
import { telegramApi } from "../lib/api";

export default function TelegramNotificationSettings() {
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    telegramApi
      .linkStatus()
      .then((status) => {
        if (active) setLinked(status.linked);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được trạng thái Telegram");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function createCode() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await telegramApi.createLinkCode();
      setCode(result.code);
      setMessage(`Mã có hiệu lực trong ${Math.floor(result.expiresInSeconds / 60)} phút.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được mã liên kết");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await telegramApi.unlink();
      setLinked(false);
      setCode("");
      setMessage("Đã ngắt liên kết. Bạn sẽ không nhận cảnh báo Telegram nữa.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không ngắt được liên kết");
    } finally {
      setBusy(false);
    }
  }

  async function checkLinkStatus() {
    setBusy(true);
    setError("");
    try {
      const status = await telegramApi.linkStatus();
      setLinked(status.linked);
      if (status.linked) {
        setCode("");
        setMessage("Đã liên kết thành công. Bạn sẽ nhận cảnh báo tại Telegram.");
      } else {
        setMessage("Chưa nhận được liên kết. Hãy gửi mã cho bot rồi thử lại.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không kiểm tra được trạng thái liên kết");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ maxWidth: 720 }}>
      <div className="panel-heading">
        <div>
          <h3>Thông báo Telegram</h3>
          <p>Liên kết Telegram để nhận cảnh báo và hình ảnh từ hệ thống.</p>
        </div>
      </div>

      {loading ? <p>Đang tải trạng thái liên kết...</p> : null}
      {!loading && linked ? (
        <>
          <p>Telegram đã được liên kết với tài khoản này.</p>
          <button type="button" onClick={unlink} disabled={busy} className="text-button">
            {busy ? "Đang xử lý..." : "Ngắt liên kết"}
          </button>
        </>
      ) : null}
      {!loading && !linked ? (
        <>
          <p>
            Tạo mã trong web, mở bot Telegram của hệ thống, nhấn <strong>/start</strong> rồi gửi mã cho bot.
            Mỗi mã chỉ dùng được một lần.
          </p>
          <button type="button" onClick={createCode} disabled={busy} className="text-button">
            {busy ? "Đang tạo..." : "Tạo mã liên kết"}
          </button>
          {code ? (
            <>
              <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, margin: "16px 0 4px" }}>
                {code}
              </p>
              <button type="button" onClick={checkLinkStatus} disabled={busy} className="text-button">
                Kiểm tra liên kết
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
    </section>
  );
}
