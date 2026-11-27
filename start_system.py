#!/usr/bin/env python3
"""
start_system.py - Khoi dong TOAN BO he thong SwiftletCare bang 1 lenh duy nhat.

Quy trinh tu dong:
  1. Tu dong nhan dien IP LAN + Wi-Fi SSID + mat khau cua may dang chay
     va dong bo file local (.local.h).
  2. Bat Docker Compose (EMQX, TimescaleDB, Redis, Zenko S3) va cho cac cong san sang.
  3. Bat UDP Broker Discovery (cong 41234) de ESP32-Main trong mang LAN tu tim thay
     IP may nay ngay ca khi doi may ma khong cam USB.
  4. Quet cac thiet bi ESP32-Main / ESP32-CAM dang cam USB (tu dong cap nhat Wi-Fi + MQTT
     vao bo nho NVS trong 1-2 giay, khong can bien dich lai firmware; tuy chon --flash de nap moi).
  5. Khoi chay BackEnd (Spring Boot :8080), bao dam TimescaleDB hypertable,
     FrontEnd (Next.js :3000) va AI Edge (ai/src/main.py :8090 neu co best.pt & camera).
  6. Tu dong mo trinh duyet toi http://localhost:3000 va gom log tat ca dich vu vao 1 terminal.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import http.server
import ipaddress
import json
import os
import platform
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = ROOT_DIR / "firmware" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import env_bootstrap as eb
import setup_local_config as slc
import usb_provisioner as usb_prov

DISCOVERY_PORT = 41234
DISCOVERY_MAGIC = b"SWIFTLET_DISCOVER_MQTT"


def tcp_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_status(url: str, timeout: float = 2.0) -> int | None:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(resp.status)
    except urllib.error.HTTPError as exc:
        return int(exc.code)
    except Exception:
        return None


def backend_is_ready() -> bool:
    code = http_status("http://127.0.0.1:8080/api/v1/auth/login", timeout=1.5)
    return code is not None and code < 500


def frontend_is_ready() -> bool:
    code = http_status("http://127.0.0.1:3000/", timeout=1.5)
    return code is not None and code < 500


def wait_until(
    predicate,
    timeout_s: float,
    label: str,
    interval_s: float = 1.0,
    proc: subprocess.Popen | None = None,
) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if predicate():
            return True
        if proc is not None and proc.poll() is not None:
            print(f"[ERROR] {label} thoat som voi ma {proc.returncode}.")
            return False
        time.sleep(interval_s)
    print(f"[TIMEOUT] Het thoi gian cho: {label}")
    return False


def start_udp_discovery_server(
    broker_host: str,
    broker_port: int,
    stop_event: threading.Event,
    discovery_port: int = DISCOVERY_PORT,
) -> threading.Thread | None:
    """Tra loi goi tin SWIFTLET_DISCOVER_MQTT de ESP32 tu dong tim thay EMQX trong LAN."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        if platform.system() != "Windows":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", discovery_port))
        sock.settimeout(0.5)
    except OSError as exc:
        sock.close()
        print(f"[DISCOVER] Khong mo duoc UDP :{discovery_port} ({exc}) -> bo qua.")
        return None

    reply_payload = json.dumps({
        "service": "swiftlet-emqx",
        "host": broker_host,
        "port": broker_port,
    }).encode("utf-8")

    def serve() -> None:
        try:
            while not stop_event.is_set():
                try:
                    data, addr = sock.recvfrom(512)
                except socket.timeout:
                    continue
                except OSError:
                    break
                if DISCOVERY_MAGIC in data:
                    try:
                        sock.sendto(reply_payload, addr)
                    except OSError:
                        pass
        finally:
            sock.close()

    t = threading.Thread(target=serve, name="mqtt-udp-discovery", daemon=True)
    t.start()
    print(f"[DISCOVER] UDP Broker Responder san sang tai :{discovery_port} -> {broker_host}:{broker_port}")
    return t


def stop_conflicting_mocks() -> None:
    """Dung cac script mock ESP32 cu neu dang chay ngam de tranh ghi de du lieu thiet bi that."""
    targets = ("mock_dev_publisher.py", "mock_dev_board.py")
    if platform.system() == "Windows":
        ps = (
            "Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%'\" | "
            "Where-Object { $_.CommandLine -match 'mock_dev_publisher\\.py|mock_dev_board\\.py' } | "
            "ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"
        )
        proc = subprocess.run(["powershell", "-NoProfile", "-Command", ps], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        for line in proc.stdout.decode("utf-8", errors="replace").splitlines():
            if "|" not in line:
                continue
            pid_s, cmdline = line.split("|", 1)
            pid_s = pid_s.strip()
            if pid_s.isdigit():
                subprocess.run(["taskkill", "/F", "/PID", pid_s], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print(f"[CLEANUP] Da dung script mock cu (PID {pid_s}): {cmdline.strip()}")
    else:
        for script_name in targets:
            proc = subprocess.run(["pkill", "-f", script_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if proc.returncode == 0:
                print(f"[CLEANUP] Da dung script mock cu: {script_name}")


def kill_listeners_on_port(port: int) -> None:
    system = platform.system()
    if system == "Windows":
        ps = (
            f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | "
            "Select-Object -ExpandProperty OwningProcess -Unique"
        )
        proc = subprocess.run(["powershell", "-NoProfile", "-Command", ps], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        for line in proc.stdout.decode("utf-8", errors="replace").splitlines():
            pid = line.strip()
            if pid.isdigit() and int(pid) > 0:
                subprocess.run(["taskkill", "/F", "/T", "/PID", pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        if shutil.which("fuser"):
            subprocess.run(["fuser", "-k", f"{port}/tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif shutil.which("lsof"):
            out = subprocess.run(["lsof", "-ti", f"tcp:{port}"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            for pid in out.stdout.decode().split():
                if pid.isdigit():
                    os.kill(int(pid), 15)


def terminate_process_tree(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        if platform.system() == "Windows":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=8,
            )
        else:
            import signal

            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def spawn_prefixed(tag: str, cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.Popen:
    creationflags = 0
    start_new_session = False
    if platform.system() == "Windows":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        start_new_session = True

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env or os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creationflags,
        start_new_session=start_new_session,
    )

    def pump() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            clean = line.rstrip("\r\n")
            if clean:
                print(f"[{tag}] {clean}")

    threading.Thread(target=pump, name=f"log-{tag}", daemon=True).start()
    return proc


INFRA_PORTS = [
    ("EMQX MQTT", 1883),
    ("EMQX WebSocket", 8083),
    ("TimescaleDB", 5432),
    ("Redis", 6379),
    ("Zenko S3", 9000),
]


def _swiftlet_containers_running() -> bool:
    try:
        proc = subprocess.run(
            ["docker", "ps", "--filter", "name=swiftlet-", "--format", "{{.Names}}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        names = [line.strip() for line in proc.stdout.decode("utf-8", errors="replace").splitlines() if line.strip()]
        return len(names) >= 4
    except Exception:
        return False


def ensure_docker_ready(skip: bool) -> bool:
    if skip:
        print("[DOCKER] Bo qua theo --no-docker.")
        return True
    if not eb.ensure_runtime_tool(
        "docker",
        "Docker Desktop",
        winget_id="Docker.DockerDesktop",
        install_hint="Cai Docker Desktop hoac chay voi --no-docker.",
        extra_windows_dirs=(r"%ProgramFiles%\Docker\Docker\resources\bin",),
    ):
        return False

    info = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if info.returncode != 0:
        if not eb.try_start_docker_desktop():
            print("[ERROR] Docker daemon chua chay. Hay mo Docker Desktop roi chay lai.")
            return False

    if all(tcp_open("127.0.0.1", port, timeout=0.35) for _, port in INFRA_PORTS) and _swiftlet_containers_running():
        print("[DOCKER] Tat ca 4 container ha tang da chay san -> bo qua docker compose.")
        return True

    print("[DOCKER] Dang bat EMQX, TimescaleDB, Redis, Zenko S3...")
    up = subprocess.run(["docker", "compose", "up", "-d"], cwd=str(ROOT_DIR / "docker"))
    if up.returncode != 0:
        print("[ERROR] docker compose up -d that bai.")
        return False

    for name, port in INFRA_PORTS:
        if not wait_until(lambda p=port: tcp_open("127.0.0.1", p, timeout=1.0), 60.0, f"{name} (:{port})"):
            return False
    print("[DOCKER] Tat ca 4 container ha tang da san sang.")
    return True


def ensure_timescale_hypertable() -> None:
    if not shutil.which("docker"):
        return
    sql = (
        "SELECT create_hypertable('sensor_telemetry', 'time', migrate_data => TRUE, if_not_exists => TRUE); "
        "CREATE INDEX IF NOT EXISTS idx_telemetry_farm_zone_time ON sensor_telemetry (farm_id, zone_id, time DESC);"
    )
    subprocess.run(
        ["docker", "exec", "swiftlet-timescaledb", "psql", "-U", "swiftlet", "-d", "swiftlet", "-c", sql],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def probe_esp32_cam_stream(host: str, timeout: float = 1.5, strict_identity: bool = False) -> str | None:
    """Kiem tra ESP32-CAM qua /status (khong giu ket noi stream), tra ve URL :81/stream neu san sang."""
    try:
        req = urllib.request.Request(f"http://{host}/status", method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
                if not isinstance(data, dict):
                    return None
                is_cam = str(data.get("deviceId") or "").startswith("ESP32_CAM") or (
                    "cameraReady" in data and "streamPort" in data
                )
                if strict_identity and not is_cam:
                    return None
                if data.get("cameraReady") is True or (not strict_identity and data.get("cameraReady", True)):
                    port = int(data.get("streamPort") or 81)
                    return f"http://{host}:{port}/stream"
    except Exception:
        pass
    return None


def scan_lan_for_esp32_cam(lan_host: str | None) -> str | None:
    """Quet nhanh subnet /24 tim ESP32-CAM qua /status khi cam nguon ngoai khong co USB hoac mDNS bi chan."""
    if not lan_host:
        return None
    try:
        ip = ipaddress.ip_address(lan_host)
    except ValueError:
        return None
    if ip.version != 4 or ip.is_loopback:
        return None

    prefix = ".".join(str(ip).split(".")[:3])
    candidates = [f"{prefix}.{i}" for i in range(1, 255) if f"{prefix}.{i}" != str(ip)]
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=64)
    try:
        futures = [
            executor.submit(probe_esp32_cam_stream, candidate, 0.35, True)
            for candidate in candidates
        ]
        for future in concurrent.futures.as_completed(futures):
            hit = future.result()
            if hit:
                return hit
    finally:
        try:
            executor.shutdown(wait=False, cancel_futures=True)
        except TypeError:
            executor.shutdown(wait=False)
    return None


def resolve_ai_source(
    cli_source: str | None,
    cam_ip: str | None,
    allow_webcam: bool,
    lan_host: str | None = None,
) -> str | None:
    if cli_source is not None:
        return cli_source

    for host in filter(None, [cam_ip, os.environ.get("CAMERA_IP"), "swiftlet-cam.local"]):
        stream_url = probe_esp32_cam_stream(host)
        if stream_url:
            return stream_url
        for url in (f"http://{host}:81/stream", f"http://{host}/stream", f"http://{host}/mjpeg/1"):
            code = http_status(url, timeout=1.5)
            if code is not None and code < 400:
                return url

    scanned = scan_lan_for_esp32_cam(lan_host)
    if scanned:
        return scanned

    if allow_webcam:
        return "0"
    return None


def _iter_mjpeg_frames(upstream, stop_event: threading.Event, keep_running):
    """Doc tung JPEG frame hoan chinh tu luong MJPEG multipart (ho tro Content-Length hoac SOI/EOI)."""
    buf = bytearray()
    content_length: int | None = None
    in_headers = True
    read_fn = getattr(upstream, "read1", upstream.read)
    while not stop_event.is_set() and keep_running():
        chunk = read_fn(8192)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > 4 * 1024 * 1024:
            buf.clear()
            content_length = None
            in_headers = True
            continue

        while True:
            if in_headers:
                sep_idx = buf.find(b"\r\n\r\n")
                sep_len = 4
                if sep_idx == -1:
                    sep_idx = buf.find(b"\n\n")
                    sep_len = 2
                if sep_idx == -1:
                    if len(buf) > 4096:
                        soi = buf.find(b"\xff\xd8")
                        if soi == -1:
                            del buf[:-2]
                        else:
                            del buf[:soi]
                            content_length = None
                            in_headers = False
                            continue
                    break
                hdr_bytes = bytes(buf[:sep_idx]).decode("latin-1", errors="ignore")
                del buf[: sep_idx + sep_len]
                if not hdr_bytes.strip():
                    continue
                match = re.search(r"content-length:\s*(\d+)", hdr_bytes, re.IGNORECASE)
                content_length = int(match.group(1)) if match else None
                in_headers = False
            else:
                if content_length is not None:
                    if len(buf) < content_length:
                        break
                    frame = bytes(buf[:content_length])
                    del buf[:content_length]
                    if frame.startswith(b"\xff\xd8"):
                        yield frame
                    content_length = None
                    in_headers = True
                else:
                    soi = buf.find(b"\xff\xd8")
                    if soi == -1:
                        del buf[:-1]
                        break
                    if soi > 0:
                        del buf[:soi]
                    eoi = buf.find(b"\xff\xd9", 2)
                    if eoi == -1:
                        break
                    frame = bytes(buf[: eoi + 2])
                    del buf[: eoi + 2]
                    yield frame
                    in_headers = True


class _MjpegBroadcaster:
    """Giu toi da 1 ket noi ESP32-CAM va chia se khung hinh cho nhieu trinh duyet/tab."""

    def __init__(self, upstream_url: str, stop_event: threading.Event) -> None:
        self.upstream_url = upstream_url
        self._stop_event = stop_event
        self._cond = threading.Condition()
        self._latest_frame: bytes | None = None
        self._frame_seq = 0
        self._clients = 0
        self._last_error: str | None = None
        self._reader_thread: threading.Thread | None = None

    def acquire_client(self) -> None:
        with self._cond:
            self._clients += 1
            self._last_error = None
            if self._reader_thread is None or not self._reader_thread.is_alive():
                self._reader_thread = threading.Thread(
                    target=self._run_reader,
                    name="mjpeg-upstream-reader",
                    daemon=True,
                )
                self._reader_thread.start()
            self._cond.notify_all()

    def release_client(self) -> None:
        with self._cond:
            self._clients = max(0, self._clients - 1)
            self._cond.notify_all()

    def wait_for_initial_frame(self, timeout: float = 4.5) -> tuple[int, bytes] | None:
        deadline = time.monotonic() + timeout
        with self._cond:
            while not self._stop_event.is_set():
                if self._latest_frame is not None:
                    return self._frame_seq, self._latest_frame
                if self._last_error is not None:
                    return None
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._cond.wait(timeout=min(remaining, 0.5))
        return None

    def wait_next_frame(self, last_seq: int, timeout: float = 3.0) -> tuple[int, bytes] | None:
        deadline = time.monotonic() + timeout
        with self._cond:
            while not self._stop_event.is_set():
                if self._frame_seq > last_seq and self._latest_frame is not None:
                    return self._frame_seq, self._latest_frame
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._cond.wait(timeout=min(remaining, 0.5))
        return None

    def status(self) -> dict[str, object]:
        with self._cond:
            return {
                "ready": self._latest_frame is not None,
                "mode": "raw-relay",
                "upstream": self.upstream_url,
                "clients": self._clients,
            }

    def _run_reader(self) -> None:
        idle_since: float | None = None
        while not self._stop_event.is_set():
            with self._cond:
                if self._clients > 0:
                    idle_since = None
                else:
                    if idle_since is None:
                        idle_since = time.monotonic()
                    elif time.monotonic() - idle_since >= 2.5:
                        self._latest_frame = None
                        self._frame_seq = 0
                        return

            try:
                with urllib.request.urlopen(self.upstream_url, timeout=5) as upstream:
                    def keep_running() -> bool:
                        with self._cond:
                            return self._clients > 0

                    for frame in _iter_mjpeg_frames(upstream, self._stop_event, keep_running):
                        with self._cond:
                            self._latest_frame = frame
                            self._frame_seq += 1
                            self._last_error = None
                            self._cond.notify_all()
            except Exception as exc:
                with self._cond:
                    if self._latest_frame is None:
                        self._last_error = str(exc)
                    self._cond.notify_all()
                if not self._stop_event.is_set():
                    time.sleep(0.6)


class _ThreadingHttpServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_raw_camera_relay(
    upstream_url: str,
    stop_event: threading.Event,
    host: str = "127.0.0.1",
    port: int = 8090,
) -> tuple[http.server.HTTPServer, int] | None:
    """
    Khi chua co ai/models/best.pt, mo HTTP proxy MJPEG chia se tai :8090/stream
    de Dashboard tu dong mo luong ESP32-CAM ma khong tranh chap socket voi ESP32-CAM.
    """
    broadcaster = _MjpegBroadcaster(upstream_url, stop_event)

    class RelayHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            path = self.path.split("?", 1)[0]
            if not path.startswith("/stream"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps(broadcaster.status()).encode("utf-8"))
                return

            broadcaster.acquire_client()
            try:
                initial = broadcaster.wait_for_initial_frame(timeout=4.5)
                if initial is None:
                    try:
                        self.send_error(502, "Upstream camera unavailable")
                    except OSError:
                        pass
                    return

                seq, frame = initial
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                while not stop_event.is_set():
                    header = (
                        f"--frame\r\n"
                        f"Content-Type: image/jpeg\r\n"
                        f"Content-Length: {len(frame)}\r\n\r\n"
                    ).encode("ascii")
                    self.wfile.write(header + frame + b"\r\n")
                    self.wfile.flush()

                    nxt = broadcaster.wait_next_frame(seq, timeout=4.0)
                    if nxt is None:
                        break
                    seq, frame = nxt
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                broadcaster.release_client()

        def log_message(self, *_args) -> None:
            pass

    try:
        server = _ThreadingHttpServer((host, port), RelayHandler)
        bound_port = int(server.server_address[1])
    except OSError as exc:
        print(f"[CAM] Khong mo duoc cong {host}:{port} ({exc}).")
        return None

    threading.Thread(target=lambda: server.serve_forever(poll_interval=0.5), name="raw-cam-relay", daemon=True).start()
    return server, bound_port


def print_check_report(net: dict[str, object]) -> None:
    print("=" * 72)
    print("SwiftletCare - Kiem tra trang thai he thong")
    print("=" * 72)
    pyserial_ok = not eb.modules_missing(("serial",))
    print(f"  Python       : {platform.python_version()} | pyserial: {'OK' if pyserial_ok else 'MISSING'}")
    print(
        f"  Tools        : java={'OK' if shutil.which('java') else 'MISSING'} | "
        f"npm={'OK' if shutil.which('npm') else 'MISSING'} | "
        f"docker={'OK' if shutil.which('docker') else 'MISSING'}"
    )
    print(f"  LAN IP       : {net['broker_host']}:{net['broker_port']}")
    print(f"  Wi-Fi SSID   : {net['wifi_ssid']}")
    print(f"  EMQX (1883)  : {'UP' if tcp_open('127.0.0.1', 1883) else 'DOWN'}")
    print(f"  TimescaleDB  : {'UP' if tcp_open('127.0.0.1', 5432) else 'DOWN'}")
    print(f"  Redis (6379) : {'UP' if tcp_open('127.0.0.1', 6379) else 'DOWN'}")
    print(f"  S3 (9000)    : {'UP' if tcp_open('127.0.0.1', 9000) else 'DOWN'}")
    print(f"  BackEnd 8080 : {'UP' if backend_is_ready() else 'DOWN'}")
    print(f"  FrontEnd 3000: {'UP' if frontend_is_ready() else 'DOWN'}")
    print(f"  Cam/AI 8090  : {'UP' if tcp_open('127.0.0.1', 8090) else 'DOWN'}")
    print(f"  AI Model     : {'OK' if (ROOT_DIR / 'ai' / 'models' / 'best.pt').exists() else 'MISSING (dung camera tho :8090)'}")
    warnings = usb_prov.detect_windows_usb_uart_issues()
    for w in warnings:
        print(f"  USB Driver   : WARN -> {w}")
    ports = usb_prov.list_candidate_ports() if pyserial_ok else []
    print(f"  USB Ports    : {', '.join(f'{p} ({d})' for p, d in ports) or 'None'}")
    print("=" * 72)


def main() -> int:
    parser = argparse.ArgumentParser(description="Khoi dong toan bo he thong SwiftletCare chi voi 1 lenh.")
    parser.add_argument("--broker-host", help="Ghi de IP LAN MQTT broker")
    parser.add_argument("--broker-port", type=int, default=1883, help="Cong MQTT (mac dinh 1883)")
    parser.add_argument("--wifi-ssid", help="Ghi de ten Wi-Fi")
    parser.add_argument("--wifi-password", help="Ghi de mat khau Wi-Fi")
    parser.add_argument("--flash", choices=["main", "cam", "all"], help="Bien dich & nap firmware qua PlatformIO truoc khi chay")
    parser.add_argument("--restart", action="store_true", help="Khoi dong lai BackEnd/FrontEnd/Camera neu cong 8080/3000/8090 dang chiem")
    parser.add_argument("--no-docker", action="store_true", help="Khong tu dong goi docker compose up -d")
    parser.add_argument("--no-ai", action="store_true", help="Khong khoi chay AI Edge")
    parser.add_argument("--ai-source", help="Chi dinh nguon video/camera cho AI Edge")
    parser.add_argument("--ai-webcam", action="store_true", help="Cho phep dung webcam (0) neu khong co ESP32-CAM")
    parser.add_argument("--skip-usb", action="store_true", help="Bo qua quet & cap nhat USB ESP32")
    parser.add_argument("--force-usb", action="store_true", help="Gui lai cau hinh NVS cho ESP32 ke ca khi da khop")
    parser.add_argument("--no-browser", action="store_true", help="Khong tu dong mo trinh duyet")
    parser.add_argument("--keep-mocks", action="store_true", help="Khong tu dong tat mock_dev_*.py dang chay")
    parser.add_argument("--no-wait", action="store_true", help="Khoi dong xong va thoat ngay (chi dung cho script/kiem tra)")
    parser.add_argument("--check", action="store_true", help="Chi kiem tra trang thai he thong, khong khoi chay")
    args = parser.parse_args()

    # 1. Tu dong nhan dien mang LAN + Wi-Fi & kiem tra moi truong thich nghi
    net = slc.resolve_local_network(
        broker_host=args.broker_host,
        broker_port=args.broker_port,
        wifi_ssid=args.wifi_ssid,
        wifi_password=args.wifi_password,
        interactive=False,
        auto_confirm=True,
    )
    if args.check:
        print_check_report(net)
        return 0

    if not args.skip_usb:
        eb.ensure_python_requirements(SCRIPTS_DIR / "requirements.txt", ("serial",), "USB Serial (pyserial)")
        eb.ensure_missing_windows_usb_drivers()

    slc.auto_sync_local_config(
        broker_host=args.broker_host,
        broker_port=args.broker_port,
        wifi_ssid=args.wifi_ssid,
        wifi_password=args.wifi_password,
        interactive=False,
        auto_confirm=True,
        check_broker_conn=False,
        quiet=False,
    )

    broker_host = str(net["broker_host"])
    broker_port = int(net["broker_port"])
    wifi_ssid = str(net["wifi_ssid"])
    wifi_password = str(net["wifi_password"])

    # 2. Docker ha tang
    if not ensure_docker_ready(args.no_docker):
        return 1

    # 3. UDP Discovery + USB Provisioning / Flash (ESP32-Main + ESP32-CAM dong thoi)
    stop_event = threading.Event()
    managed_procs: list[subprocess.Popen] = []

    try:
        if not args.keep_mocks:
            stop_conflicting_mocks()
        start_udp_discovery_server(broker_host, broker_port, stop_event)

        if args.flash:
            if not eb.ensure_platformio_installed():
                print("[ERROR] Khong cai duoc PlatformIO de nap firmware.")
                return 1
            targets = ["main", "cam"] if args.flash == "all" else [args.flash]
            for tgt in targets:
                print(f"[FLASH] Dang bien dich va nap firmware {tgt}...")
                rc = usb_prov.flash_firmware(ROOT_DIR, tgt)
                if rc != 0:
                    print(f"[FLASH] Nap {tgt} that bai (ma loi {rc}).")

        cam_ip: str | None = None
        if not args.skip_usb:
            usb_results, drv_warnings = usb_prov.provision_all_usb_devices(
                wifi_ssid=wifi_ssid,
                wifi_password=wifi_password,
                broker_host=broker_host,
                broker_port=broker_port,
                force=args.force_usb,
            )
            for w in drv_warnings:
                print(f"[USB DRIVER WARN] Thiet bi loi driver tren Windows: {w}")
            if not usb_results:
                print("[USB] Khong thay cong COM/Serial ESP32 nao dang cam (se dung UDP discovery/LAN hien co).")
            for r in usb_results:
                print(f"[USB:{r.port}] ({r.status}, role={r.role or 'unknown'}) {r.message}")
                if r.role == "esp32-cam" and r.ip:
                    cam_ip = r.ip

        # 4. BackEnd (:8080)
        be_dir = ROOT_DIR / "BackEnd"
        be_env = be_dir / ".env"
        be_env_example = be_dir / ".env.example"
        if not be_env.exists() and be_env_example.exists():
            shutil.copyfile(be_env_example, be_env)
            print("[BE] Da tao BackEnd/.env tu .env.example")

        if args.restart:
            kill_listeners_on_port(8080)
            time.sleep(1.0)

        if backend_is_ready():
            print("[BE] BackEnd da chay san tai http://localhost:8080")
        else:
            if not eb.ensure_runtime_tool(
                "java",
                "Java JDK 21",
                winget_id="EclipseAdoptium.Temurin.21.JDK",
                install_hint="Cai Java 21 JDK (Temurin / Microsoft OpenJDK).",
                extra_windows_dirs=(
                    r"%ProgramFiles%\Eclipse Adoptium\jdk-21*\bin",
                    r"%ProgramFiles%\Microsoft\jdk-21*\bin",
                    r"%ProgramFiles%\Java\jdk-21*\bin",
                ),
            ):
                return 1
            mvnw = "mvnw.cmd" if platform.system() == "Windows" else "./mvnw"
            be_cmd = [str(be_dir / mvnw) if platform.system() == "Windows" else mvnw, "spring-boot:run"]
            print("[BE] Dang khoi dong Spring Boot BackEnd...")
            be_proc = spawn_prefixed("BE", be_cmd, be_dir)
            managed_procs.append(be_proc)
            if not wait_until(backend_is_ready, 120.0, "BackEnd :8080", proc=be_proc):
                return 1
            print("[BE] BackEnd san sang tai http://localhost:8080")

        ensure_timescale_hypertable()

        # 5. FrontEnd (:3000)
        fe_dir = ROOT_DIR / "FrontEnd"
        if args.restart:
            kill_listeners_on_port(3000)
            time.sleep(1.0)

        if frontend_is_ready():
            print("[FE] FrontEnd da chay san tai http://localhost:3000")
        else:
            if not eb.ensure_runtime_tool(
                "npm",
                "Node.js LTS",
                winget_id="OpenJS.NodeJS.LTS",
                install_hint="Cai Node.js LTS tu https://nodejs.org/",
                extra_windows_dirs=(r"%ProgramFiles%\nodejs",),
            ):
                return 1
            npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
            if not (fe_dir / "node_modules").exists():
                print("[FE] Chua co node_modules -> dang chay npm install...")
                if subprocess.run([npm_cmd, "install"], cwd=str(fe_dir)).returncode != 0:
                    print("[ERROR] npm install that bai.")
                    return 1
            print("[FE] Dang khoi dong Next.js FrontEnd...")
            fe_proc = spawn_prefixed("FE", [npm_cmd, "run", "dev"], fe_dir)
            managed_procs.append(fe_proc)
            if not wait_until(frontend_is_ready, 90.0, "FrontEnd :3000", proc=fe_proc):
                return 1
            print("[FE] FrontEnd san sang tai http://localhost:3000")

        # 6. AI Edge / Live Camera Stream (:8090)
        ai_running = False
        cam_relay_server: http.server.HTTPServer | None = None
        if args.restart:
            kill_listeners_on_port(8090)
            time.sleep(0.5)

        if not args.no_ai:
            model_exists = (ROOT_DIR / "ai" / "models" / "best.pt").exists()
            ai_source = resolve_ai_source(args.ai_source, cam_ip, args.ai_webcam, lan_host=broker_host)
            if not model_exists:
                if ai_source and str(ai_source).startswith(("http://", "https://")):
                    if not tcp_open("127.0.0.1", 8090, timeout=0.5):
                        relay = start_raw_camera_relay(str(ai_source), stop_event)
                        if relay is not None:
                            cam_relay_server = relay[0]
                            ai_running = True
                            print(f"[CAM] Da kich hoat camera truc tiep tai http://127.0.0.1:8090/stream (nguon: {ai_source})")
                    else:
                        ai_running = True
                        print(f"[CAM] Cong :8090 dang chay san | Nguon ESP32-CAM: {ai_source}")
                else:
                    print("[AI] Chua co ai/models/best.pt va chua thay camera tren LAN -> Dashboard & IoT van chay day du.")
            else:
                if not ai_source:
                    print("[AI] Chua thay luong ESP32-CAM tren LAN -> bo qua AI Edge (chay --ai-webcam neu muon test bang webcam).")
                else:
                    eb.ensure_python_requirements(
                        ROOT_DIR / "ai" / "requirements.txt",
                        ("ultralytics", "cv2", "paho", "minio", "psutil", "lap"),
                        "AI Edge",
                    )
                    ai_env = os.environ.copy()
                    ai_env.setdefault("MQTT_HOST", "localhost")
                    ai_env.setdefault("MQTT_PORT", str(broker_port))
                    ai_env.setdefault("S3_ENDPOINT", "http://localhost:9000")
                    ai_env.setdefault("S3_ACCESS_KEY", "123")
                    ai_env.setdefault("S3_SECRET_KEY", "abc")
                    ai_env.setdefault("S3_BUCKET", "swiftlet-alerts")
                    if cam_ip:
                        ai_env["CAMERA_IP"] = cam_ip
                    ai_cmd = [sys.executable, "main.py", "--headless", "--web-stream", "--source", ai_source]
                    print(f"[AI] Dang khoi dong Edge AI (source={ai_source})...")
                    managed_procs.append(spawn_prefixed("AI", ai_cmd, ROOT_DIR / "ai" / "src", env=ai_env))
                    ai_running = True

        # 7. Tong ket & mo trinh duyet
        print("\n" + "=" * 72)
        print("SwiftletCare DA SAN SANG!")
        print("=" * 72)
        print("  Web Dashboard : http://localhost:3000")
        print("  BackEnd API   : http://localhost:8080")
        print("  EMQX Console  : http://localhost:18083  (admin / swiftlet123)")
        print("  Zenko S3      : http://localhost:9000")
        print(f"  LAN MQTT Host : {broker_host}:{broker_port}  (Wi-Fi: {wifi_ssid})")
        if ai_running:
            print("  Live Camera   : http://127.0.0.1:8090/stream (tu dong phat tren Dashboard)")
        print("=" * 72)

        if not args.no_browser:
            try:
                webbrowser.open("http://localhost:3000")
            except Exception:
                pass

        if args.no_wait:
            return 0

        print("[SYSTEM] He thong dang chay. Nhan Ctrl+C de tat cac dich vu vua khoi dong.")
        while True:
            time.sleep(1.0)
            for p in managed_procs:
                if p.poll() is not None and p.returncode not in (0, None):
                    print(f"[SYSTEM] Mot tien trinh con vua dung voi ma loi {p.returncode}.")
    except KeyboardInterrupt:
        print("\n[SYSTEM] Dang dung cac tien trinh...")
        return 0
    finally:
        stop_event.set()
        if not args.no_wait:
            if "cam_relay_server" in locals() and cam_relay_server is not None:
                try:
                    cam_relay_server.shutdown()
                    cam_relay_server.server_close()
                except Exception:
                    pass
            for p in managed_procs:
                terminate_process_tree(p)


if __name__ == "__main__":
    sys.exit(main())
