import cv2
import time
import numpy as np
from datetime import datetime
from minio import Minio
import paho.mqtt.client as mqtt

# --- 1. CẤU HÌNH KẾT NỐI ---
# Để số 0 nếu test bằng webcam laptop, hoặc điền URL stream của ESP32-CAM từ TV2
ESP32_CAM_STREAM_URL = 0 

# Cấu hình MinIO (Khớp với hệ thống Docker của nhóm)
MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "accessKey1"
MINIO_SECRET_KEY = "verySecretKey1"
MINIO_BUCKET_NAME = "swiftlet-alerts"

# Cấu hình MQTT Broker
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC_ALERT = "swiftlet/alert/pest"

# Khởi tạo Minio Client
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

# Đảm bảo bucket tồn tại trên MinIO
if not minio_client.bucket_exists(MINIO_BUCKET_NAME):
    minio_client.make_bucket(MINIO_BUCKET_NAME)

# Khởi tạo MQTT Client
mqtt_client = mqtt.Client()
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
mqtt_client.loop_start()

def upload_snapshot_to_minio(file_path, object_name):
    """Hàm upload ảnh snapshot lên MinIO S3"""
    try:
        minio_client.fput_object(
            MINIO_BUCKET_NAME, object_name, file_path,
            content_type="image/jpeg"
        )
        print(f"[MinIO] Upload thành công ảnh: {object_name}")
        return True
    except Exception as e:
        print(f"[MinIO Error] Lỗi upload: {e}")
        return False

def send_mqtt_alert(pest_type, image_url):
    """Hàm bắn tín hiệu cảnh báo khẩn cấp qua MQTT"""
    payload = f'{{"deviceId": "esp32_cam_01", "pestType": "{pest_type}", "timestamp": "{datetime.now().isoformat()}", "snapshotUrl": "{image_url}"}}'
    mqtt_client.publish(MQTT_TOPIC_ALERT, payload)
    print(f"[MQTT] Đã gửi cảnh báo khẩn cấp: {payload}")

def run_cv_pipeline():
    print(f"[TV4 Pipeline] Đang kết nối tới nguồn video...")
    cap = cv2.VideoCapture(ESP32_CAM_STREAM_URL)

    if not cap.isOpened():
        print("[Error] Không thể kết nối tới nguồn video! Vui lòng kiểm tra lại cấu hình.")
        return

    last_alert_time = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[Warning] Mất khung hình, đang thử kết nối lại...")
            time.sleep(2)
            cap = cv2.VideoCapture(ESP32_CAM_STREAM_URL)
            continue

        detected = False
        pest_name = "Rat" # Giả lập loại thú hại (Cú, Rắn, Chuột)
        
        h, w, _ = frame.shape
        x1, y1, x2, y2 = int(w * 0.3), int(h * 0.3), int(w * 0.7), int(h * 0.7)
        
        key = cv2.waitKey(1) & 0xFF
        # Nhấn phím 's' trên bàn phím để giả lập phát hiện thú hại và test kịch bản
        if key == ord('s'): 
            detected = True

        if detected:
            current_time = time.time()
            if current_time - last_alert_time > 10:
                print(f"[AI Detection] Phát hiện thú hại: {pest_name}!")
                
                # Vẽ khung Bounding Box và nhãn cảnh báo lên ảnh
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                cv2.putText(frame, f"WARNING: {pest_name} (98%)", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                
                # Lưu file ảnh tạm xuống thư mục hiện tại
                filename = f"pest_{pest_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                cv2.imwrite(filename, frame)
                
                # Đẩy lên MinIO S3
                object_name = f"snapshots/{filename}"
                success = upload_snapshot_to_minio(filename, object_name)
                
                if success:
                    image_url = f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET_NAME}/{object_name}"
                    # Bắn MQTT Alert về Server
                    send_mqtt_alert(pest_name, image_url)
                
                last_alert_time = current_time

        # Hiển thị cửa sổ video trực tiếp
        cv2.imshow("SwiftletCare - TV4 AI Pipeline (Press 's' to test)", frame)

        # Nhấn phím 'q' để thoát chương trình
        if key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    mqtt_client.loop_stop()

if __name__ == "__main__":
    run_cv_pipeline()