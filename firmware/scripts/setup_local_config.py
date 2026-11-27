#!/usr/bin/env python3
"""
setup_local_config.py - Tu dong nhan dien Wi-Fi & IP LAN cho may dang chay.

Script chay da nen tang (Windows / Linux / macOS), KHONG commit bi mat len Git:
  1. Tu dong do IP LAN that cua may (loai tru Docker/WSL/Hyper-V/VPN ao).
  2. Tu dong do ten Wi-Fi dang ket noi (SSID).
  3. Tu dong lay mat khau Wi-Fi da luu tren he dieu hanh (Windows/Linux;
     macOS chi doc Keychain khi bat --read-keychain) va KHONG bao gio in
     mat khau ra console hay ghi vao file duoc Git theo doi.
  4. Sinh / cap nhat 2 file local bi git-ignore:
       firmware/esp32-main/include/config.local.h
       firmware/esp32-cam/include/wifi_config.local.h

Ngoai viec chay thu cong, ca hai du an PlatformIO deu gan hook:
    extra_scripts = pre:../scripts/pio_auto_local_config.py
nen khi bat ky ai trong nhom chay `pio run` / `pio run -t upload` tren may cua minh,
cau hinh mang local se duoc tu dong cap nhat truoc khi bien dich.

Su dung:
    python firmware/scripts/setup_local_config.py
    python firmware/scripts/setup_local_config.py --yes
    python firmware/scripts/setup_local_config.py --check
    python firmware/scripts/setup_local_config.py --broker-host 192.168.1.50
    python firmware/scripts/setup_local_config.py --wifi-ssid "TenWiFi" --wifi-password "MatKhau"
"""
from __future__ import annotations

import argparse
import getpass
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MAIN_LOCAL = REPO_ROOT / "firmware" / "esp32-main" / "include" / "config.local.h"
CAM_LOCAL = REPO_ROOT / "firmware" / "esp32-cam" / "include" / "wifi_config.local.h"

DEFAULT_BROKER_PORT = 1883
VIRTUAL_ADAPTER_TOKENS = (
    "docker",
    "vethernet",
    "wsl",
    "hyper-v",
    "hyperv",
    "loopback",
    "virtualbox",
    "vmware",
    "vbox",
    "tailscale",
    "zerotier",
    "bluetooth",
    "npcap",
    "tap-windows",
    "microsoft hyper",
    "veth",
    "br-",
    "tun",
    "tap",
    "utun",
)


def _run(cmd: list[str] | str, timeout: int = 10) -> str:
    """Chay lenh he thong im lang va tra ve stdout."""
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            shell=isinstance(cmd, str),
            timeout=timeout,
        )
        return proc.stdout.decode("utf-8", errors="replace")
    except Exception:
        return ""


def is_virtual_interface(name: str) -> bool:
    n = name.lower()
    return any(tok in n for tok in VIRTUAL_ADAPTER_TOKENS)


def is_ci_environment() -> bool:
    if os.environ.get("SWIFTLET_SKIP_AUTO_CONFIG", "").lower() in ("1", "true", "yes"):
        return True
    return any(
        os.environ.get(var, "").lower() in ("1", "true", "yes")
        for var in ("CI", "GITHUB_ACTIONS", "GITLAB_CI", "JENKINS_URL")
    )


# ------------------------------------------------------------------------------
# Do IP LAN
# ------------------------------------------------------------------------------
def detect_default_ip() -> str | None:
    """Do IP LAN cua interface route mac dinh bang socket UDP (khong gui goi ra ngoai)."""
    for probe in (("8.8.8.8", 80), ("192.168.1.1", 80), ("10.0.0.1", 80)):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.settimeout(1.0)
            sock.connect(probe)
            ip = sock.getsockname()[0]
            if ip and not ip.startswith(("127.", "169.254.")):
                return ip
        except Exception:
            pass
        finally:
            sock.close()
    return None


def list_candidate_ips() -> list[tuple[str, str]]:
    """Liet ke cac IPv4 vat ly (khong loopback, khong link-local, khong adapter ao)."""
    system = platform.system()
    candidates: list[tuple[str, str]] = []

    if system == "Windows":
        out = _run([
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-NetIPAddress -AddressFamily IPv4 | "
            "Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | "
            "ForEach-Object { \"$($_.IPAddress)|$($_.InterfaceAlias)\" }",
        ])
        for line in out.splitlines():
            line = line.strip()
            if "|" in line:
                ip, alias = (part.strip() for part in line.split("|", 1))
                if re.match(r"^\d+\.\d+\.\d+\.\d+$", ip) and not is_virtual_interface(alias):
                    candidates.append((ip, alias))
    elif system == "Linux":
        out = _run(["ip", "-4", "-o", "addr", "show"])
        for line in out.splitlines():
            m = re.search(r"\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)", line)
            if m:
                iface, ip = m.group(1), m.group(2)
                if not ip.startswith(("127.", "169.254.")) and not is_virtual_interface(iface):
                    candidates.append((ip, iface))
    elif system == "Darwin":
        out = _run(["ifconfig"])
        current = ""
        for line in out.splitlines():
            if not line.startswith((" ", "\t")) and ":" in line:
                current = line.split(":", 1)[0].strip()
            m = re.search(r"\binet\s+(\d+\.\d+\.\d+\.\d+)", line)
            if m and current and not is_virtual_interface(current):
                ip = m.group(1)
                if not ip.startswith(("127.", "169.254.")):
                    candidates.append((ip, current))

    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for ip, alias in candidates:
        if ip not in seen:
            seen.add(ip)
            unique.append((ip, alias))
    return unique


def resolve_lan_ip(candidates: list[tuple[str, str]], default_ip: str | None) -> str | None:
    candidate_map = {ip: alias for ip, alias in candidates}
    if default_ip and (not candidates or default_ip in candidate_map):
        return default_ip
    for ip, alias in candidates:
        if any(tok in alias.lower() for tok in ("wi-fi", "wifi", "wlan", "wireless", "en0")):
            return ip
    if candidates:
        return candidates[0][0]
    return default_ip


# ------------------------------------------------------------------------------
# Do Wi-Fi SSID + Password local
# ------------------------------------------------------------------------------
def _darwin_wifi_device() -> str:
    out = _run(["networksetup", "-listallhardwareports"])
    lines = out.splitlines()
    for idx, line in enumerate(lines):
        if "Wi-Fi" in line or "AirPort" in line:
            for sub in lines[idx + 1 : idx + 4]:
                m = re.search(r"Device:\s*(\S+)", sub)
                if m:
                    return m.group(1).strip()
    return "en0"


def detect_wifi_ssid() -> str | None:
    """Do ten Wi-Fi dang ket noi tren Windows / Linux / macOS."""
    system = platform.system()

    if system == "Windows":
        out = _run(["netsh", "wlan", "show", "interfaces"])
        connected = None
        ssid_found = None
        for line in out.splitlines():
            state_match = re.match(r"^\s*State\s*:\s*(.+?)\s*$", line, re.IGNORECASE)
            if state_match:
                connected = state_match.group(1).strip().lower()
            m = re.match(r"^\s*SSID\s*:\s*(.+?)\s*$", line)
            if m:
                ssid = m.group(1).strip()
                if ssid:
                    ssid_found = ssid
                    break
        if ssid_found and (connected is None or "disconnect" not in connected):
            return ssid_found
    elif system == "Linux":
        out = _run(["nmcli", "-t", "-f", "ACTIVE,SSID", "device", "wifi"])
        for line in out.splitlines():
            # nmcli -t escapes ':' with '\:'
            m = re.match(r"^(yes|no):(.*)$", line.strip())
            if m and m.group(1) == "yes":
                ssid = m.group(2).replace("\\:", ":").strip()
                if ssid and ssid != "--":
                    return ssid
        iw_out = _run(["iwgetid", "-r"]).strip()
        if iw_out:
            return iw_out
    elif system == "Darwin":
        dev = _darwin_wifi_device()
        out = _run(["networksetup", "-getairportnetwork", dev])
        m = re.search(r"Current Wi-Fi Network:\s*(.+)", out)
        if m:
            ssid = m.group(1).strip()
            if ssid and "not associated" not in ssid.lower():
                return ssid
        summary = _run(["ipconfig", "getsummary", dev])
        m2 = re.search(r"^\s*SSID\s*:\s*(.+)$", summary, re.MULTILINE)
        if m2:
            ssid = m2.group(1).strip()
            if ssid and ssid != "<redacted>":
                return ssid

    return None


def detect_wifi_password(ssid: str | None, allow_keychain: bool = False) -> str | None:
    """
    Co gang lay mat khau Wi-Fi da luu tren may (local only).
    Tra ve None neu he dieu hanh khong cho doc hoac khong tim thay.
    Tra ve "" neu mang Open khong mat khau.
    """
    if not ssid:
        return None

    system = platform.system()

    if system == "Windows":
        out = _run(["netsh", "wlan", "show", "profile", f"name={ssid}", "key=clear"])
        auth_value = ""
        for line in out.splitlines():
            auth_m = re.match(r"^\s*Authentication\s*:\s*(.+?)\s*$", line)
            if auth_m:
                auth_value = auth_m.group(1).strip().lower()
            key_m = re.match(r"^\s*Key Content\s*:\s*(.*)$", line)
            if key_m:
                return key_m.group(1).rstrip("\r\n").strip()
        if auth_value == "open":
            return ""
    elif system == "Linux":
        psk = _run(["nmcli", "-s", "-g", "802-11-wireless-security.psk", "connection", "show", ssid]).strip()
        if psk:
            return psk
        active = _run(["nmcli", "-t", "-f", "UUID,TYPE", "connection", "show", "--active"])
        for line in active.splitlines():
            parts = line.strip().split(":")
            if len(parts) >= 2 and "wireless" in parts[1]:
                uuid = parts[0]
                psk2 = _run(["nmcli", "-s", "-g", "802-11-wireless-security.psk", "connection", "show", "uuid", uuid]).strip()
                if psk2:
                    return psk2
                key_mgmt = _run(["nmcli", "-g", "802-11-wireless-security.key-mgmt", "connection", "show", "uuid", uuid]).strip()
                if key_mgmt in ("none", ""):
                    return ""
    elif system == "Darwin" and allow_keychain:
        pw = _run([
            "security", "find-generic-password",
            "-D", "AirPort network password",
            "-a", ssid,
            "-w",
        ]).rstrip("\r\n")
        if pw:
            return pw

    return None


# ------------------------------------------------------------------------------
# Kiem tra broker & doc/ghi header C
# ------------------------------------------------------------------------------
def check_broker(host: str, port: int = DEFAULT_BROKER_PORT, timeout: float = 2.0) -> tuple[bool, str]:
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True, f"OK - ket noi duoc {host}:{port}"
    except Exception as exc:
        return False, f"Chua ket noi duoc {host}:{port} ({exc.__class__.__name__})"


def docker_running() -> bool:
    if not shutil.which("docker"):
        return False
    out = _run(["docker", "ps", "--filter", "name=swiftlet-emqx", "--format", "{{.Names}}"])
    return "swiftlet-emqx" in out


def escape_c(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def unescape_c(value: str) -> str:
    return value.replace('\\"', '"').replace("\\\\", "\\")


def read_existing_define(path: Path, macro_name: str) -> str | None:
    """Doc gia tri string #define MACRO "..." hien co trong file .local.h."""
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    pattern = re.compile(rf'^\s*#define\s+{re.escape(macro_name)}\s+"((?:[^"\\]|\\.)*)"', re.MULTILINE)
    m = pattern.search(text)
    return unescape_c(m.group(1)) if m else None


MAIN_TEMPLATE = """#pragma once

// ==============================================================================
// SwiftletCare - Config LOCAL cho may nay (KHONG commit len Git).
// ------------------------------------------------------------------------------
// File nay duoc tu dong sinh/cap nhat boi:
//   - firmware/scripts/setup_local_config.py
//   - PlatformIO pre-build hook (firmware/scripts/pio_auto_local_config.py)
// Da nam trong .gitignore nen KHONG bi day len GitHub.
// ==============================================================================

#ifndef WIFI_SSID
#define WIFI_SSID "{wifi_ssid}"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "{wifi_password}"
#endif

#ifndef MQTT_HOST
#define MQTT_HOST "{broker_host}"
#endif

#ifndef MQTT_PORT
#define MQTT_PORT {broker_port}
#endif
"""

CAM_TEMPLATE = """#pragma once

// ==============================================================================
// SwiftletCare - Config Wi-Fi LOCAL cho ESP32-CAM (KHONG commit len Git).
// ------------------------------------------------------------------------------
// File nay duoc tu dong sinh/cap nhat boi:
//   - firmware/scripts/setup_local_config.py
//   - PlatformIO pre-build hook (firmware/scripts/pio_auto_local_config.py)
// ==============================================================================

#ifndef WIFI_SSID
#define WIFI_SSID "{wifi_ssid}"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "{wifi_password}"
#endif
"""


def write_if_changed(path: Path, content: str) -> bool:
    """Chi ghi file khi noi dung thay doi de tranh PlatformIO rebuild khong can thiet."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            if path.read_text(encoding="utf-8") == content:
                return False
        except OSError:
            pass
    path.write_text(content, encoding="utf-8")
    return True


def resolve_local_network(
    *,
    broker_host: str | None = None,
    broker_port: int = DEFAULT_BROKER_PORT,
    wifi_ssid: str | None = None,
    wifi_password: str | None = None,
    interactive: bool = False,
    auto_confirm: bool = False,
    allow_keychain: bool = False,
) -> dict[str, object]:
    """Tu dong phat hien LAN IP, Wi-Fi SSID va mat khau local (khong ghi file)."""
    candidates = list_candidate_ips()
    default_ip = detect_default_ip()

    if not broker_host:
        detected_ip = resolve_lan_ip(candidates, default_ip)
        if detected_ip:
            broker_host = detected_ip
        else:
            existing_host = read_existing_define(MAIN_LOCAL, "MQTT_HOST")
            if existing_host:
                broker_host = existing_host
            elif interactive and not auto_confirm and sys.stdin.isatty():
                broker_host = input("    Nhap IP LAN may chay Docker/EMQX: ").strip()
            if not broker_host:
                broker_host = "localhost"

    if wifi_ssid is None:
        detected_ssid = detect_wifi_ssid()
        if detected_ssid:
            wifi_ssid = detected_ssid
        else:
            existing_ssid = read_existing_define(MAIN_LOCAL, "WIFI_SSID") or read_existing_define(CAM_LOCAL, "WIFI_SSID")
            if existing_ssid:
                wifi_ssid = existing_ssid
            elif interactive and not auto_confirm and sys.stdin.isatty():
                wifi_ssid = input("    Nhap ten Wi-Fi (Enter = Wokwi-GUEST): ").strip() or "Wokwi-GUEST"
            else:
                wifi_ssid = "Wokwi-GUEST"

    if wifi_password is None:
        if wifi_ssid == "Wokwi-GUEST":
            wifi_password = ""
            pw_source = "Wokwi open guest"
        else:
            os_pw = detect_wifi_password(wifi_ssid, allow_keychain=allow_keychain)
            if os_pw is not None:
                wifi_password = os_pw
                pw_source = "tu dong lay tu he thong"
            else:
                existing_ssid = read_existing_define(MAIN_LOCAL, "WIFI_SSID") or read_existing_define(CAM_LOCAL, "WIFI_SSID")
                existing_pw = read_existing_define(MAIN_LOCAL, "WIFI_PASSWORD") or read_existing_define(CAM_LOCAL, "WIFI_PASSWORD")
                if existing_ssid == wifi_ssid and existing_pw:
                    wifi_password = existing_pw
                    pw_source = "giu nguyen tu file local"
                elif interactive and not auto_confirm and sys.stdin.isatty():
                    try:
                        wifi_password = getpass.getpass(f"    Nhap mat khau Wi-Fi '{wifi_ssid}' (Enter = de trong): ")
                    except Exception:
                        wifi_password = ""
                    pw_source = "nhap tay"
                else:
                    wifi_password = ""
                    pw_source = "khong lay duoc tu dong (de trong)"
    else:
        pw_source = "Wokwi open guest" if wifi_ssid == "Wokwi-GUEST" else "truyen qua --wifi-password"

    return {
        "broker_host": broker_host,
        "broker_port": broker_port,
        "wifi_ssid": wifi_ssid,
        "wifi_password": wifi_password,
        "pw_source": pw_source,
        "candidates": candidates,
        "default_ip": default_ip,
    }


def auto_sync_local_config(
    *,
    broker_host: str | None = None,
    broker_port: int = DEFAULT_BROKER_PORT,
    wifi_ssid: str | None = None,
    wifi_password: str | None = None,
    interactive: bool = False,
    auto_confirm: bool = False,
    allow_keychain: bool = False,
    check_broker_conn: bool = True,
    quiet: bool = False,
) -> int:
    def log(msg: str = "") -> None:
        if not quiet:
            print(msg)

    resolved = resolve_local_network(
        broker_host=broker_host,
        broker_port=broker_port,
        wifi_ssid=wifi_ssid,
        wifi_password=wifi_password,
        interactive=interactive,
        auto_confirm=auto_confirm,
        allow_keychain=allow_keychain,
    )
    candidates = resolved["candidates"]
    default_ip = resolved["default_ip"]
    broker_host = str(resolved["broker_host"])
    broker_port = int(resolved["broker_port"])
    wifi_ssid = str(resolved["wifi_ssid"])
    wifi_password = str(resolved["wifi_password"])
    pw_source = str(resolved["pw_source"])

    if candidates and not quiet and interactive and not auto_confirm:
        log("\n[1] Cac IP LAN cua may nay:")
        for idx, (ip, alias) in enumerate(candidates, 1):
            tag = "  <-- route mac dinh" if ip == default_ip else ""
            log(f"    [{idx}] {ip:<16} {alias}{tag}")

    log("=" * 70)
    log("SwiftletCare - Tu dong cau hinh mang local (LAN + Wi-Fi)")
    log("=" * 70)
    log(f"  LAN / Broker : {broker_host}:{broker_port}")
    log(f"  Wi-Fi SSID   : {wifi_ssid}")
    masked = ("*" * min(len(wifi_password), 8)) if wifi_password else "(rong)"
    log(f"  Wi-Fi Key    : {masked} [{pw_source}]")

    if interactive and not auto_confirm and sys.stdin.isatty():
        ans = input("\nGhi file cau hinh local? [Y/n]: ").strip().lower()
        if ans in ("n", "no"):
            log("Da huy.")
            return 0

    main_content = MAIN_TEMPLATE.format(
        wifi_ssid=escape_c(wifi_ssid),
        wifi_password=escape_c(wifi_password),
        broker_host=escape_c(broker_host),
        broker_port=broker_port,
    )
    cam_content = CAM_TEMPLATE.format(
        wifi_ssid=escape_c(wifi_ssid),
        wifi_password=escape_c(wifi_password),
    )

    main_changed = write_if_changed(MAIN_LOCAL, main_content)
    cam_changed = write_if_changed(CAM_LOCAL, cam_content)

    for target, changed in ((MAIN_LOCAL, main_changed), (CAM_LOCAL, cam_changed)):
        status = "cap nhat" if changed else "giu nguyen (khong doi)"
        log(f"  [OK] {target.relative_to(REPO_ROOT)} ({status})")

    if check_broker_conn and broker_host:
        ok, msg = check_broker(broker_host, broker_port)
        log(f"  [MQTT] {msg}")
        if not ok and not quiet:
            if not docker_running():
                log("         -> Docker EMQX chua chay. Chay: cd docker && docker compose up -d")
            else:
                log("         -> Kiem tra firewall Windows/Linux cho cong TCP 1883.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tu dong nhan dien Wi-Fi & IP LAN cho ESP32/ESP32-CAM (git-ignored)."
    )
    parser.add_argument("--broker-host", help="IP LAN may chay Docker/EMQX (bo trong = tu dong do)")
    parser.add_argument("--broker-port", type=int, default=DEFAULT_BROKER_PORT, help="Cong MQTT (mac dinh 1883)")
    parser.add_argument("--wifi-ssid", help="Ten Wi-Fi (bo trong = tu dong do)")
    parser.add_argument("--wifi-password", help="Mat khau Wi-Fi (bo trong = tu dong doc tu OS)")
    parser.add_argument("--read-keychain", action="store_true", help="Cho phep doc macOS Keychain")
    parser.add_argument("--yes", action="store_true", help="Tu dong xac nhan, khong hoi lai")
    parser.add_argument("--quiet", action="store_true", help="Chi in loi")
    parser.add_argument("--no-check", action="store_true", help="Bo qua kiem tra ket noi MQTT broker")
    parser.add_argument("--skip-if-ci", action="store_true", help="Bo qua neu dang chay trong CI")
    parser.add_argument("--check", action="store_true", help="Chi kiem tra thong tin mang hien tai, khong ghi file")
    args = parser.parse_args()

    if args.skip_if_ci and is_ci_environment():
        return 0

    if args.check:
        candidates = list_candidate_ips()
        default_ip = detect_default_ip()
        resolved_ip = resolve_lan_ip(candidates, default_ip)
        ssid = detect_wifi_ssid()
        pw = detect_wifi_password(ssid, allow_keychain=args.read_keychain) if ssid else None
        print(f"OS           : {platform.system()} ({platform.release()})")
        print(f"Default IP   : {default_ip or 'N/A'}")
        print(f"Resolved LAN : {resolved_ip or 'N/A'}")
        print(f"Candidates   : {', '.join(f'{ip} ({alias})' for ip, alias in candidates) or 'None'}")
        print(f"Wi-Fi SSID   : {ssid or 'N/A'}")
        print(f"Wi-Fi Key    : {'found (' + str(len(pw)) + ' chars)' if pw else ('open' if pw == '' else 'not found')}")
        if resolved_ip:
            ok, msg = check_broker(resolved_ip, args.broker_port)
            print(f"MQTT Broker  : {msg}")
        return 0

    return auto_sync_local_config(
        broker_host=args.broker_host,
        broker_port=args.broker_port,
        wifi_ssid=args.wifi_ssid,
        wifi_password=args.wifi_password,
        interactive=sys.stdin.isatty() and not args.quiet,
        auto_confirm=args.yes,
        allow_keychain=args.read_keychain,
        check_broker_conn=not args.no_check,
        quiet=args.quiet,
    )


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nDa huy.")
        sys.exit(130)
