#!/usr/bin/env python3
"""
usb_provisioner.py - Tu dong nhan dien ESP32-Main / ESP32-CAM qua cong USB Serial
va cap nhat cau hinh Wi-Fi + IP LAN MQTT Broker vao bo nho NVS (khong can compile/flash lai).

Cung ho tro tuy chon --flash de nap firmware khi bo mach chua cai firmware moi.
"""
from __future__ import annotations

import json
import platform
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

CFG_PREFIX = "__SWIFTLET_CFG__:"
INFO_PREFIX = "__SWIFTLET_INFO__:"
OK_PREFIX = "__SWIFTLET_OK__:"


@dataclass
class UsbDeviceResult:
    port: str
    description: str
    status: str  # "provisioned", "already_synced", "brownout", "unrecognized", "driver_error", "error"
    role: str | None = None
    ip: str | None = None
    message: str = ""
    raw_info: dict = field(default_factory=dict)


def detect_windows_usb_uart_issues() -> list[str]:
    """Kiem tra thiet bi USB-UART bi thieu driver (Error 28, v.v.) tren Windows."""
    if platform.system() != "Windows":
        return []
    cmd = [
        "powershell",
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_PnPEntity | Where-Object { "
        "$_.ConfigManagerErrorCode -ne 0 -and ($_.Name -match 'CP210|CH340|FT232|UART|Serial|ESP32' -or "
        "$_.DeviceID -match 'VID_10C4|VID_1A86|VID_0403|VID_303A') } | "
        "ForEach-Object { \"$($_.Name)|ErrorCode=$($_.ConfigManagerErrorCode)|$($_.DeviceID)\" }",
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8)
        out = proc.stdout.decode("utf-8", errors="replace")
        return [line.strip() for line in out.splitlines() if line.strip()]
    except Exception:
        return []


def list_candidate_ports() -> list[tuple[str, str]]:
    """Tra ve danh sach (device_port, description) loai tru cong Bluetooth ao."""
    try:
        import serial.tools.list_ports as lp
    except ImportError:
        return []

    results: list[tuple[str, str]] = []
    for p in lp.comports():
        hwid = (p.hwid or "").upper()
        desc = p.description or p.device
        if "BTHENUM" in hwid or "BLUETOOTH" in desc.upper():
            continue
        results.append((p.device, desc))
    return sorted(results, key=lambda item: item[0])


def build_identify_command() -> str:
    return CFG_PREFIX + json.dumps({"cmd": "IDENTIFY"}, separators=(",", ":")) + "\n"


def build_config_command(
    *,
    role: str | None,
    wifi_ssid: str,
    wifi_password: str,
    broker_host: str,
    broker_port: int = 1883,
    force_reconnect: bool = False,
) -> str:
    payload: dict[str, object] = {
        "wifiSsid": wifi_ssid,
        "wifiPassword": wifi_password,
        "save": True,
        "reconnect": force_reconnect,
    }
    if role != "esp32-cam":
        payload["mqttHost"] = broker_host
        payload["mqttPort"] = broker_port
    return CFG_PREFIX + json.dumps(payload, separators=(",", ":")) + "\n"


def _parse_prefixed_json(line: str, prefix: str) -> dict | None:
    if prefix not in line:
        return None
    raw = line.split(prefix, 1)[1].strip()
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def _extract_ip_from_log(line: str) -> str | None:
    for pat in (r"\[NET\]\s+READY\s+IP=(\d+\.\d+\.\d+\.\d+)", r"\[WiFi\]\s+(?:GOT|LAN)\s+IP:\s*(\d+\.\d+\.\d+\.\d+)"):
        m = re.search(pat, line)
        if m:
            return m.group(1)
    return None


def probe_and_provision_port(
    port: str,
    description: str,
    *,
    wifi_ssid: str,
    wifi_password: str,
    broker_host: str,
    broker_port: int = 1883,
    force: bool = False,
    wait_ip_seconds: float = 5.0,
) -> UsbDeviceResult:
    try:
        import serial
    except ImportError:
        return UsbDeviceResult(
            port=port,
            description=description,
            status="error",
            message="Thieu thu vien pyserial (chay: pip install pyserial)",
        )

    ser = serial.Serial()
    ser.port = port
    ser.baudrate = 115200
    ser.timeout = 0.25
    ser.write_timeout = 1.0
    ser.dtr = False
    ser.rts = False

    try:
        ser.open()
    except Exception as exc:
        return UsbDeviceResult(
            port=port,
            description=description,
            status="error",
            message=f"Khong mo duoc cong ({exc})",
        )

    try:
        ser.reset_input_buffer()
        info: dict | None = None
        brownout_hits = 0
        discovered_ip: str | None = None

        # Gui IDENTIFY toi da 2 lan (tranh truong hop bo dang boot lai khi mo cong USB)
        for attempt in range(2):
            ser.write(build_identify_command().encode("utf-8"))
            ser.flush()
            deadline = time.monotonic() + (1.6 if attempt == 0 else 2.2)
            while time.monotonic() < deadline:
                raw_line = ser.readline()
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8", errors="replace").strip()
                if "POWERON_RESET" in line or "rst:0x1" in line:
                    brownout_hits += 1
                    if brownout_hits >= 2:
                        return UsbDeviceResult(
                            port=port,
                            description=description,
                            status="brownout",
                            message="Bo mach reset nguon lien tuc (POWERON_RESET) — kiem tra cap USB / nguon 5V.",
                        )
                ip_hit = _extract_ip_from_log(line)
                if ip_hit:
                    discovered_ip = ip_hit
                parsed = _parse_prefixed_json(line, INFO_PREFIX)
                if parsed:
                    info = parsed
                    break
            if info is not None:
                break

        if info is None:
            return UsbDeviceResult(
                port=port,
                description=description,
                status="unrecognized",
                message="Chua phan hoi giao thuc SwiftletCare (co the la firmware cu hoac thiet bi khac).",
            )

        role = str(info.get("role") or "")
        cur_ssid = str(info.get("wifiSsid") or "")
        cur_host = str(info.get("mqttHost") or "")
        cur_port = int(info.get("mqttPort") or broker_port)
        wifi_ok = bool(info.get("wifiConnected"))
        cur_ip = str(info.get("ip") or "") or discovered_ip

        needs_update = force or (cur_ssid != wifi_ssid) or not wifi_ok
        if role == "esp32-main":
            needs_update = needs_update or (cur_host != broker_host) or (cur_port != broker_port) or not bool(info.get("mqttConnected"))

        if not needs_update:
            return UsbDeviceResult(
                port=port,
                description=description,
                status="already_synced",
                role=role,
                ip=cur_ip,
                message=f"Da khop Wi-Fi '{cur_ssid}'" + (f" & Broker {cur_host}:{cur_port}" if role == "esp32-main" else ""),
                raw_info=info,
            )

        cfg_cmd = build_config_command(
            role=role,
            wifi_ssid=wifi_ssid,
            wifi_password=wifi_password,
            broker_host=broker_host,
            broker_port=broker_port,
            force_reconnect=True,
        )
        ser.write(cfg_cmd.encode("utf-8"))
        ser.flush()

        ack_ok = False
        end_wait = time.monotonic() + wait_ip_seconds
        while time.monotonic() < end_wait:
            raw_line = ser.readline()
            if not raw_line:
                continue
            line = raw_line.decode("utf-8", errors="replace").strip()
            if _parse_prefixed_json(line, OK_PREFIX) is not None:
                ack_ok = True
            ip_hit = _extract_ip_from_log(line)
            if ip_hit:
                cur_ip = ip_hit
                break

        msg = f"Da cap nhat Wi-Fi '{wifi_ssid}'"
        if role == "esp32-main":
            msg += f" & Broker {broker_host}:{broker_port}"
        if cur_ip:
            msg += f" (IP: {cur_ip})"
        if not ack_ok:
            msg += " [cho XN]"

        return UsbDeviceResult(
            port=port,
            description=description,
            status="provisioned",
            role=role,
            ip=cur_ip,
            message=msg,
            raw_info=info,
        )
    finally:
        try:
            ser.close()
        except Exception:
            pass


def provision_all_usb_devices(
    *,
    wifi_ssid: str,
    wifi_password: str,
    broker_host: str,
    broker_port: int = 1883,
    force: bool = False,
) -> tuple[list[UsbDeviceResult], list[str]]:
    driver_warnings = detect_windows_usb_uart_issues()
    ports = list_candidate_ports()
    results: list[UsbDeviceResult] = []
    for port, desc in ports:
        results.append(
            probe_and_provision_port(
                port,
                desc,
                wifi_ssid=wifi_ssid,
                wifi_password=wifi_password,
                broker_host=broker_host,
                broker_port=broker_port,
                force=force,
            )
        )
    return results, driver_warnings


def flash_firmware(repo_root: Path, target: str, port: str | None = None) -> int:
    fw_dir = repo_root / "firmware" / ("esp32-main" if target == "main" else "esp32-cam")
    cmd = [sys.executable, "-m", "platformio", "run", "-t", "upload"]
    if port:
        cmd.extend(["--upload-port", port])
    proc = subprocess.run(cmd, cwd=str(fw_dir))
    return proc.returncode


if __name__ == "__main__":
    import argparse

    repo = Path(__file__).resolve().parent.parent.parent
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import setup_local_config as slc

    parser = argparse.ArgumentParser(description="Nhan dien & nap cau hinh Wi-Fi/Broker cho ESP32 qua USB Serial.")
    parser.add_argument("--force", action="store_true", help="Gui lai cau hinh ke ca khi da khop")
    parser.add_argument("--flash", choices=["main", "cam"], help="Nap firmware PlatformIO cho target duoc chon")
    parser.add_argument("--port", help="Chi dinh cong COM/tty cho --flash")
    args = parser.parse_args()

    if args.flash:
        sys.exit(flash_firmware(repo, args.flash, args.port))

    net = slc.resolve_local_network(interactive=False, auto_confirm=True)
    res_list, warnings = provision_all_usb_devices(
        wifi_ssid=str(net["wifi_ssid"]),
        wifi_password=str(net["wifi_password"]),
        broker_host=str(net["broker_host"]),
        broker_port=int(net["broker_port"]),
        force=args.force,
    )
    for w in warnings:
        print(f"[USB DRIVER WARN] {w}")
    if not res_list:
        print("[USB] Khong phat hien cong COM/Serial nao dang cam.")
    for r in res_list:
        print(f"[USB:{r.port}] ({r.status}, role={r.role or 'unknown'}) {r.message}")
