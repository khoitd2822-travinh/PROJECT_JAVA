import unittest

import cv2
import numpy as np

from line_ui import LineEditor

D, U, M = cv2.EVENT_LBUTTONDOWN, cv2.EVENT_LBUTTONUP, cv2.EVENT_MOUSEMOVE


def editor(init=None):
    frame = np.full((480, 640, 3), 120, np.uint8)
    return LineEditor(frame, init)


def click(ed, x, y):
    ed.on_mouse(D, x, y)
    ed.on_mouse(U, x, y)


def press(ed, key):
    x1, y1, x2, y2 = ed.bar.rects[key]
    click(ed, (x1 + x2) // 2, (y1 + y2) // 2)


class LineEditorTest(unittest.TestCase):
    def test_two_clicks_then_save(self):
        ed = editor()
        click(ed, 100, 200); click(ed, 500, 200)
        self.assertEqual(len(ed.pts), 2)
        press(ed, "save")
        self.assertEqual(ed.result, "save")
        c = ed.config()
        self.assertAlmostEqual(c["p1"][0], 100 / 640); self.assertAlmostEqual(c["p2"][1], 200 / 480)
        self.assertEqual(c["in_side"], 1)

    def test_flip_and_redo_buttons(self):
        ed = editor()
        click(ed, 100, 200); click(ed, 500, 200)
        press(ed, "flip"); self.assertEqual(ed.in_side, -1)
        press(ed, "redo"); self.assertEqual(ed.pts, [])

    def test_click_on_bar_does_not_add_point(self):
        ed = editor()
        click(ed, 5, ed.h + 3)               # vung thanh nut, khong trung nut nao
        self.assertEqual(ed.pts, [])

    def test_save_without_line_is_refused(self):
        ed = editor()
        press(ed, "save")
        self.assertIsNone(ed.result); self.assertTrue(ed.msg)

    def test_drag_endpoint(self):
        ed = editor()
        click(ed, 100, 200); click(ed, 500, 200)
        ed.on_mouse(D, 102, 203)              # gan diem 1 -> bat de keo
        ed.on_mouse(M, 150, 260); ed.on_mouse(U, 150, 260)
        self.assertEqual(ed.pts[0], (150.0, 260.0))
        self.assertEqual(ed.pts[1], (500.0, 200.0))

    def test_click_away_after_two_points_does_not_move_line(self):
        ed = editor()
        click(ed, 100, 200); click(ed, 500, 200)
        click(ed, 300, 400)
        self.assertEqual(len(ed.pts), 2); self.assertTrue(ed.msg)

    def test_edit_existing_line_and_cancel(self):
        ed = editor({"p1": [0.1, 0.5], "p2": [0.9, 0.5], "in_side": -1})
        self.assertEqual(ed.in_side, -1); self.assertEqual(len(ed.pts), 2)
        press(ed, "cancel"); self.assertEqual(ed.result, "cancel")

    def test_in_arrow_points_into_house(self):
        ed = editor()
        click(ed, 100, 200); click(ed, 500, 200)   # trai -> phai: phia duong = ben duoi
        self.assertAlmostEqual(ed._normal()[1], 1.0)
        press(ed, "flip"); self.assertAlmostEqual(ed._normal()[1], -1.0)

    def test_render_shapes(self):
        ed = editor()
        self.assertEqual(ed.render().shape, (ed.h + ed.bar.bar_h, ed.w, 3))
        click(ed, 100, 200); click(ed, 500, 250)
        self.assertEqual(ed.render().shape, (ed.h + ed.bar.bar_h, ed.w, 3))


if __name__ == "__main__":
    unittest.main()