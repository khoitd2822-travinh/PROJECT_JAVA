"""Do tai nguyen khi chay: CPU (tien trinh + ca may), RAM, GPU NVIDIA (qua nvidia-smi).
Chay o thread rieng, lay mau moi 1 giay. Can: pip install psutil (GPU can driver NVIDIA co nvidia-smi)."""
from __future__ import annotations

import os
import shutil
import subprocess
import threading

try:
    import psutil
except ImportError:          # khong co psutil -> bo qua, khong lam hong chuong trinh
    psutil = None


class ResourceMonitor:
    def __init__(self, interval: float = 1.0, gpu: bool = True):
        self.interval = interval
        self.samples: list[dict] = []
        self._stop = threading.Event()
        self._thread = None
        self.gpu_ok = gpu and shutil.which("nvidia-smi") is not None
        self.proc = psutil.Process(os.getpid()) if psutil else None

    def start(self):
        if psutil is None:
            print("[PERF] Chua cai psutil -> khong do duoc CPU/RAM (pip install psutil)")
            return self
        self.proc.cpu_percent(None)
        psutil.cpu_percent(None)
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return self

    def _gpu(self):
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=2).stdout.strip().splitlines()[0]
            util, mem = [float(x) for x in out.split(",")]
            return util, mem
        except Exception:
            return None

    def _run(self):
        ncpu = psutil.cpu_count() or 1
        while not self._stop.wait(self.interval):
            s = {"cpu_may_pct": psutil.cpu_percent(None),                    # CPU ca may
                 "cpu_tien_trinh_pct": self.proc.cpu_percent(None) / ncpu,   # chuong trinh nay, % tong may
                 "ram_mb": self.proc.memory_info().rss / 1048576}
            g = self._gpu() if self.gpu_ok else None
            if g:
                s["gpu_pct"], s["gpu_vram_mb"] = g
            self.samples.append(s)

    def summary(self) -> dict:
        out = {}
        keys = {k for s in self.samples for k in s}
        for k in keys:
            vals = [s[k] for s in self.samples if k in s]
            out[k] = {"tb": round(sum(vals) / len(vals), 1), "max": round(max(vals), 1)}
        return out

    def stop(self) -> dict:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
        return self.summary()


def format_summary(res: dict) -> str:
    if not res:
        return "khong co du lieu (run qua ngan hoac chua cai psutil)"
    parts = []
    for key, label in (("cpu_tien_trinh_pct", "CPU chuong trinh"), ("cpu_may_pct", "CPU ca may"),
                       ("ram_mb", "RAM"), ("gpu_pct", "GPU"), ("gpu_vram_mb", "VRAM")):
        if key in res:
            unit = "MB" if key.endswith("_mb") else "%"
            parts.append(f"{label} {res[key]['tb']}{unit} (max {res[key]['max']})")
    if "gpu_pct" not in res:
        parts.append("GPU: khong do duoc (khong co nvidia-smi)")
    return " | ".join(parts)