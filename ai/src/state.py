"""Luu/khoi phuc so dem. Quan trong: tong chim con lai phai CONG DON qua cac ngay,
chi IN/OUT la tinh theo ngay."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path


def read_state(path: Path):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return None


def write_state(path: Path, counter) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "date": str(date.today()), "initial": counter.initial_count,
        "in": counter.in_count, "out": counter.out_count, "current": counter.current}))


def resolve(saved, today: str, cli_initial):
    """Tra ve (initial, in, out) luc khoi dong.

    - Co --initial-count: dung gia tri do lam so chim goc (ghi de), giu IN/OUT neu cung ngay.
    - Cung ngay: khoi phuc tiep tuc.
    - Sang ngay moi: IN/OUT ve 0, so chim goc = so chim con lai cua hom truoc.
    - Chua co du lieu: bat dau tu 0.
    """
    same_day = bool(saved) and saved.get("date") == today
    if cli_initial is not None:
        return (cli_initial, saved["in"], saved["out"]) if same_day else (cli_initial, 0, 0)
    if not saved:
        return 0, 0, 0
    if same_day:
        return saved.get("initial", 0), saved["in"], saved["out"]
    return saved.get("current", 0), 0, 0