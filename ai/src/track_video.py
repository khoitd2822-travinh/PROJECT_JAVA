
import time
import cv2
from ultralytics import YOLO

#  CAU HINH 

# 0 = webcam laptop
# VIDEO_SOURCE = r"D:\Videos\chim_yen.mp4"
VIDEO_SOURCE = r"D:\Videos\chim_yen.mp4"


MODEL_PATH = "yolo11n.pt"

TRACKER_CONFIG = "bytetrack.yaml"
WINDOW_NAME = "SwiftletCare - YOLO + ByteTrack"


def main():
    print("[INFO] Dang tai model:", MODEL_PATH)
    model = YOLO(MODEL_PATH)

    print("[INFO] Dang mo nguon video:", VIDEO_SOURCE)
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    if not cap.isOpened():
        print("[ERROR] Khong mo duoc webcam/video.")
        print("Hay kiem tra webcam hoac duong dan video.")
        return

    # Giam do tre neu nguon la webcam va backend ho tro.
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    previous_time = time.perf_counter()
    fps = 0.0

    print("[INFO] Bat dau tracking bang ByteTrack.")
    print("[INFO] Nhan Q hoac ESC de thoat.")

    try:
        while True:
            success, frame = cap.read()

            if not success:
                print("[INFO] Khong con khung hinh hoac khong doc duoc video.")
                break

            # persist=True giu trang thai tracking qua cac frame.
            results = model.track(
                source=frame,
                persist=True,
                tracker=TRACKER_CONFIG,
                verbose=False
            )

            # YOLO ve bounding box, ten lop va ID neu tracker da gan ID.
            annotated_frame = results[0].plot()

            current_time = time.perf_counter()
            elapsed = current_time - previous_time
            previous_time = current_time

            if elapsed > 0:
                instant_fps = 1.0 / elapsed
                fps = instant_fps if fps == 0 else 0.9 * fps + 0.1 * instant_fps

            cv2.putText(
                annotated_frame,
                f"FPS: {fps:.1f}",
                (15, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
                cv2.LINE_AA
            )

            cv2.imshow(WINDOW_NAME, annotated_frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q") or key == 27:
                break

    except KeyboardInterrupt:
        print("\n[INFO] Da nhan lenh dung chuong trinh.")

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("[INFO] Da dong webcam/video.")


if __name__ == "__main__":
    main()  
