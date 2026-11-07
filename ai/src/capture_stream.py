
import cv2
import time
import threading
from collections import deque


#  CAU HINH 
# 0: webcam laptop mac dinh
CAMERA_SOURCE = 0

# Khi co ESP32-CAM, thay bang URL stream thuc te
# CAMERA_SOURCE = "http://192.168.1.100:81/stream"

FRAME_WIDTH = 640
FRAME_HEIGHT = 480
WINDOW_NAME = "SwiftletCare - Camera Stream"


# DOC LUONG VIDEO 

class VideoStream:
    def __init__(self, source):
        self.source = source
        self.cap = None
        self.latest_frame = None
        self.lock = threading.Lock()
        self.running = False
        self.thread = None

    def start(self):
        self.cap = cv2.VideoCapture(self.source)

        if not self.cap.isOpened():
            raise RuntimeError(
                f"Khong mo duoc camera hoac stream: {self.source}"
            )

        # Giam bo dem neu backend camera ho tro
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if isinstance(self.source, int):
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

        self.running = True
        self.thread = threading.Thread(
            target=self._reader,
            daemon=True
        )
        self.thread.start()
        return self

    def _reader(self):
        # Lien tuc doc frame va chi giu frame moi nhat
        while self.running:
            ok, frame = self.cap.read()

            if not ok:
                time.sleep(0.02)
                continue

            with self.lock:
                self.latest_frame = frame

    def read(self):
        with self.lock:
            if self.latest_frame is None:
                return None
            return self.latest_frame.copy()

    def stop(self):
        self.running = False

        if self.thread is not None:
            self.thread.join(timeout=2)

        if self.cap is not None:
            self.cap.release()
            self.cap = None


#  KHUNG TICH HOP YOLO 

def detect_objects(frame, model=None):
    """
    Ham cho phep tich hop YOLO sau nay.
    Hien tai chi tra ve frame goc.
    """
    if model is not None:
        results = model(frame, verbose=False)
        frame = results[0].plot()

    return frame


#  CHUONG TRINH CHINH 

def main():
    stream = None
    fps_history = deque(maxlen=30)

    try:
        stream = VideoStream(CAMERA_SOURCE).start()
        print("Da mo camera thanh cong.")
        print("Nhan Q hoac ESC de thoat.")

        previous_time = time.perf_counter()

        while True:
            frame = stream.read()

            if frame is None:
                time.sleep(0.01)
                continue

            current_time = time.perf_counter()
            elapsed = current_time - previous_time
            previous_time = current_time

            if elapsed > 0:
                fps_history.append(1.0 / elapsed)

            fps = sum(fps_history) / len(fps_history)

            #truyen model: hien thi video goc
            frame = detect_objects(frame)

            cv2.putText(
                frame,
                f"FPS: {fps:.1f}",
                (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
                cv2.LINE_AA
            )

            cv2.putText(
                frame,
                "Q/ESC: Quit",
                (15, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

            cv2.imshow(WINDOW_NAME, frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q") or key == 27:
                break

    except Exception as error:
        print("Loi:", error)

    finally:
        if stream is not None:
            stream.stop()

        cv2.destroyAllWindows()
        print("Da dong camera.")


if __name__ == "__main__":
    main()
