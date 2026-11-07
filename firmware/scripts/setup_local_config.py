#!/usr/bin/env python3
"""
setup_local_config.py - Sinh file config LOCAL cho may dang chay (KHONG commit len git).

Moi nguoi trong nhom test tren mot may khac nhau, moi may co:
  - IP LAN khac nhau (may chay docker-compose)
  - Ten + mat khau Wi-Fi khac nhau (ESP32 can cung mang LAN voi may do)

Vi vay KHONG hardcode IP / mat khau trong git. Script nay:
  1. Tu dong do IP LAN cua may (dung cho ESP32 ket noi toi broker)
  2. Tu dong do ten Wi-Fi dang ket noi
  3. Sinh 2 file local bi git-ignore:
       firmware/esp32-main/include/mqtt_config.local.h   (broker + wifi)
       firmware/esp32-cam/include/wifi_config.local.h    (wifi)

Dung:
    python firmware/scripts/setup_local_config.py
    python firmware/scripts/setup_local_config.py --broker-host 192.168.1.50
    python firmware/scripts/setup_local_config.py --wifi-ssid "TenWiFi" --wifi-password "MatKhau"

Sau do nap firmware:
    cd firmware/esp32-main && pio run -t upload
    cd firmware/esp32-cam  && pio run -t upload
"""

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

# Thu muc cha cua thu muc "firmware"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MAIN_LOCAL = REPO_ROOT / "firmware" / "esp32-main" / "include" / "mqtt_config.local.h"
CAM_LOCAL = REPO_ROOT / "firmware" / "esp32-cam" / "include" / "wifi_config.local.h"

BROKER_PORT = 1883


# ------------------------------------------------------------------------------
# Tien ich chay lenh
# ------------------------------------------------------------------------------
def run(cmd):
    """Chay lenh va tra ve stdout, khong lo loi."""
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            shell=isinstance(cmd, str),
            timeout=15,
        )
        return proc.stdout.decode("utf-8", errors="replace")
    except Exception:
        return ""


def is_virtual_interface(name):
    """Cac adapter ao (Docker/WSL/VirtualBox/VMware/Hyper-V) - khong phai IP LAN that."""
    n = name.lower()
    virtual = (
        "docker", "vethernet", "wsl", "hyper-v", "hyperv", "loopback",
        "virtualbox", "vmware", "vbox", "tailscale", "zerotier",
        "bluetooth", "npcap", "tap-windows", "microsoft hyper",
    )
    return any(v in n for v in virtual)


# ------------------------------------------------------------------------------
# Do IP
# ------------------------------------------------------------------------------
def detect_default_ip():
    """
    Do IP LAN chinh cua may theo route mac dinh.

    Cach nay dung socket UDP de 'connect' - KHONG gui goi tin nao ra ngoai,
    chi de he dieu phan biet route mac dinh thi dung interface nao.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(1.0)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    finally:
        sock.close()
    return None


def list_candidate_ips():
    """Liet ke moi IP IPv4 khong phai loopback/link-local/ao, kem ten interface."""
    system = platform.system()
    candidates = []

    if system == "Windows":
        out = run([
            "powershell", "-NoProfile", "-Command",
            "Get-NetIPAddress -AddressFamily IPv4 | "
            "Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | "
            "ForEach-Object { \"$($_.IPAddress)|$($_.InterfaceAlias)\" }",
        ])
        for line in out.splitlines():
            line = line.strip()
            if "|" in line:
                ip, alias = line.split("|", 1)
                ip, alias = ip.strip(), alias.strip()
                if re.match(r"^\d+\.\d+\.\d+\.\d+$", ip) and not is_virtual_interface(alias):
                    candidates.append((ip, alias))
    elif system == "Linux":
        out = run(["ip", "-4", "-o", "addr", "show"])
        for line in out.splitlines():
            m = re.search(r"inet (\d+\.\d+\.\d+\.\d+).*?(\S+)\s*$", line)
            if m:
                ip, iface = m.group(1), m.group(2)
                if not is_virtual_interface(iface):
                    candidates.append((ip, iface))
    elif system == "Darwin":
        out = run(["ifconfig"])
        current = ""
        for line in out.splitlines():
            if not line.startswith(" ") and ":" in line:
                current = line.split(":")[0].strip()
            m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)", line)
            if m and not is_virtual_interface(current):
                candidates.append((m.group(1), current))

    # Loai trung, giu thu tu
    seen, result = set(), []
    for ip, alias in candidates:
        if ip not in seen:
            seen.add(ip)
            result.append((ip, alias))
    return result


def detect_wifi_ssid():
    """Do ten Wi-Fi dang ket noi (neu khong do duoc thi tra ve None)."""
    system = platform.system()

    if system == "Windows":
        out = run(["netsh", "wlan", "show", "interfaces"])
        # Output co ca dong "SSID" va "BSSID" - lay dong SSID dau tien.
        for line in out.splitlines():
            m = re.match(r"\s*SSID\s*:\s*(.+?)\s*$", line)
            if m:
                ssid = m.group(1).strip()
                if ssid:
                    return ssid
    elif system == "Linux":
        out = run(["nmcli", "-t", "-f", "ACTIVE,SSID", "device", "wifi"])
        for line in out.splitlines():
            parts = line.split(":")
            if len(parts) >= 2 and parts[0].strip() == "yes":
                ssid = parts[1].strip()
                if ssid:
                    return ssid
    elif system == "Darwin":
        out = run(["networksetup", "-getairportnetwork", "en0"])
        m = re.search(r"Current Wi-Fi Network:\s*(.+)", out)
        if m:
            return m.group(1).strip()

    return None


# ------------------------------------------------------------------------------
# Kiem tra broker
# ------------------------------------------------------------------------------
def check_broker(host, port=BROKER_PORT, timeout=2.0):
    """Tra ve (reachable, message)."""
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True, f"OK - ket noi duoc {host}:{port}"
    except Exception as exc:
        return False, f"KHONG ket noi duoc {host}:{port} ({exc.__class__.__name__})"


def docker_running():
    if not shutil.which("docker"):
        return False
    out = run(["docker", "ps", "--filter", "name=swiftlet-emqx", "--format", "{{.Names}}"])
    return "swiftlet-emqx" in out


# ------------------------------------------------------------------------------
# Ghi file
# ------------------------------------------------------------------------------
MAIN_TEMPLATE = """#pragma once

// ==============================================================================
// SwiftletCare - Config LOCAL cho may nay (KHONG commit).
// ------------------------------------------------------------------------------
// File nay duoc sinh boi: firmware/scripts/setup_local_config.py
// Da nam trong .gitignore nen KHONG bi commit len GitHub.
//
// DO LA: moi nguoi test tren may khac deu can gia tri rieng cho may do.
// Chay lai script de cap nhat khi doi may hoac doi mang (DHCP doi IP):
//     python firmware/scripts/setup_local_config.py
// ==============================================================================

// ---- Broker MQTT ----
// IP LAN cua may nay - may chay docker-compose.
// Script setup tu dong nhan IP nay. Neu may doi mang (DHCP doi IP),
// chay lai:  ./firmware/scripts/setup_local_config.py
//
// Dung #ifndef de cho build_flags (-DMQTT_BROKER_HOST="...") co the ghi de.
#ifndef MQTT_BROKER_HOST
#define MQTT_BROKER_HOST "{broker_host}"
#endif
#ifndef MQTT_BROKER_PORT
#define MQTT_BROKER_PORT {broker_port}
#endif

// ---- Wi-Fi ----
// ESP32 can cung mang LAN voi may chay docker-compose.
// "Wokwi-GUEST" chi dung cho mo phong tren Wokwi.
#ifndef WIFI_SSID
#define WIFI_SSID "{wifi_ssid}"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "{wifi_password}"
#endif
"""

CAM_TEMPLATE = """#pragma once

// ==============================================================================
// SwiftletCare - Config Wi-Fi LOCAL cho may nay (KHONG commit).
// ------------------------------------------------------------------------------
// File nay duoc sinh boi: firmware/scripts/setup_local_config.py
// Da nam trong .gitignore nen KHONG bi commit len GitHub.
// ==============================================================================

#ifndef WIFI_SSID
#define WIFI_SSID "{wifi_ssid}"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "{wifi_password}"
#endif
"""


def escape_c(value):
    """Escape dau nhay / backslash cho C string literal."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def write_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  [OK] Da ghi {path.relative_to(REPO_ROOT)}")


# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Sinh file config local cho may dang chay (KHONG commit len git).",
    )
    parser.add_argument("--broker-host", help="IP may chay docker-compose (tu dong do neu bo trong)")
    parser.add_argument("--broker-port", type=int, default=BROKER_PORT, help="Cong broker (mac dinh 1883)")
    parser.add_argument("--wifi-ssid", help="Ten Wi-Fi (tu dong do neu bo trong)")
    parser.add_argument("--wifi-password", help="Mat khau Wi-Fi (nhap tuong tac neu bo trong)")
    parser.add_argument("--yes", action="store_true", help="Khong hoi xac nhan")
    args = parser.parse_args()

    print("=" * 70)
    print("SwiftletCare - Setup config local")
    print("=" * 70)

    # --- Broker host ---
    broker_host = args.broker_host
    candidates = list_candidate_ips()
    default_ip = detect_default_ip()

    if not broker_host:
        if candidates:
            print("\n[1] Cac IP LAN cua may nay:")
            for idx, (ip, alias) in enumerate(candidates, 1):
                tag = "  <-- route mac dinh, khuyen nghi" if ip == default_ip else ""
                print(f"    [{idx}] {ip:<16} {alias}{tag}")
            if default_ip:
                print(f"\n    Tu dong chon: {default_ip} (route mac dinh)")
                broker_host = default_ip
            else:
                choice = "1"
                if not args.yes and sys.stdin.isatty():
                    choice = input("\n    Nhap so thu tu can chon (mac dinh 1): ").strip() or "1"
                try:
                    broker_host = candidates[int(choice) - 1][0]
                except (ValueError, IndexError):
                    print("    Lua chon khong hop le.")
                    return 1
        else:
            print("\n[1] KHONG do duoc IP LAN. Hay truyen --broker-host <IP>.")
            broker_host = ""
            if not args.yes and sys.stdin.isatty():
                broker_host = input("    Nhap IP may chay docker-compose: ").strip()
            if not broker_host:
                print("    Can IP broker de tiep tuc.")
                return 1

    # --- Wi-Fi ---
    wifi_ssid = args.wifi_ssid
    if not wifi_ssid:
        detected = detect_wifi_ssid()
        if detected:
            print(f"\n[2] Tu dong do ten Wi-Fi: {detected}")
            wifi_ssid = detected
        else:
            print("\n[2] KHONG do duoc ten Wi-Fi (may co the dang dung Ethernet).")
            if not args.yes and sys.stdin.isatty():
                wifi_ssid = input("    Nhap ten Wi-Fi (bo trong neu khong can): ").strip()

    wifi_password = args.wifi_password
    if wifi_password is None:
        # Tuong tac (nhap mat khau) chi khi chay interactive.
        # Voi --yes / non-tty -> bo trong, nguoi dung tu sua file local sau.
        if wifi_ssid and not args.yes and sys.stdin.isatty():
            print(f"    Nhap mat khau Wi-Fi '{wifi_ssid}' (Enter = de trong): ", end="")
            try:
                wifi_password = getpass.getpass("")
            except Exception:
                wifi_password = ""
        else:
            wifi_password = ""

    # --- Xac nhan ---
    print("\n" + "-" * 70)
    print("  Broker host : " + broker_host)
    print("  Wi-Fi SSID  : " + (wifi_ssid or "(khong dung)"))
    print("  Password    : " + ("*" * len(wifi_password) if wifi_password else "(rong)"))
    print("-" * 70)

    if not args.yes:
        if not sys.stdin.isatty():
            print("  (khong phai terminal tuong tac -> bo qua xac nhan)")
        else:
            if input("\nGhi 2 file local? [y/N]: ").strip().lower() not in ("y", "yes"):
                print("  Da huy.")
                return 0

    # --- Ghi file ---
    print("\n[3] Ghi file local:")
    write_file(MAIN_LOCAL, MAIN_TEMPLATE.format(
        broker_host=escape_c(broker_host),
        broker_port=args.broker_port,
        wifi_ssid=escape_c(wifi_ssid or ""),
        wifi_password=escape_c(wifi_password or ""),
    ))
    write_file(CAM_LOCAL, CAM_TEMPLATE.format(
        wifi_ssid=escape_c(wifi_ssid or ""),
        wifi_password=escape_c(wifi_password or ""),
    ))

    # --- Kiem tra broker ---
    print("\n[4] Kiem tra broker:")
    ok, msg = check_broker(broker_host, args.broker_port)
    print(f"    {msg}")
    if not ok:
        if not docker_running():
            print("    -> Docker chua chay? Thu:  cd docker && docker compose up -d")
        else:
            print("    -> EMQX co chay khong?  cd docker && docker compose ps")
        print("    -> Neu doi may, IP doi theo DHCP: chay lai script nay.")

    print("\n" + "=" * 70)
    print("Xong. Tiep tuc nap firmware:")
    print("    cd firmware/esp32-main && pio run -t upload")
    print("    cd firmware/esp32-cam  && pio run -t upload")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nDa huy.")
        sys.exit(130)
