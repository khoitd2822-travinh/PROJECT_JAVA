import unittest
from counter import VirtualLineCounter
from state import resolve


def make(**kw):
    # vach ngang y=100, rong 200; phia duong = ben duoi
    return VirtualLineCounter((0, 100), (200, 100), buffer_px=10, cooldown_frames=5, **kw)


def walk(c, tid, ys, start=0, x=50):
    events = []
    for i, y in enumerate(ys):
        e = c.update(tid, (x, y), start + i)
        if e:
            events.append(e)
    return events


class CounterTest(unittest.TestCase):
    def test_in_top_to_bottom(self):
        c = make(in_side=1)
        self.assertEqual(walk(c, 1, [60, 80, 95, 105, 120, 140]), ["IN"])
        self.assertEqual((c.in_count, c.out_count), (1, 0))

    def test_out_bottom_to_top(self):
        c = make(in_side=1)
        self.assertEqual(walk(c, 1, [140, 120, 100, 80, 60]), ["OUT"])

    def test_reverse_direction_config(self):
        c = make(in_side=-1)
        self.assertEqual(walk(c, 1, [60, 80, 120, 140]), ["OUT"])

    def test_jitter_in_buffer_not_counted(self):
        c = make()
        self.assertEqual(walk(c, 1, [60, 95, 105, 97, 103, 99, 70]), [])

    def test_fly_out_then_back_in_same_id(self):
        c = make(in_side=1)
        ev = walk(c, 1, [60, 140])                 # IN
        ev += walk(c, 1, [140, 140, 140, 140, 140, 140, 60], start=2)  # qua cooldown -> OUT
        self.assertEqual(ev, ["IN", "OUT"])

    def test_cooldown_blocks_flicker(self):
        c = make()
        ev = walk(c, 1, [60, 140, 60, 140])        # lat qua lat lai trong cooldown
        self.assertEqual(ev, ["IN"])

    def test_first_seen_beyond_line_not_counted(self):
        c = make()
        self.assertEqual(walk(c, 1, [150, 160, 170]), [])

    def test_two_birds_independent(self):
        c = make()
        walk(c, 1, [60, 140])
        walk(c, 2, [140, 60])
        self.assertEqual((c.in_count, c.out_count), (1, 1))

    def test_current_and_prune(self):
        c = make(initial_count=100)
        walk(c, 1, [60, 140])
        self.assertEqual(c.current, 101)
        c.prune(10_000)
        self.assertEqual(len(c.tracks), 0)


class SegmentAndStateTest(unittest.TestCase):
    def test_bird_outside_segment_not_counted(self):
        c = make()                                   # vach x:0..200
        self.assertEqual(walk(c, 1, [60, 140], x=500), [])   # bay vong ngoai hai dau vach
        self.assertEqual(walk(c, 2, [60, 140], x=210), ["IN"])  # lech nho trong margin van tinh

    def test_state_same_day(self):
        saved = {"date": "2026-10-28", "initial": 100, "in": 5, "out": 2, "current": 103}
        self.assertEqual(resolve(saved, "2026-10-28", None), (100, 5, 2))

    def test_state_new_day_carries_remaining(self):
        saved = {"date": "2026-10-27", "initial": 100, "in": 5, "out": 2, "current": 103}
        self.assertEqual(resolve(saved, "2026-10-28", None), (103, 0, 0))

    def test_state_cli_override_and_empty(self):
        saved = {"date": "2026-10-28", "initial": 100, "in": 5, "out": 2, "current": 103}
        self.assertEqual(resolve(saved, "2026-10-28", 500), (500, 5, 2))
        self.assertEqual(resolve(None, "2026-10-28", None), (0, 0, 0))


if __name__ == "__main__":
    unittest.main()