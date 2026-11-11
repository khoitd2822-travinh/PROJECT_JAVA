#!/usr/bin/env python3
"""SwiftletCare - Edge AI: dem chim yen ra/vao bang vach ao + canh bao thu san moi.

Lan dau chua co vach: tu mo giao dien ve vach (bam 2 diem len lo cua thu). Ve lai: them --draw-line
  python main.py --source video.mp4 --draw-line
Cac lan sau tu doc lai vach da luu (config/line_<camera>.json):
  python main.py                                          # hien MENU: 1 video | 2 camera | 3 webcam | 4 nhap URL
  python main.py --source video.mp4
  python main.py --source 0                               # webcam
  python main.py --source http://192.168.1.50:81/stream   # ESP32-CAM
  python main.py --source rtsp://user:pass@ip:554/stream1 --headless
Dung NUT bam tren cua so: VE LAI VACH | RESET IN/OUT (giu tong con lai) | THOAT
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from counter import VirtualLineCounter
from alerts import PredatorFilter, parse_conf_map
from line_ui import ActionBar, edit_line, fit_scale
from mqtt_publisher import build_publisher
from perf import ResourceMonitor, format_summary
from snapshot_storage import SnapshotStorage
from state import VIETNAM_TZ, operating_date, read_state, resolve, write_state
from uuid import uuid4

HERE = Path(__file__).resolve().parent
PROJECT = Path(os.environ.get("SWIFTLET_HOME", HERE.parent))
# best.pt: uu tien <PROJECT>/models/best.pt, neu khong co thi tim canh main.py
DEFAULT_MODEL = next((p for p in (PROJECT / "models" / "best.pt", HERE / "best.pt") if p.exists()),
                     PROJECT / "models" / "best.pt")
PREDATORS = {"owl", "rat", "snake"}
# ESP32-CAM (CameraWebServer): trang web o cong 80, LUONG VIDEO o cong 81. Thu lan luot cac duong dan hay gap.
CAMERA_IP = os.environ.get("CAMERA_IP", "192.168.103.50")
CAMERA_URLS = [f"http://{CAMERA_IP}:81/stream", f"http://{CAMERA_IP}/stream", f"http://{CAMERA_IP}/mjpeg/1"]
COLORS = {"swiftlet": (0, 220, 0), "owl": (0, 0, 255), "rat": (0, 0, 255), "snake": (0, 0, 255)}


# --------------------------------------------------------------------------- tham so
def parse_args():
    p = argparse.ArgumentParser(description="SwiftletCare edge counter")
    p.add_argument("--source", help="file video | so webcam | URL http/rtsp. De trong = hien MENU chon nguon")
    p.add_argument("--model", default=str(DEFAULT_MODEL))
    p.add_argument("--tracker", default=str(PROJECT / "config" / "bytetrack_bird.yaml"))
    p.add_argument("--conf", type=float, default=None, help="(cu) tuong duong --conf-swiftlet")
    p.add_argument("--conf-swiftlet", type=float, default=0.25,
                   help="Nguong tin cay khi DEM CHIM (thap de it bo sot, tranh dut ID)")
    p.add_argument("--conf-predator", type=float, default=0.5,
                   help="Nguong tin cay mac dinh cho canh bao thu san moi (cao de it bao dong gia)")
    p.add_argument("--predator-conf", default="",
                   help="Nguong rieng tung loai, vd: owl=0.6,rat=0.5,snake=0.55")
    p.add_argument("--min-predator-area", type=float, default=0.0003,
                   help="Hop bao thu san moi phai chiem it nhat ti le nay cua khung (loc nhieu nho)")
    p.add_argument("--predator-frames", type=int, default=3, help="So khung LIEN TIEP phai thay moi bao")
    p.add_argument("--alert-cooldown", type=float, default=30.0, help="Giay toi thieu giua 2 canh bao cung loai")
    p.add_argument("--det-log", default=str(PROJECT / "data" / "detections_last.csv"),
                   help="File ghi moi lan model thay thu san moi (de cho calibrate_threshold.py can nguong)")
    p.add_argument("--device", default=None, help="cpu | 0 | cuda:0 ... Bo trong = tu chon")
    p.add_argument("--half", action="store_true", help="Suy luan FP16 (chi co tac dung tren GPU NVIDIA)")
    p.add_argument("--no-monitor", action="store_true", help="Khong do CPU/GPU/RAM")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--draw-line", action="store_true",
                   help="Bam 2 diem de ve vach ao tai lo cua thu (se duoc luu lai)")
    p.add_argument("--line", default=None,
                   help="Dat vach bang tay theo ti le khung hinh: x1,y1,x2,y2 (bo qua file da luu)")
    p.add_argument("--in-dir", choices=["down", "up"], default=None,
                   help="Chi dung voi --line / vach mac dinh: 'down' = chim di xuong la IN")
    p.add_argument("--buffer", type=float, default=12, help="Vung dem 2 ben vach (pixel)")
    p.add_argument("--cooldown", type=int, default=30, help="So khung cho giua 2 lan dem cua 1 ID")
    p.add_argument("--initial-count", type=int, default=None,
                   help="So chim hien co trong nha (ghi de so luu). Bo trong = tiep tuc so da luu")
    p.add_argument("--no-state", action="store_true",
                   help="Khong doc/ghi so dem luu (dung khi test). Video file mac dinh khong luu")
    p.add_argument("--skip", type=int, default=1, help="Xu ly moi N khung (giam tai CPU)")
    p.add_argument("--house-id", default=os.environ.get("HOUSE_ID", "house-01"))
    p.add_argument("--camera-id", default=os.environ.get("CAMERA_ID", "cam-01"))
    p.add_argument("--snapshot-dir", default=str(PROJECT / "snapshots"))
    p.add_argument("--headless", action="store_true", help="Khong mo cua so (Docker/server)")
    return p.parse_args()


def probe_stream(urls):
    """Thu mo tung URL, tra ve URL dau tien doc duoc khung hinh (hoac None)."""
    for u in urls:
        print(f"  Thu ket noi: {u}")
        cap = cv2.VideoCapture(u)
        ok = cap.isOpened() and cap.read()[0]
        cap.release()
        if ok:
            print(f"  -> Ket noi duoc: {u}")
            return u
    return None


def pick_video_file():
    from tkinter import Tk, filedialog
    root = Tk(); root.withdraw(); root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        parent=root, title="Chon video de dem chim",
        filetypes=[("Video", "*.mp4 *.avi *.mov *.mkv"), ("Tat ca", "*.*")])
    root.destroy()
    return path


def pick_source(arg):
    """Tra ve (source, is_stream). Co --source thi dung luon, khong thi hien MENU."""
    if arg is not None:
        if arg.isdigit():
            return int(arg), True
        return arg, arg.lower().startswith(("rtsp://", "http://", "https://"))

    if not sys.stdin.isatty():                          # Docker/service: khong co ban phim -> noi camera
        return probe_stream(CAMERA_URLS) or CAMERA_URLS[0], True

    while True:
        print("\n=== CHON NGUON VIDEO ===")
        print("  1. Video trong may (chon file)")
        print(f"  2. Camera ESP32-CAM qua WiFi ({CAMERA_IP})")
        print("  3. Webcam may tinh")
        print("  4. Nhap URL / IP camera khac")
        print("  0. Thoat")
        choice = input("Chon (0-4): ").strip()
        if choice == "1":
            path = pick_video_file()
            if path:
                return path, False
            print("Chua chon video.")
        elif choice == "2":
            print("Dang tim luong camera...")
            url = probe_stream(CAMERA_URLS)
            if url:
                return url, True
            print("Khong ket noi duoc camera. Kiem tra: cung WiFi, da dong tab web camera "
                  "(ESP32 chi cho 1 may xem luong), hoac chon 4 de nhap URL.")
        elif choice == "3":
            return 0, True
        elif choice == "4":
            u = input("Nhap URL hoac IP (vd 192.168.103.50): ").strip()
            if u:
                if not u.lower().startswith(("http://", "https://", "rtsp://")):
                    u = f"http://{u}:81/stream"
                return u, not u.isdigit()
        elif choice == "0":
            raise SystemExit("Da thoat.")
        else:
            print("Lua chon khong hop le.")


# --------------------------------------------------------------------------- doc camera
class LatestFrameReader:
    """Doc camera/stream o thread rieng, luon giu khung MOI NHAT va tu noi lai khi mat tin hieu."""

    def __init__(self, source):
        self.source = source
        self.lock = threading.Lock()
        self.frame = None
        self.seq = 0
        self.stopped = False
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while not self.stopped:
            cap = cv2.VideoCapture(self.source)
            if not cap.isOpened():
                print("[CAM] Khong mo duoc camera, thu lai sau 3s...")
                time.sleep(3)
                continue
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            print("[CAM] Da ket noi camera")
            fails = 0
            while not self.stopped:
                ok, frame = cap.read()
                if not ok:
                    fails += 1
                    if fails > 30:
                        print("[CAM] Mat tin hieu, ket noi lai...")
                        break
                    time.sleep(0.02)
                    continue
                fails = 0
                with self.lock:
                    self.frame, self.seq = frame, self.seq + 1
            cap.release()
            time.sleep(2)

    def read(self):
        with self.lock:
            return self.seq, self.frame

    def stop(self):
        self.stopped = True


# --------------------------------------------------------------------------- ve vach ao
def first_frame(reader, cap):
    if reader:
        for _ in range(300):
            _, f = reader.read()
            if f is not None:
                return f.copy()
            time.sleep(0.1)
        raise SystemExit("Khong lay duoc khung hinh tu camera de ve vach.")
    ok, f = cap.read()
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    if not ok:
        raise SystemExit("Khong doc duoc khung dau cua video.")
    return f


def line_path(camera_id):
    return PROJECT / "config" / f"line_{camera_id}.json"


def save_line(camera_id, cfg):
    p = line_path(camera_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg))
    print(f"Da luu vach ao: {p.name}")


def resolve_line(args, reader, cap):
    """Thu tu: --draw-line > --line > vach da luu > (lan dau chua co vach) TU MO giao dien ve."""
    in_side_cli = None if args.in_dir is None else (1 if args.in_dir == "down" else -1)
    saved = None
    if line_path(args.camera_id).exists():
        try:
            saved = json.loads(line_path(args.camera_id).read_text())
        except Exception:
            saved = None

    if args.draw_line or (saved is None and not args.line):
        if args.headless:
            if args.draw_line:
                raise SystemExit("--draw-line can man hinh, khong dung duoc voi --headless.")
            print("CHUA co vach ao -> dung vach ngang giua khung (chay co man hinh de ve vach).")
            return {"p1": [0.0, 0.5], "p2": [1.0, 0.5], "in_side": in_side_cli or 1}
        cfg = edit_line(first_frame(reader, cap), init=saved)    # bat dau tu vach cu neu co
        if cfg is None:
            raise SystemExit("Da huy ve vach.")
        save_line(args.camera_id, cfg)
        return cfg
    if args.line:
        x1, y1, x2, y2 = [float(v) for v in args.line.split(",")]
        return {"p1": [x1, y1], "p2": [x2, y2], "in_side": in_side_cli or 1}
    if in_side_cli:
        saved["in_side"] = in_side_cli
    print(f"Dung vach da luu: {line_path(args.camera_id).name}")
    return saved


def describe_device(device_arg, half):
    """In thiet bi dang dung. Tra ve (dung FP16 hay khong, nhan thiet bi)."""
    try:
        import torch
        cuda = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if cuda else None
    except Exception:
        cuda, gpu_name = False, None
    forced_cpu = bool(device_arg) and str(device_arg).lower().startswith("cpu")
    on_gpu = cuda and not forced_cpu
    label = f"GPU ({gpu_name})" if on_gpu else "CPU"
    if not cuda and not forced_cpu:
        label += " - khong thay GPU CUDA (torch ban CPU hoac may khong co card NVIDIA)"
    print(f"Thiet bi suy luan: {label}")
    if half and not on_gpu:
        print("Luu y: --half chi dung duoc tren GPU NVIDIA -> bo qua.")
    return bool(half and on_gpu), label


# --------------------------------------------------------------------------- main
WIN = "SwiftletCare - Dem chim"


def main():
    args = parse_args()
    source, is_stream = pick_source(args.source)

    print("Dang nap model...")
    model = YOLO(args.model, task="detect")
    names = {int(k): v for k, v in model.names.items()}
    swiftlet_ids = {k for k, v in names.items() if v.lower() == "swiftlet"}
    if not swiftlet_ids:
        raise SystemExit(f"Model khong co class 'Swiftlet'. Cac class hien co: {names}")
    print("Da nap model:", names)
    tracker = args.tracker if Path(args.tracker).exists() else "bytetrack.yaml"
    orig_name = {v.lower(): v for v in names.values()}
    use_half, device_label = describe_device(args.device, args.half)
    conf_swiftlet = args.conf if args.conf is not None else args.conf_swiftlet
    pflt = PredatorFilter(parse_conf_map(args.predator_conf), default_conf=args.conf_predator,
                          min_area_ratio=args.min_predator_area, streak_needed=args.predator_frames,
                          cooldown_s=args.alert_cooldown)
    model_conf = max(0.01, min(conf_swiftlet, pflt.min_threshold()))   # san cua model, loc tiep theo tung loai
    track_kw = dict(persist=True, tracker=tracker, conf=model_conf, imgsz=args.imgsz, verbose=False)
    if args.device:
        track_kw["device"] = args.device
    if use_half:
        track_kw["half"] = True
    print(f"Nguong: chim >= {conf_swiftlet} | thu san moi >= {pflt.default_conf}"
          f"{' (rieng: ' + args.predator_conf + ')' if args.predator_conf else ''}"
          f" | hop bao >= {args.min_predator_area:.2%} khung | {args.predator_frames} khung lien tiep")

    reader = LatestFrameReader(source) if is_stream else None
    cap = None if is_stream else cv2.VideoCapture(source)
    if cap is not None and not cap.isOpened():
        raise SystemExit(f"Khong mo duoc video: {source}")
    src_fps = (cap.get(cv2.CAP_PROP_FPS) or 0) if cap else 0

    line_cfg = resolve_line(args, reader, cap)
    use_state = is_stream and not args.no_state          # video test khong lam ban so dem that
    st_path = PROJECT / "data" / f"state_{args.camera_id}.json"

    pub = build_publisher(args.house_id, args.camera_id)
    snapshot_storage = SnapshotStorage.from_environment()
    if snapshot_storage is None:
        print("[S3] Chua cau hinh S3_* -> alert van gui, snapshotKey se la null")
    Path(args.snapshot_dir).mkdir(parents=True, exist_ok=True)
    (PROJECT / "data").mkdir(exist_ok=True)
    ev_file = open(PROJECT / "data" / "events_last.csv", "w", newline="", encoding="utf-8")
    ev_csv = csv.writer(ev_file)
    ev_csv.writerow(["frame", "video_time_s", "event", "track_id", "in", "out", "current"])
    Path(args.det_log).parent.mkdir(parents=True, exist_ok=True)
    det_file = open(args.det_log, "w", newline="", encoding="utf-8")
    det_csv = csv.writer(det_file)
    det_csv.writerow(["t", "idx", "class", "conf", "area_ratio", "track_id"])
    acc = defaultdict(float)                      # cong don thoi gian tung buoc (ms)
    mon = None if args.no_monitor else ResourceMonitor().start()

    counter = None
    frame_no, last_seq, n_proc, shown = 0, -1, 0, 0
    streak = defaultdict(int)
    last_alert = {}
    last_hb, fps, t_prev = 0.0, 0.0, time.time()
    t_start = time.time()
    frame_size = None
    active_date = operating_date()
    # thong ke de chan doan khi dem ra 0
    n_det, frames_with_bird, track_ids = 0, 0, set()
    # thanh nut bam bang chuot o day cua so
    pending, bar_ref, bar_size = [], [None], None

    def on_mouse(ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN and bar_ref[0] is not None:
            act = bar_ref[0].hit(x, y)
            if act:
                pending.append(act)

    print("Bat dau. Dung cac NUT o day cua so: VE LAI VACH / RESET IN-OUT / THOAT")

    try:
        while True:
            if reader:
                seq, frame = reader.read()
                if frame is None or seq == last_seq:
                    time.sleep(0.005)
                    continue
                last_seq = seq
            else:
                ok, frame = cap.read()
                if not ok:
                    break
            frame_no += 1
            if frame_no % args.skip:
                continue
            n_proc += 1
            raw = frame                       # anh goc (de ve lai vach)
            frame = raw.copy()                # anh de ve len

            h, w = frame.shape[:2]
            p1 = (line_cfg["p1"][0] * w, line_cfg["p1"][1] * h)
            p2 = (line_cfg["p2"][0] * w, line_cfg["p2"][1] * h)
            if counter is None:
                initial, c_in, c_out = (0, 0, 0)
                if use_state:
                    initial, c_in, c_out = resolve(read_state(st_path), active_date, args.initial_count)
                elif args.initial_count is not None:
                    initial = args.initial_count
                counter = VirtualLineCounter(p1, p2, in_side=line_cfg["in_side"], buffer_px=args.buffer,
                                             cooldown_frames=args.cooldown, initial_count=initial)
                counter.in_count, counter.out_count = c_in, c_out
                print(f"Bat dau: chim ban dau={initial}, IN={c_in}, OUT={c_out}, con lai={counter.current}")
            elif frame_size != (w, h):
                counter.set_line(p1, p2)
            frame_size = (w, h)

            # The process can run through midnight: reset daily counters without
            # changing the number currently in the house.
            today = operating_date()
            if use_state and today != active_date:
                counter.initial_count = counter.current
                counter.reset()
                active_date = today
                write_state(st_path, counter, active_date)
                print(f"[STATE] Sang ngay {active_date}: reset IN/OUT, giu current={counter.current}")

            t_loop0 = time.perf_counter()
            res = model.track(raw, **track_kw)[0]
            acc["track_ms"] += (time.perf_counter() - t_loop0) * 1000
            for key in ("preprocess", "inference", "postprocess"):
                acc[key] += res.speed.get(key, 0.0)
            k = max(1.0, h / 720)             # chu/net ve to len theo do phan giai
            tnow = (frame_no / src_fps) if src_fps else time.time()   # giay: theo video hoac dong ho
            pred_dets, birds_now = [], 0
            b = res.boxes
            if b is not None and len(b):
                xyxy = b.xyxy.cpu().numpy()
                cls = b.cls.cpu().numpy().astype(int)
                conf = b.conf.cpu().numpy()
                ids = b.id.int().cpu().tolist() if b.id is not None else [None] * len(cls)
                for box, c, cf, tid in zip(xyxy, cls, conf, ids):
                    name = names[c]
                    x1, y1, x2, y2 = box
                    if name.lower() in PREDATORS:
                        area = max(0.0, x2 - x1) * max(0.0, y2 - y1) / (w * h)
                        det_csv.writerow([round(tnow, 3), n_proc, name, round(float(cf), 3),
                                          round(float(area), 5), tid if tid is not None else ""])
                        det_file.flush()
                        pred_dets.append((name, float(cf), float(area)))
                        if not pflt.accepts(name, float(cf), float(area)):
                            continue                  # duoi nguong / qua nho: khong ve, khong tinh
                    elif cf < conf_swiftlet:
                        continue                      # chim duoi nguong dem chim
                    color = COLORS.get(name.lower(), (255, 160, 0))
                    cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, max(2, int(2 * k)))
                    cv2.putText(frame, f"{name} {tid if tid is not None else ''} {cf:.0%}",
                                (int(x1), max(15, int(y1) - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5 * k, color, 1)
                    if c in swiftlet_ids:
                        birds_now += 1
                        n_det += 1
                        if tid is not None:
                            track_ids.add(tid)
                    if c in swiftlet_ids and tid is not None:
                        event = counter.update(tid, ((x1 + x2) / 2, (y1 + y2) / 2), frame_no)
                        if event:
                            event_id = str(uuid4())
                            vt = round(frame_no / src_fps, 2) if src_fps else ""
                            ev_csv.writerow([frame_no, vt, event, tid, counter.in_count,
                                             counter.out_count, counter.current])
                            ev_file.flush()
                            if use_state:
                                write_state(st_path, counter, active_date)
                            print(f"[{event}] id={tid} t={vt}s  IN={counter.in_count} "
                                  f"OUT={counter.out_count} CON LAI={counter.current}")
                            pub.publish("count", {
                                "eventId": event_id, "event": event, "trackId": tid, "in": counter.in_count,
                                "out": counter.out_count, "current": counter.current,
                                "ts": datetime.now(VIETNAM_TZ).isoformat()})
            frames_with_bird += 1 if birds_now else 0
            counter.prune(frame_no)

            # ---- canh bao thu san moi (nguong tung loai, loc hop bao nho, can khung lien tiep, cooldown)
            now = time.time()
            for al in pflt.update(pred_dets, tnow):
                real = orig_name.get(al["class"], al["class"])
                snap = Path(args.snapshot_dir) / f"{al['class']}_{datetime.now(VIETNAM_TZ):%Y%m%d_%H%M%S}.jpg"
                cv2.imwrite(str(snap), frame)
                event_id = str(uuid4())
                print(f"[CANH BAO] Phat hien {real} ({al['confidence']:.0%}) -> {snap.name}")
                pub.publish("alert", {
                    "eventId": event_id, "type": "predator", "class": real,
                    "confidence": round(al["confidence"], 3), "snapshotKey": None,
                    "ts": datetime.now(VIETNAM_TZ).isoformat()})
                if snapshot_storage:
                    def image_uploaded(key, eid=event_id):
                        pub.publish("alert-image", {"eventId": eid, "snapshotKey": key,
                                                    "ts": datetime.now(VIETNAM_TZ).isoformat()})

                    def image_failed(exc, eid=event_id):
                        print(f"[S3] Upload alert {eid} loi, giu anh local de retry: {exc}")

                    snapshot_storage.submit(snap, args.camera_id, event_id, image_uploaded, image_failed)

            # ---- ve vach + HUD
            ip1 = (int(counter.p1[0]), int(counter.p1[1]))
            ip2 = (int(counter.p2[0]), int(counter.p2[1]))
            cv2.line(frame, ip1, ip2, (0, 255, 255), max(2, int(2 * k)))
            cv2.circle(frame, ip1, int(6 * k), (0, 255, 255), -1)
            cv2.circle(frame, ip2, int(6 * k), (0, 255, 255), -1)
            mx, my = (counter.p1[0] + counter.p2[0]) / 2, (counter.p1[1] + counter.p2[1]) / 2
            nx = -counter._dy / counter._len * counter.in_side
            ny = counter._dx / counter._len * counter.in_side
            cv2.arrowedLine(frame, (int(mx), int(my)), (int(mx + nx * 50 * k), int(my + ny * 50 * k)),
                            (0, 255, 0), max(2, int(3 * k)), tipLength=0.35)    # mui ten = huong VAO
            cv2.putText(frame, "IN", (int(mx + nx * 60 * k) + 6, int(my + ny * 60 * k)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7 * k, (0, 255, 0), 2)
            for st in counter.tracks.values():
                if len(st.trail) > 1:
                    cv2.polylines(frame, [np.array(st.trail, dtype=np.int32)], False, (255, 200, 0), 1)
            dt = now - t_prev
            t_prev = now
            fps = 0.9 * fps + 0.1 * (1 / dt) if dt > 0 else fps
            cv2.putText(frame, f"IN {counter.in_count}  OUT {counter.out_count}  CON LAI {counter.current}"
                        f"  FPS {fps:.1f}", (10, int(30 * k)), cv2.FONT_HERSHEY_SIMPLEX, 0.8 * k,
                        (0, 255, 255), max(2, int(2 * k)))
            cv2.putText(frame, f"Chim thay: {birds_now} | ID da theo doi: {len(track_ids)}",
                        (10, int(62 * k)), cv2.FONT_HERSHEY_SIMPLEX, 0.6 * k, (255, 255, 255), 2)

            if now - last_hb > 10:
                last_hb = now
                pub.publish("heartbeat", {"fps": round(fps, 1), "in": counter.in_count,
                                          "out": counter.out_count, "current": counter.current,
                                          "ts": datetime.now(VIETNAM_TZ).isoformat()}, qos=0)

            if not args.headless:
                s = fit_scale(w, h)
                dw, dh = int(w * s), int(h * s)
                if bar_size != (dw, dh):
                    bar_ref[0] = ActionBar(dw, dh, [("line", "VE LAI VACH", (170, 110, 20)),
                                                    ("reset", "RESET IN/OUT", (30, 120, 210)),
                                                    ("quit", "THOAT", (60, 60, 170))])
                    bar_size = (dw, dh)
                    cv2.namedWindow(WIN, cv2.WINDOW_AUTOSIZE)
                    cv2.setMouseCallback(WIN, on_mouse)
                cv2.imshow(WIN, bar_ref[0].render(cv2.resize(frame, (dw, dh)) if s < 1 else frame))
                key = cv2.waitKey(1) & 0xFF
                shown += 1
                action = pending.pop(0) if pending else None
                pending.clear()
                if key == ord("q"):
                    action = "quit"
                elif key == ord("r"):
                    action = "reset"
                elif key == ord("l"):
                    action = "line"
                if shown > 10:
                    try:
                        if cv2.getWindowProperty(WIN, cv2.WND_PROP_VISIBLE) < 1:   # bam dau X
                            action = "quit"
                    except cv2.error:
                        action = "quit"

                if action == "quit":
                    break
                if action == "reset":
                    counter.initial_count = counter.current      # giu tong con lai, chi xoa IN/OUT
                    counter.reset()
                    if use_state:
                        write_state(st_path, counter, active_date)
                    print(f"Da dat lai IN/OUT. Tong con lai giu nguyen = {counter.current}")
                if action == "line":                              # ve lai vach NGAY TRONG LUC CHAY
                    cfg = edit_line(raw, init=line_cfg)
                    if cfg:
                        line_cfg = cfg
                        save_line(args.camera_id, cfg)
                        counter.set_line((cfg["p1"][0] * w, cfg["p1"][1] * h),
                                         (cfg["p2"][0] * w, cfg["p2"][1] * h))
                        counter.in_side = cfg["in_side"]
                        counter.tracks.clear()                    # tranh dem nham do doi vach
                        print("Da cap nhat vach ao.")
                    t_prev = time.time()
            acc["loop_ms"] += (time.perf_counter() - t_loop0) * 1000
    except KeyboardInterrupt:
        pass
    finally:
        elapsed = max(time.time() - t_start, 1e-6)
        resources = mon.stop() if mon else {}
        if reader:
            reader.stop()
        if cap:
            cap.release()
        ev_file.close()
        det_file.close()
        if counter:
            if use_state:
                write_state(st_path, counter, active_date)
            n = max(n_proc, 1)
            perf = {"ms_preprocess": round(acc["preprocess"] / n, 2),
                    "ms_inference": round(acc["inference"] / n, 2),
                    "ms_postprocess": round(acc["postprocess"] / n, 2),
                    "ms_track_total": round(acc["track_ms"] / n, 2),   # gom ca ByteTrack
                    "ms_loop": round(acc["loop_ms"] / n, 2)}           # ca ve + hien thi
            (PROJECT / "data" / "last_run.json").write_text(json.dumps({
                "in": counter.in_count, "out": counter.out_count, "current": counter.current,
                "frames_read": frame_no, "frames_processed": n_proc,
                "avg_fps": round(n_proc / elapsed, 2), "source": str(source),
                "swiftlet_detections": n_det, "frames_with_swiftlet": frames_with_bird,
                "unique_track_ids": len(track_ids), "device": device_label, "half": use_half,
                "imgsz": args.imgsz, "perf": perf, "resources": resources}))
            print(f"\nKET QUA: IN={counter.in_count}  OUT={counter.out_count}  CON LAI={counter.current}")
            print(f"Hieu nang: FPS trung binh={n_proc / elapsed:.1f} tren {device_label} | moi khung: "
                  f"tien xu ly {perf['ms_preprocess']}ms + suy luan {perf['ms_inference']}ms + "
                  f"hau xu ly {perf['ms_postprocess']}ms (track gom ByteTrack: {perf['ms_track_total']}ms, "
                  f"ca vong lap: {perf['ms_loop']}ms)")
            print("Tai nguyen:", format_summary(resources))
            print(f"Chan doan: thay chim o {frames_with_bird}/{n_proc} khung, {len(track_ids)} ID.")
            if n_det == 0:
                print("-> Model KHONG thay chim nao: kiem tra --conf-swiftlet, model, chat luong/goc video.")
            elif counter.in_count + counter.out_count == 0:
                print("-> Co thay chim nhung khong con nao cat vach: kiem tra vach co nam tren duong bay khong"
                      " (bam VE LAI VACH).")
        pub.close()
        if snapshot_storage:
            snapshot_storage.close()
        if not args.headless:
            try:
                cv2.destroyAllWindows()
            except cv2.error:        # opencv-python-headless khong co GUI
                pass


if __name__ == "__main__":
    main()
