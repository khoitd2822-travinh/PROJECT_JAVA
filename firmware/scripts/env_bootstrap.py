#!/usr/bin/env python3
"""
env_bootstrap.py - Kiem tra moi truong thich nghi cho bat ky may nao:
  - Thieu goi Python nao thi cai dung goi do; du roi thi bo qua ngay lap tuc.
  - Thieu cong cu nen tang (Java 21, Node.js, PlatformIO) tren Windows -> tu cai qua winget/pip neu chua co.
  - Tren Windows, chi khi thay thiet bi USB-UART cam vao bi loi thieu driver (Error 28)
    moi tu dong tai & cai driver chinh hang tu Microsoft Update Catalog; co san roi thi bo qua.
  - Tu dong mo Docker Desktop tren Windows/macOS neu da cai ma chua khoi dong.
"""
from __future__ import annotations

import glob
import importlib.util
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


def modules_missing(module_names: list[str] | tuple[str, ...]) -> list[str]:
    """Tra ve danh sach module chua co trong moi truong Python hien tai."""
    return [name for name in module_names if importlib.util.find_spec(name) is None]


def ensure_python_requirements(
    req_file: Path,
    required_modules: list[str] | tuple[str, ...],
    label: str,
) -> bool:
    """Chi chay pip install khi thieu it nhat 1 module; du roi thi khong lam gi."""
    missing = modules_missing(required_modules)
    if not missing:
        return True
    if not req_file.exists():
        print(f"[SETUP] Thieu module {', '.join(missing)} nhung khong tim thay {req_file}.")
        return False

    print(f"[SETUP] May chua co {', '.join(missing)} ({label}) -> dang tu dong cai dat...")
    proc = subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(req_file), "--quiet"])
    if proc.returncode != 0:
        print(f"[SETUP] Khong cai duoc {req_file} (ma loi {proc.returncode}).")
        return False
    print(f"[SETUP] Da cai xong {label}.")
    return True


def ensure_platformio_installed() -> bool:
    if importlib.util.find_spec("platformio") is not None:
        return True
    print("[SETUP] Chua co PlatformIO -> dang tu dong cai (pip install platformio)...")
    proc = subprocess.run([sys.executable, "-m", "pip", "install", "platformio", "--quiet"])
    return proc.returncode == 0


def _append_windows_dirs_to_path(patterns: list[str] | tuple[str, ...]) -> None:
    if platform.system() != "Windows":
        return
    current = os.environ.get("PATH", "")
    parts = [p for p in current.split(os.pathsep) if p]
    existing = {os.path.normcase(os.path.normpath(p)) for p in parts}
    for pattern in patterns:
        expanded = glob.glob(os.path.expandvars(pattern))
        for candidate in sorted(expanded, reverse=True):
            if Path(candidate).is_dir():
                norm = os.path.normcase(os.path.normpath(candidate))
                if norm not in existing:
                    parts.insert(0, candidate)
                    existing.add(norm)
    # Nap lai PATH User/Machine tu Registry neu co phan mem moi cai
    ps = (
        "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + "
        "[Environment]::GetEnvironmentVariable('Path','User')"
    )
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        for p in proc.stdout.decode("utf-8", errors="replace").strip().split(";"):
            p = p.strip()
            if p and Path(p).is_dir():
                norm = os.path.normcase(os.path.normpath(p))
                if norm not in existing:
                    parts.append(p)
                    existing.add(norm)
    except Exception:
        pass
    os.environ["PATH"] = os.pathsep.join(parts)


def ensure_runtime_tool(
    cmd: str,
    label: str,
    *,
    winget_id: str | None = None,
    install_hint: str | None = None,
    extra_windows_dirs: tuple[str, ...] = (),
) -> bool:
    """
    Kiem tra cong cu he thong (`java`, `npm`, `docker`, ...).
    Neu may da co san -> tra ve True ngay lap tuc; neu thieu tren Windows va co winget -> tu dong cai.
    """
    if shutil.which(cmd):
        return True

    if platform.system() == "Windows":
        if extra_windows_dirs:
            _append_windows_dirs_to_path(extra_windows_dirs)
            if shutil.which(cmd):
                return True

        if winget_id and shutil.which("winget"):
            print(f"[SETUP] May chua co {label} ({cmd}) -> dang tu dong cai qua winget ({winget_id})...")
            proc = subprocess.run([
                "winget",
                "install",
                "-e",
                "--id",
                winget_id,
                "--accept-package-agreements",
                "--accept-source-agreements",
            ])
            if proc.returncode == 0:
                _append_windows_dirs_to_path(extra_windows_dirs)
                if shutil.which(cmd):
                    print(f"[SETUP] Da cai xong {label}.")
                    return True

    hint = f" Goi y: {install_hint}" if install_hint else ""
    print(f"[ERROR] Khong tim thay {label} ('{cmd}').{hint}")
    return False


def _find_cached_inf(inf_name: str, vid_token: str) -> Path | None:
    """Tim file .inf da tai san trong Downloads hoac LocalAppData truoc khi tai mang."""
    search_dirs: list[Path] = []
    local_app = os.environ.get("LOCALAPPDATA")
    if local_app:
        search_dirs.append(Path(local_app) / "SwiftletCare" / "drivers")
    downloads = Path.home() / "Downloads"
    if downloads.exists():
        search_dirs.append(downloads)

    for base in search_dirs:
        if not base.exists():
            continue
        for match in base.rglob(inf_name):
            try:
                if vid_token.lower() in match.read_text(encoding="utf-8", errors="ignore").lower():
                    return match
            except OSError:
                continue
    return None


def _download_microsoft_catalog_driver(query: str, dest_dir: Path, inf_hint: str | None = None) -> Path | None:
    """Tai goi driver ky so chinh thuc tu Microsoft Update Catalog (.cab) va giai nen."""
    try:
        search_url = "https://www.catalog.update.microsoft.com/Search.aspx?q=" + urllib.parse.quote(query)
        with urllib.request.urlopen(search_url, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        ids = list(dict.fromkeys(re.findall(r'id="([0-9a-f\-]{36})"', html)))
        if not ids:
            return None

        payload = urllib.parse.urlencode({
            "updateIDs": f'[{{"size":0,"languages":"","uidInfo":"{ids[0]}","updateID":"{ids[0]}"}}]'
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://www.catalog.update.microsoft.com/DownloadDialog.aspx",
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            dlg = resp.read().decode("utf-8", errors="replace")
        cabs = re.findall(r"https?://[^'\"\s]+\.cab", dlg)
        if not cabs:
            return None

        dest_dir.mkdir(parents=True, exist_ok=True)
        cab_path = dest_dir / "driver.cab"
        with urllib.request.urlopen(cabs[0], timeout=30) as resp:
            cab_path.write_bytes(resp.read())

        expand = subprocess.run(
            ["expand.exe", "-F:*", str(cab_path), str(dest_dir)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        cab_path.unlink(missing_ok=True)
        if expand.returncode != 0:
            return None

        if inf_hint and (dest_dir / inf_hint).exists():
            return dest_dir / inf_hint
        infs = list(dest_dir.rglob("*.inf"))
        return infs[0] if infs else None
    except Exception:
        return None


def _install_inf_windows(inf_path: Path) -> bool:
    """Cai file .inf vao Windows DriverStore qua pnputil (UAC neu chua co quyen Admin)."""
    check_cat = list(inf_path.parent.glob("*.cat"))
    if check_cat:
        cat_escaped = str(check_cat[0]).replace("'", "''")
        sig = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                f"(Get-AuthenticodeSignature '{cat_escaped}').Status",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
        status = sig.stdout.decode("utf-8", errors="replace").strip()
        if status != "Valid":
            print(f"[DRIVER] Bo qua {inf_path.name} vi chu ky so khong hop le ({status}).")
            return False

    direct = subprocess.run(
        ["pnputil", "/add-driver", str(inf_path), "/install"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if direct.returncode == 0:
        return True

    print(f"[DRIVER] Dang mo xac nhan UAC Windows de cai {inf_path.name} (bam Yes)...")
    inf_escaped = str(inf_path).replace("'", "''")
    ps_cmd = (
        f"$p = Start-Process pnputil -ArgumentList '/add-driver \"{inf_escaped}\" /install' "
        "-Verb RunAs -PassThru -Wait; exit $p.ExitCode"
    )
    uac = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd])
    return uac.returncode == 0


def ensure_missing_windows_usb_drivers() -> bool:
    """
    Chi kiem tra & cai driver neu thuc su phat hien bo mach USB-UART bi thieu driver (Error 28).
    Neu may da co du driver -> tra ve False (khong cai gi) trong < 0.3s.
    """
    if platform.system() != "Windows":
        return False

    ps = (
        "Get-CimInstance Win32_PnPEntity | Where-Object { "
        "$_.ConfigManagerErrorCode -eq 28 -and "
        "$_.DeviceID -match 'VID_10C4|VID_1A86|VID_0403' } | "
        "ForEach-Object { \"$($_.Name)|$($_.DeviceID)\" }"
    )
    try:
        proc = subprocess.run(["powershell", "-NoProfile", "-Command", ps], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8)
        broken = [line.strip() for line in proc.stdout.decode("utf-8", errors="replace").splitlines() if line.strip()]
    except Exception:
        return False

    if not broken:
        return False

    installed_any = False
    local_base = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "SwiftletCare" / "drivers"

    specs = [
        ("VID_10C4", "silabser.inf", "Silicon Laboratories CP210x Ports", local_base / "CP210x"),
        ("VID_1A86", "ch341ser.inf", "wch.cn CH340 Ports", local_base / "CH34x"),
        ("VID_0403", "ftdiport.inf", "FTDI USB Serial Port", local_base / "FTDI"),
    ]

    seen_vids: set[str] = set()
    for row in broken:
        for vid, inf_name, catalog_q, cache_dir in specs:
            if vid in row.upper() and vid not in seen_vids:
                seen_vids.add(vid)
                print(f"[DRIVER] Phat hien thiet bi thieu driver ({row}) -> dang tu dong tai/cai...")
                inf = _find_cached_inf(inf_name, vid) or _download_microsoft_catalog_driver(catalog_q, cache_dir, inf_name)
                if inf and _install_inf_windows(inf):
                    print(f"[DRIVER] Da cai xong {inf.name} -> cho Windows nhan cong COM...")
                    installed_any = True
                else:
                    print(f"[DRIVER] Chua tu dong cai duoc {inf_name}. Can cai driver {vid} thu cong.")

    if installed_any:
        time.sleep(3.0)
    return installed_any


def try_start_docker_desktop() -> bool:
    """Neu Docker Desktop da cai tren Windows/macOS nhung chua chay -> tu khoi dong."""
    system = platform.system()
    if system == "Windows":
        exe = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Docker" / "Docker" / "Docker Desktop.exe"
        if not exe.exists():
            return False
        print("[DOCKER] Docker chua chay -> dang tu dong mo Docker Desktop...")
        subprocess.Popen([str(exe)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif system == "Darwin" and Path("/Applications/Docker.app").exists():
        print("[DOCKER] Dang tu dong mo Docker.app...")
        subprocess.Popen(["open", "-a", "Docker"])
    else:
        return False

    deadline = time.monotonic() + 90.0
    while time.monotonic() < deadline:
        if subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            print("[DOCKER] Docker Desktop da san sang.")
            return True
        time.sleep(2.0)
    return False
