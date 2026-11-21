"""Logic dem chim ra/vao bang vach ao.

Tach rieng khoi YOLO/OpenCV de co the unit-test khong can model.

Quy uoc:
- Vach ao la doan thang p1 -> p2 (toa do pixel).
- Khoang cach co dau d > 0 la phia "duong". Voi vach ngang trai->phai,
  phia duong chinh la phia DUOI man hinh.
- in_side = +1: chim di sang phia duong = IN, sang phia am = OUT. in_side = -1: nguoc lai.
- Vung dem (buffer_px) hai ben vach: chim chi duoc tinh la da "sang phia" khi ra han vung dem,
  nen jitter cua bounding box quanh vach khong tao luot dem gia.
- Cooldown theo tung ID de tranh dem lap khi ByteTrack rung.
- Chi tinh chim nam trong doan vach (cho lech segment_margin o hai dau).
- Khong khoa ID vinh vien: mot con chim bay ra roi bay vao lai van duoc dem dung.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Optional, Tuple

Point = Tuple[float, float]


@dataclass
class TrackState:
    side: int = 0                 # phia da xac nhan gan nhat: -1 / +1, 0 = chua biet
    last_seen: int = 0
    last_counted: int = -1_000_000
    trail: Deque[Point] = field(default_factory=lambda: deque(maxlen=30))


class VirtualLineCounter:
    def __init__(
        self,
        p1: Point,
        p2: Point,
        in_side: int = 1,
        buffer_px: float = 12.0,
        cooldown_frames: int = 30,
        max_missing_frames: int = 90,
        initial_count: int = 0,
        segment_margin: float = 0.1,
    ) -> None:
        if in_side not in (-1, 1):
            raise ValueError("in_side phai la +1 hoac -1")
        self.in_side = in_side
        self.buffer_px = buffer_px
        self.cooldown_frames = cooldown_frames
        self.max_missing_frames = max_missing_frames
        self.initial_count = initial_count
        self.segment_margin = segment_margin   # cho phep lech 10% do dai vach o hai dau
        self.in_count = 0
        self.out_count = 0
        self.tracks: Dict[int, TrackState] = {}
        self.set_line(p1, p2)

    # ---- hinh hoc ----
    def set_line(self, p1: Point, p2: Point) -> None:
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length == 0:
            raise ValueError("Vach ao co do dai bang 0")
        self.p1, self.p2 = p1, p2
        self._dx, self._dy, self._len = dx, dy, length

    def signed_distance(self, pt: Point) -> float:
        return (self._dx * (pt[1] - self.p1[1]) - self._dy * (pt[0] - self.p1[0])) / self._len

    # ---- dem ----
    @property
    def current(self) -> int:
        """So chim con trong nha = ban dau + vao - ra (co the am neu cau hinh sai)."""
        return self.initial_count + self.in_count - self.out_count

    def update(self, track_id: int, pt: Point, frame_no: int) -> Optional[str]:
        """Cap nhat 1 track. Tra ve 'IN' / 'OUT' neu vua cat vach, nguoc lai None."""
        st = self.tracks.get(track_id)
        if st is None:
            st = self.tracks[track_id] = TrackState()
        st.last_seen = frame_no
        st.trail.append(pt)

        # Chi tinh khi chim nam trong doan vach (chieu chieu len vach), khong tinh chim
        # bay vong qua hai dau vach -> dung cho vach ve tai lo cua thu.
        t = ((pt[0] - self.p1[0]) * self._dx + (pt[1] - self.p1[1]) * self._dy) / (self._len ** 2)
        if t < -self.segment_margin or t > 1 + self.segment_margin:
            return None

        d = self.signed_distance(pt)
        if d > self.buffer_px:
            new_side = 1
        elif d < -self.buffer_px:
            new_side = -1
        else:
            return None                      # dang trong vung dem -> giu nguyen

        if st.side == 0:
            st.side = new_side               # lan dau thay -> chi ghi nho phia
            return None
        if new_side == st.side:
            return None

        # Da doi phia
        if frame_no - st.last_counted < self.cooldown_frames:
            return None                      # dang cooldown: bo qua, giu phia cu
        st.side = new_side
        st.last_counted = frame_no
        if new_side == self.in_side:
            self.in_count += 1
            return "IN"
        self.out_count += 1
        return "OUT"

    def prune(self, frame_no: int) -> None:
        """Xoa track da mat qua lau de tranh phinh bo nho."""
        dead = [i for i, s in self.tracks.items() if frame_no - s.last_seen > self.max_missing_frames]
        for i in dead:
            del self.tracks[i]

    def reset(self) -> None:
        self.in_count = 0
        self.out_count = 0
        self.tracks.clear()