"""Do sai so dem chim: so sanh ket qua chuong trinh (data/last_run.json) voi so DEM TAY.

  python main.py --source video1.mp4 --headless
  python evaluate.py --name video1_sang --gt-in 42 --gt-out 38
  (lap lai cho tung video; moi lan chay se them 1 dong vao data/eval_results.csv va in tong ket)
Doi chieu tung luot dem voi data/events_last.csv (cot video_time_s) de tim luot dem sai.
"""
import argparse
import csv
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
p = argparse.ArgumentParser()
p.add_argument("--name", required=True, help="Ten video/kich ban, vd: video1_sang")
p.add_argument("--gt-in", type=int, required=True, help="So luot VAO dem tay")
p.add_argument("--gt-out", type=int, required=True, help="So luot RA dem tay")
p.add_argument("--run", default=str(DATA / "last_run.json"))
p.add_argument("--csv", default=str(DATA / "eval_results.csv"))
a = p.parse_args()

r = json.loads(Path(a.run).read_text())


def acc(gt, pred):
    return max(0.0, 1 - abs(pred - gt) / gt) if gt else float("nan")


print(f"\n== {a.name} ==")
for n, gt, pr in (("IN", a.gt_in, r["in"]), ("OUT", a.gt_out, r["out"]),
                  ("TONG", a.gt_in + a.gt_out, r["in"] + r["out"])):
    print(f"{n:5} dem tay={gt:4}  AI={pr:4}  sai lech={pr - gt:+4}  chinh xac={acc(gt, pr):.1%}")
print(f"Chenh lech rong IN-OUT: dem tay={a.gt_in - a.gt_out:+}, AI={r['in'] - r['out']:+}  |  FPS TB={r.get('avg_fps')}")

csv_path = Path(a.csv)
new = not csv_path.exists()
with open(csv_path, "a", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    if new:
        w.writerow(["name", "gt_in", "gt_out", "ai_in", "ai_out", "avg_fps"])
    w.writerow([a.name, a.gt_in, a.gt_out, r["in"], r["out"], r.get("avg_fps")])

rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
gi = sum(int(x["gt_in"]) for x in rows); go = sum(int(x["gt_out"]) for x in rows)
pi = sum(int(x["ai_in"]) for x in rows); po = sum(int(x["ai_out"]) for x in rows)
abs_err = sum(abs(int(x["ai_in"]) - int(x["gt_in"])) + abs(int(x["ai_out"]) - int(x["gt_out"])) for x in rows)
print(f"\nTONG HOP {len(rows)} video: dem tay={gi + go} luot, AI={pi + po} luot, "
      f"sai so tuyet doi={abs_err} luot ({abs_err / (gi + go):.1%}), "
      f"IN chinh xac={acc(gi, pi):.1%}, OUT chinh xac={acc(go, po):.1%}")