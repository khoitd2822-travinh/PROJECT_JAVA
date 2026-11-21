import unittest

from alerts import PredatorFilter, parse_conf_map


def f(**kw):
    kw.setdefault("min_area_ratio", 0.001)
    return PredatorFilter(streak_needed=3, cooldown_s=30, **kw)


def run(flt, frames, t0=0.0, dt=0.04):
    alerts = []
    for i, dets in enumerate(frames):
        alerts += flt.update(dets, t0 + i * dt)
    return alerts


OWL = ("Owl", 0.8, 0.01)


class AlertTest(unittest.TestCase):
    def test_needs_three_consecutive_frames(self):
        self.assertEqual(run(f(), [[OWL], [OWL], []]), [])
        self.assertEqual(len(run(f(), [[OWL]] * 3)), 1)

    def test_gap_resets_streak(self):
        self.assertEqual(run(f(), [[OWL], [OWL], [], [OWL], [OWL]]), [])

    def test_conf_threshold_default_and_per_class(self):
        low = ("Owl", 0.55, 0.01)
        self.assertEqual(len(run(f(default_conf=0.5), [[low]] * 3)), 1)
        self.assertEqual(run(f(default_conf=0.5, conf_by_class={"owl": 0.7}), [[low]] * 3), [])
        rat = ("Rat", 0.55, 0.01)       # loai khac van dung nguong mac dinh
        self.assertEqual(len(run(f(default_conf=0.5, conf_by_class={"owl": 0.7}), [[rat]] * 3)), 1)

    def test_min_area_filters_tiny_boxes(self):
        tiny = ("Snake", 0.9, 0.0001)
        self.assertEqual(run(f(), [[tiny]] * 5), [])

    def test_cooldown(self):
        flt = f()
        a = run(flt, [[OWL]] * 10)                       # ~0.4s: chi 1 canh bao
        self.assertEqual(len(a), 1)
        b = run(flt, [[OWL]] * 3, t0=31.0)               # sau 31s -> bao lai
        self.assertEqual(len(b), 1)

    def test_classes_independent(self):
        rat = ("Rat", 0.8, 0.01)
        a = run(f(), [[OWL, rat]] * 3)
        self.assertEqual({x["class"] for x in a}, {"owl", "rat"})

    def test_reset_streaks_and_min_threshold(self):
        flt = f(default_conf=0.6, conf_by_class={"owl": 0.4})
        self.assertAlmostEqual(flt.min_threshold(), 0.4)
        flt.update([OWL], 0); flt.update([OWL], 0.04)
        flt.reset_streaks()
        self.assertEqual(flt.update([OWL], 0.08), [])

    def test_parse_conf_map(self):
        self.assertEqual(parse_conf_map("owl=0.6, Rat=0.5"), {"owl": 0.6, "rat": 0.5})
        self.assertEqual(parse_conf_map(""), {})
        with self.assertRaises(ValueError):
            parse_conf_map("owl=1.5")


if __name__ == "__main__":
    unittest.main()