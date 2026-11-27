"""PlatformIO pre-build hook: tu dong nhan dien Wi-Fi & IP LAN cho may dang build."""
from __future__ import annotations

import os
import sys
from pathlib import Path

Import("env")  # type: ignore[name-defined]


def _has_explicit_define(cppdefines: object, name: str) -> bool:
    if not isinstance(cppdefines, (list, tuple)):
        return False
    for item in cppdefines:
        if isinstance(item, tuple) and item and item[0] == name:
            return True
        if item == name:
            return True
    return False


def _sync_before_build() -> None:
    scripts_dir = Path(env["PROJECT_DIR"]).resolve().parent / "scripts"  # type: ignore[name-defined]
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        import setup_local_config as slc
    except Exception as exc:
        print(f"[SwiftletCare Auto-Config] Khong nap duoc setup_local_config: {exc}")
        return

    if slc.is_ci_environment():
        print("[SwiftletCare Auto-Config] CI environment -> dung mac dinh an toan trong config.h")
        return

    cppdefines = env.get("CPPDEFINES", [])  # type: ignore[name-defined]
    has_ssid = _has_explicit_define(cppdefines, "WIFI_SSID")
    has_pw = _has_explicit_define(cppdefines, "WIFI_PASSWORD")
    has_host = _has_explicit_define(cppdefines, "MQTT_HOST")
    if has_ssid and has_pw and has_host:
        print("[SwiftletCare Auto-Config] Da co build_flags thu cong -> bo qua tu dong ghi file.")
        return

    try:
        slc.auto_sync_local_config(
            interactive=False,
            auto_confirm=True,
            allow_keychain=False,
            check_broker_conn=False,
            quiet=False,
        )
    except Exception as exc:
        print(f"[SwiftletCare Auto-Config] Canh bao: {exc} -> tiep tuc build voi config hien co.")


_sync_before_build()
