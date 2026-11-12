'use client';

import React, { useState, useEffect } from 'react';

export default function VideoDemoSection() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoName, setVideoName] = useState('');

  // Dọn dẹp object URL khi unmount để tránh rò rỉ bộ nhớ (Đúng chuẩn yêu cầu)
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-gray-800">
        Phần Demo: Tải và Phân tích Video
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Khu vực thử nghiệm thủ công (đã được tách biệt hoàn toàn khỏi luồng dữ liệu thiết bị thật của nhà yến).
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label
        htmlFor="swiftlet-video-demo"
        style={{
            display: 'inline-block', // <-- Thêm cái này để tách khối
            backgroundColor: '#4f46e5',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
        }}
        >
        📁 Chọn video demo
        </label>
        <input
          id="swiftlet-video-demo"
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setVideoUrl((oldUrl) => {
                if (oldUrl) URL.revokeObjectURL(oldUrl);
                return URL.createObjectURL(file);
              });
              setVideoName(file.name);
            }
          }}
        />
        <span className="text-sm text-gray-500">
          {videoName || "Chưa chọn file video demo"}
        </span>
      </div>

      {videoUrl ? (
        <div className="mt-5">
          <video
            id="swiftlet-video-player-demo"
            src={videoUrl}
            controls
            className="w-full rounded-lg bg-black"
            style={{ maxHeight: "480px" }}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                const video = document.getElementById("swiftlet-video-player-demo") as HTMLVideoElement | null;
                video?.play();
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              ▶ Phát video
            </button>
            <button
              type="button"
              onClick={() => {
                setVideoUrl((oldUrl) => {
                  if (oldUrl) URL.revokeObjectURL(oldUrl);
                  return "";
                });
                setVideoName("");
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ✕ Xóa video
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}