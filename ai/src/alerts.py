"""Bo loc canh bao thu san moi (Owl/Rat/Snake) - thuan Python, test duoc khong can model.

Mot canh bao chi phat ra khi:
  1. do tin cay >= nguong cua LOAI do (nguong rieng tung loai, mac dinh dung chung),
  2. hop bao du lon (>= min_area_ratio dien tich khung) -> loai nhieu diem nho,
  3. thay lien tiep >= streak_needed khung hinh -> loai phat hien nhay 1-2 khung,
  4. cach canh bao truoc cua CUNG loai >= cooldown_s giay -> khong spam.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

PREDATORS = {"owl", "rat", "snake"}

Det = Tuple[str, float, float]      # (ten loai, do tin cay, ti le dien tich hop bao / khung)


def parse_conf_map(text: str) -> Dict[str, float]:
    """'owl=0.6,rat=0.5' -> {'owl': 0.6, 'rat': 0.5}."""
    out: Dict[str, float] = {}
    for part in (text or "").split(","):
        part = part.strip()
        if not part:
            continue
        name, _, val = part.partition("=")
        v = float(val)
        if not 0.0 < v <= 1.0:
            raise ValueError(f"Nguong cua '{name}' phai nam trong (0, 1]: {v}")
        out[name.strip().lower()] = v
    return out


class PredatorFilter:
    def __init__(self, conf_by_class: Dict[str, float] | None = None, default_conf: float = 0.5,
                 min_area_ratio: float = 0.0003, streak_needed: int = 3, cooldown_s: float = 30.0):
        self.conf_by_class = {k.lower(): v for k, v in (conf_by_class or {}).items()}
        self.default_conf = default_conf
        self.min_area_ratio = min_area_ratio
        self.streak_needed = streak_needed
        self.cooldown_s = cooldown_s
        self.streak: Dict[str, int] = defaultdict(int)
        self.last_alert: Dict[str, float] = {}

    def threshold(self, name: str) -> float:
        return self.conf_by_class.get(name.lower(), self.default_conf)

    def min_threshold(self) -> float:
        """Nguong thap nhat dang dung - dung lam san 'conf' cua model."""
        return min([self.default_conf, *self.conf_by_class.values()])

    def accepts(self, name: str, conf: float, area_ratio: float) -> bool:
        return conf >= self.threshold(name) and area_ratio >= self.min_area_ratio

    def reset_streaks(self) -> None:
        self.streak.clear()

    def update(self, dets: Iterable[Det], t: float) -> List[dict]:
        """Goi MOI khung hinh (ke ca khi khong co thu san moi, de reset chuoi).
        t: thoi gian (giay) - thoi gian video neu doc file, dong ho neu la camera."""
        best: Dict[str, float] = {}
        for name, conf, area in dets:
            n = name.lower()
            if self.accepts(n, conf, area):
                best[n] = max(conf, best.get(n, 0.0))
        alerts = []
        for n in set(best) | set(self.streak):
            self.streak[n] = self.streak[n] + 1 if n in best else 0
            if (n in best and self.streak[n] >= self.streak_needed
                    and t - self.last_alert.get(n, float("-inf")) >= self.cooldown_s):
                self.last_alert[n] = t
                alerts.append({"class": n, "confidence": best[n], "t": t})
        return alerts