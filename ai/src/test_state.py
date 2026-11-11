import tempfile
import unittest
from pathlib import Path

from state import resolve, write_state


class Counter:
    initial_count = 108
    in_count = 12
    out_count = 4
    current = 116


class StateTests(unittest.TestCase):
    def test_same_day_restores_all_counters(self):
        self.assertEqual((108, 12, 4), resolve(
            {"date": "2026-11-10", "initial": 108, "in": 12, "out": 4, "current": 116},
            "2026-11-10", None))

    def test_new_day_preserves_current_and_resets_daily_counts(self):
        self.assertEqual((116, 0, 0), resolve(
            {"date": "2026-11-10", "initial": 108, "in": 12, "out": 4, "current": 116},
            "2026-11-11", None))

    def test_write_is_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            write_state(path, Counter(), "2026-11-10")
            self.assertEqual((108, 12, 4), resolve(__import__("json").loads(path.read_text()), "2026-11-10", None))


if __name__ == "__main__":
    unittest.main()
