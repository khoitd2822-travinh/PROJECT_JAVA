"use client";

import { useState } from "react";

export default function CameraStream({
  fitVideo = false,
}: {
  fitVideo?: boolean;
}) {
  const [inputUrl, setInputUrl] = useState(
    process.env.NEXT_PUBLIC_AI_STREAM_URL ||
      "http://127.0.0.1:8090/stream"
  );

  const [activeUrl, setActiveUrl] = useState("");
  const [error, setError] = useState("");

  function toggleStream() {
    if (activeUrl) {
      setActiveUrl("");
      setError("");
      return;
    }

    try {
      const url = new URL(inputUrl.trim());

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error();
      }

      setError("");
      setActiveUrl(url.toString());
    } catch {
      setError("Địa chỉ video không hợp lệ.");
    }
  }

  return (
    <section className="camera-panel">
      <h3>Camera AI trực tiếp</h3>

      <p className="description">
        Video có khung nhận diện, vạch đếm và số lượng IN/OUT.
      </p>

      <div
        className={`video-frame${fitVideo ? " fit-video" : ""}${
          activeUrl ? " playing" : ""
        }`}
      >
        {activeUrl ? (
          <img
            key={activeUrl}
            src={activeUrl}
            alt="Camera nhận diện chim yến"
            onError={() => {
              setActiveUrl("");
              setError(
                "Không mở được video. Kiểm tra Python AI rồi thử lại."
              );
            }}
          />
        ) : (
          <div className="placeholder">
            <span aria-hidden="true">◉</span>
            <strong>Camera đang tắt</strong>
            <p>Bấm “Mở video AI” để bắt đầu xem.</p>
          </div>
        )}
      </div>

      <div className="connection">
        <input
          aria-label="Địa chỉ video AI"
          value={inputUrl}
          disabled={Boolean(activeUrl)}
          onChange={(event) => setInputUrl(event.target.value)}
          placeholder="http://127.0.0.1:8090/stream"
        />

        <button
          type="button"
          className={activeUrl ? "stop" : ""}
          onClick={toggleStream}
        >
          {activeUrl ? "Dừng xem" : "Mở video AI"}
        </button>
      </div>

      {activeUrl && (
        <p className="stream-note">Đang mở luồng video từ AI.</p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <style jsx>{`
        .camera-panel {
          background: #fff;
          padding: 22px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          min-width: 0;
        }

        h3 {
          margin: 0;
          color: #1e293b;
          font-size: 18px;
          font-weight: 600;
        }

        .description {
          margin: 8px 0 18px;
          color: #64748b;
          font-size: 13px;
          line-height: 1.6;
        }

        /* Monitoring */
        .video-frame {
          width: 100%;
          height: 400px;
          background: #0f172a;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }

        .video-frame img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        /* Dashboard: khung ôm vừa ảnh */
        .video-frame.fit-video {
          width: fit-content;
          max-width: 100%;
          height: auto;
          margin: 0 auto;
        }

        .video-frame.fit-video img {
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: 400px;
        }

        .video-frame.fit-video:not(.playing) {
          width: 100%;
          max-width: 600px;
          height: 400px;
        }

        .placeholder {
          box-sizing: border-box;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 20px;
          text-align: center;
          color: #94a3b8;
          gap: 10px;
        }

        .placeholder > span {
          font-size: 36px;
          color: #818cf8;
        }

        .placeholder strong {
          font-size: 14px;
          color: #e2e8f0;
        }

        .placeholder p {
          font-size: 12px;
          margin: 0;
        }

        .connection {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }

        input {
          box-sizing: border-box;
          flex: 1;
          min-width: 0;
          padding: 11px 12px;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          font-size: 12px;
          color: #475569;
          background: #f8fafc;
        }

        button {
          padding: 11px 18px;
          border: 1px solid #4f46e5;
          border-radius: 8px;
          background: #4f46e5;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        button:hover {
          background: #4338ca;
        }

        button.stop {
          background: #dc2626;
          border-color: #dc2626;
          color: #fff;
        }

        button.stop:hover {
          background: #b91c1c;
        }

        .stream-note {
          font-size: 12px;
          color: #64748b;
          margin: 10px 0 0;
        }

        .error {
          color: #b91c1c;
          font-size: 12px;
          line-height: 1.6;
          margin: 12px 0 0;
        }

        input:focus-visible,
        button:focus-visible {
          outline: 3px solid #c7d2fe;
          outline-offset: 2px;
        }

        @media (max-width: 480px) {
          .camera-panel {
            padding: 16px;
          }

          .connection {
            flex-wrap: wrap;
          }

          .connection input {
            flex-basis: 100%;
          }

          .connection button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}