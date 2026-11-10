"""Luu/khoi phuc so dem. Quan trong: tong chim con lai phai CONG DON qua cac ngay,
chi IN/OUT la tinh theo ngay."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

VIETNAM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def operating_date(now: datetime | None = None) -> str:
    """Return the operational date in Vietnam, independent of host timezone."""
    return (now or datetime.now(VIETNAM_TZ)).astimezone(VIETNAM_TZ).date().isoformat()


def read_state(path: Path):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return None


def write_state(path: Path, counter, today: str | None = None) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({
        "date": today or operating_date(), "initial": counter.initial_count,
        "in": counter.in_count, "out": counter.out_count, "current": counter.current
    })
    # A completed temporary file is atomically swapped in, so power loss never leaves
    # a half-written state file that silently turns the current count into zero.
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent, text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp:
            temp.write(payload)
            temp.flush()
            os.fsync(temp.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def resolve(saved, today: str, cli_initial):
    """Tra ve (initial, in, out) luc khoi dong.

    - Co --initial-count: dung gia tri do lam so chim goc (ghi de), giu IN/OUT neu cung ngay.
    - Cung ngay: khoi phuc tiep tuc.
    - Sang ngay moi: IN/OUT ve 0, so chim goc = so chim con lai cua hom truoc.
    - Chua co du lieu: bat dau tu 0.
    """
    same_day = bool(saved) and saved.get("date") == today
    if cli_initial is not None:
        return (cli_initial, saved.get("in", 0), saved.get("out", 0)) if same_day else (cli_initial, 0, 0)
    if not saved:
        return 0, 0, 0
    if same_day:
        return saved.get("initial", 0), saved.get("in", 0), saved.get("out", 0)
    return saved.get("current", 0), 0, 0
