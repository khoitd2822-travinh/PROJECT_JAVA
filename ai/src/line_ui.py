"""Giao dien ve / chinh vach ao bang CHUOT - khong can nho phim tat.

- LineEditor : bam 2 diem len lo cua thu, keo 2 dau de chinh, bam nut de dao huong / ve lai / luu.
               Phia TRONG NHA to mau xanh, phia NGOAI to mau do, mui ten xanh = huong chim bay VAO (IN).
- ActionBar  : thanh nut bam o day cua so (dung ca trong cua so dem chim: VE LAI VACH, RESET, THOAT).
Logic (on_mouse, render) tach khoi cua so de test duoc khong can man hinh.
"""
from __future__ import annotations

import math

import cv2
import numpy as np

FONT = cv2.FONT_HERSHEY_SIMPLEX
WHITE, YELLOW = (255, 255, 255), (0, 255, 255)
MAX_W, MAX_H = 1280, 680          # kich thuoc toi da cua khung hinh hien thi (chua tinh thanh nut)


def fit_scale(w: int, h: int) -> float:
    return min(1.0, MAX_W / w, MAX_H / h)


def put_text_bg(img, text, org, fs=0.65, color=WHITE, bg=(0, 0, 0), thick=2, pad=6):
    """Ve chu co nen toi cho de doc. Tra ve chieu cao da dung."""
    (tw, th), base = cv2.getTextSize(text, FONT, fs, thick)
    x, y = org
    cv2.rectangle(img, (x - pad, y - th - pad), (x + tw + pad, y + base + pad), bg, -1)
    cv2.putText(img, text, (x, y), FONT, fs, color, thick, cv2.LINE_AA)
    return th + base + 2 * pad


class ActionBar:
    """Hang nut bam nam DUOI khung hinh (khong che video). Toa do chuot la toa do anh hien thi."""

    def __init__(self, width: int, frame_h: int, actions):
        # actions: [(key, nhan, mau BGR), ...]
        self.w, self.h, self.actions = width, frame_h, actions
        self.bar_h = 60
        gap, n = 10, len(actions)
        bw = (width - gap * (n + 1)) // n
        self.rects = {}
        for i, (key, _label, _color) in enumerate(actions):
            x1 = gap + i * (bw + gap)
            self.rects[key] = (x1, frame_h + 8, x1 + bw, frame_h + self.bar_h - 8)

    def render(self, view, enabled=None):
        out = np.vstack([view, np.full((self.bar_h, self.w, 3), 35, np.uint8)])
        for key, label, color in self.actions:
            x1, y1, x2, y2 = self.rects[key]
            on = enabled is None or enabled.get(key, True)
            cv2.rectangle(out, (x1, y1), (x2, y2), color if on else (90, 90, 90), -1)
            cv2.rectangle(out, (x1, y1), (x2, y2), WHITE, 2)
            fs = 0.7
            while True:
                (tw, th), _ = cv2.getTextSize(label, FONT, fs, 2)
                if tw <= (x2 - x1) - 16 or fs <= 0.35:
                    break
                fs -= 0.05
            cv2.putText(out, label, (x1 + (x2 - x1 - tw) // 2, y1 + (y2 - y1 + th) // 2),
                        FONT, fs, WHITE, 2, cv2.LINE_AA)
        return out

    def hit(self, x, y):
        for key, (x1, y1, x2, y2) in self.rects.items():
            if x1 <= x <= x2 and y1 <= y <= y2:
                return key
        return None


class LineEditor:
    HANDLE_R = 14

    def __init__(self, frame, init=None):
        """frame: anh goc BGR. init: {'p1':[rx,ry],'p2':[rx,ry],'in_side':+-1} de chinh vach da co."""
        h, w = frame.shape[:2]
        s = fit_scale(w, h)
        self.view = cv2.resize(frame, (int(w * s), int(h * s))) if s < 1 else frame.copy()
        self.h, self.w = self.view.shape[:2]
        self.pts: list[tuple[float, float]] = []
        self.in_side = 1
        if init:
            self.pts = [(init["p1"][0] * self.w, init["p1"][1] * self.h),
                        (init["p2"][0] * self.w, init["p2"][1] * self.h)]
            self.in_side = init.get("in_side", 1)
        self.drag = None
        self.result = None            # None | "save" | "cancel"
        self.msg = ""
        self.bar = ActionBar(self.w, self.h, [
            ("flip", "DAO HUONG VAO/RA", (170, 110, 20)),
            ("redo", "VE LAI", (30, 120, 210)),
            ("save", "LUU VACH", (40, 150, 40)),
            ("cancel", "HUY", (60, 60, 170)),
        ])
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        self._X, self._Y = xx.astype(np.float32), yy.astype(np.float32)
        self._shade_key, self._shaded = None, None

    # ---------------------------------------------------------------- hinh hoc
    def _len(self):
        (x1, y1), (x2, y2) = self.pts
        return math.hypot(x2 - x1, y2 - y1)

    def _normal(self):
        """Vector don vi chi huong VAO NHA."""
        (x1, y1), (x2, y2) = self.pts
        L = self._len() or 1.0
        return (-(y2 - y1) / L * self.in_side, (x2 - x1) / L * self.in_side)

    def _nearest(self, x, y):
        best, idx = None, None
        for i, (px, py) in enumerate(self.pts):
            d = math.hypot(px - x, py - y)
            if d <= self.HANDLE_R * 1.8 and (best is None or d < best):
                best, idx = d, i
        return idx

    # ---------------------------------------------------------------- dieu khien
    def _action(self, act):
        if act == "flip":
            if len(self.pts) == 2:
                self.in_side = -self.in_side
                self.msg = ""
            else:
                self.msg = "Hay bam 2 diem tren lo cua truoc, roi moi dao huong."
        elif act == "redo":
            self.pts, self.drag, self.msg = [], None, ""
        elif act == "save":
            if len(self.pts) < 2 or self._len() < 20:
                self.msg = "Chua co vach. Bam 2 diem tren lo cua thu truoc."
            else:
                self.result = "save"
        elif act == "cancel":
            self.result = "cancel"

    def on_mouse(self, ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN:
            act = self.bar.hit(x, y)
            if act:
                return self._action(act)
            if y >= self.h:
                return
            if len(self.pts) < 2:
                self.pts.append((float(x), float(y)))
                self.msg = ""
            else:
                i = self._nearest(x, y)
                if i is None:
                    self.msg = "Muon ve lai tu dau: bam nut VE LAI. Hoac keo 2 dau tron de chinh vach."
                else:
                    self.drag = i
        elif ev == cv2.EVENT_MOUSEMOVE and self.drag is not None:
            self.pts[self.drag] = (float(min(max(x, 0), self.w - 1)), float(min(max(y, 0), self.h - 1)))
        elif ev == cv2.EVENT_LBUTTONUP:
            self.drag = None

    def on_key(self, k):
        """Phim tat chi la phuong an phu - da co day du nut bam."""
        if k in (13, 32):
            self._action("save")
        elif k in (ord("f"), ord("F")):
            self._action("flip")
        elif k in (ord("c"), ord("C")):
            self._action("redo")
        elif k in (27, ord("q")):
            self._action("cancel")

    # ---------------------------------------------------------------- ve
    def _shade(self):
        key = (tuple(self.pts[0]), tuple(self.pts[1]), self.in_side)
        if key != self._shade_key:
            (x1, y1), (x2, y2) = self.pts
            d = ((x2 - x1) * (self._Y - y1) - (y2 - y1) * (self._X - x1)) * self.in_side
            inside = d > 0
            tint = np.empty_like(self.view)
            tint[inside] = (60, 200, 60)        # TRONG NHA: xanh
            tint[~inside] = (50, 50, 230)       # NGOAI: do
            self._shaded = cv2.addWeighted(self.view, 0.72, tint, 0.28, 0)
            self._shade_key = key
        return self._shaded.copy()

    def _label(self, img, text, cx, cy, bg):
        (tw, _), _ = cv2.getTextSize(text, FONT, 0.8, 2)
        x = int(min(max(cx - tw / 2, 12), self.w - tw - 12))
        y = int(min(max(cy, 40), self.h - 14))
        put_text_bg(img, text, (x, y), fs=0.8, bg=bg, pad=8)

    def render(self):
        n = len(self.pts)
        img = self._shade() if n == 2 else self.view.copy()
        if n == 2:
            (x1, y1), (x2, y2) = self.pts
            nx, ny = self._normal()
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), YELLOW, 3, cv2.LINE_AA)
            cv2.arrowedLine(img, (int(mx), int(my)), (int(mx + nx * 90), int(my + ny * 90)),
                            (0, 255, 0), 5, cv2.LINE_AA, tipLength=0.3)
            self._label(img, "TRONG NHA (IN)", mx + nx * 150, my + ny * 150, (30, 110, 30))
            self._label(img, "NGOAI (OUT)", mx - nx * 150, my - ny * 150, (30, 30, 150))
        for i, (px, py) in enumerate(self.pts):
            c = (int(px), int(py))
            cv2.circle(img, c, self.HANDLE_R, WHITE, -1, cv2.LINE_AA)
            cv2.circle(img, c, self.HANDLE_R, (0, 0, 0), 2, cv2.LINE_AA)
            cv2.putText(img, str(i + 1), (c[0] - 6, c[1] + 6), FONT, 0.55, (0, 0, 0), 2, cv2.LINE_AA)

        steps = {
            0: ["BUOC 1/3: Bam chuot vao DIEM DAU cua lo cua thu"],
            1: ["BUOC 2/3: Bam chuot vao DIEM CUOI cua lo cua thu (ke vach doc theo lo cua)"],
            2: ["BUOC 3/3: Mui ten XANH phai chi tu NGOAI vao TRONG nha (chim bay vao = IN)",
                "Sai huong -> bam DAO HUONG | Lech -> keo 2 dau tron | Dung roi -> bam LUU VACH"],
        }[n]
        y = 34
        for line in steps:
            y += put_text_bg(img, line, (14, y), fs=0.65, bg=(0, 0, 0)) + 4
        if self.msg:
            put_text_bg(img, self.msg, (14, y + 10), fs=0.6, color=(0, 200, 255), bg=(0, 0, 0))
        return self.bar.render(img, enabled={"flip": n == 2, "save": n == 2})

    def config(self):
        (x1, y1), (x2, y2) = self.pts
        return {"p1": [x1 / self.w, y1 / self.h], "p2": [x2 / self.w, y2 / self.h], "in_side": self.in_side}


def edit_line(frame, init=None, win="Ve vach ao tai lo cua thu"):
    """Mo cua so cho nguoi dung ve/chinh vach. Tra ve dict cau hinh hoac None neu huy."""
    ed = LineEditor(frame, init)
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(win, ed.on_mouse)
    shown = 0
    try:
        while ed.result is None:
            cv2.imshow(win, ed.render())
            k = cv2.waitKey(20) & 0xFF
            if k != 255:
                ed.on_key(k)
            shown += 1
            if shown > 10:
                try:
                    if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:   # bam dau X dong cua so
                        ed.result = "cancel"
                except cv2.error:
                    ed.result = "cancel"
    finally:
        try:
            cv2.destroyWindow(win)
            cv2.waitKey(1)
        except cv2.error:
            pass
    return ed.config() if ed.result == "save" else None