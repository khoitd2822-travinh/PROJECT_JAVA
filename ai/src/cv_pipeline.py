"""
Legacy Week-4 interactive pest-alert test helper.

For full production Edge AI (YOLO bird counting + predator detection + alerts),
use ``main.py``. This script is kept for manual smoke testing with an aligned
S3/MQTT environment configuration (no import-time network side effects).
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import cv2
import paho.mqtt.client as mqtt
from minio import Minio

from state import VIETNAM_TZ


def _normalize_endpoint(raw: str) -> str:
    return raw.removeprefix("http://").removeprefix("https://").rstrip("/")


def _load_config() -> dict[str, object]:
    raw_source = os.environ.get("ESP32_CAM_STREAM_URL", "0")
    source: int | str = int(raw_source) if raw_source.isdigit() else raw_source
    s3_endpoint = os.environ.get("S3_ENDPOINT", "http://localhost:9000")
    return {
        "source": source,
        "s3_endpoint": _normalize_endpoint(s3_endpoint),
        "s3_secure": os.environ.get("S3_SECURE", "").lower() == "true" or s3_endpoint.startswith("https://"),
        "s3_access_key": os.environ.get("S3_ACCESS_KEY", "123"),
        "s3_secret_key": os.environ.get("S3_SECRET_KEY", "abc"),
        "s3_bucket": os.environ.get("S3_BUCKET", "swiftlet-alerts"),
        "mqtt_host": os.environ.get("MQTT_HOST", "localhost"),
        "mqtt_port": int(os.environ.get("MQTT_PORT", "1883")),
        "house_id": os.environ.get("HOUSE_ID", "house-01"),
        "camera_id": os.environ.get("CAMERA_ID", "cam-01"),
    }


def upload_snapshot_to_minio(minio_client: Minio, bucket: str, file_path: Path, object_name: str) -> bool:
    """Upload snapshot JPEG to S3/MinIO bucket."""
    try:
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)
        minio_client.fput_object(bucket, object_name, str(file_path), content_type="image/jpeg")
        print(f"[S3] Upload thanh cong anh: {object_name}")
        return True
    except Exception as exc:
        print(f"[S3 Error] Loi upload: {exc}")
        return False


def send_mqtt_alert(
    mqtt_client: mqtt.Client,
    topic: str,
    pest_type: str,
    event_id: str,
    snapshot_key: str | None,
) -> None:
    """Publish predator alert payload matching docs/mqtt-topics.md contract."""
    payload = {
        "eventId": event_id,
        "type": "predator",
        "class": pest_type.lower(),
        "confidence": 0.98,
        "snapshotKey": snapshot_key,
        "ts": datetime.now(VIETNAM_TZ).isoformat(),
    }
    mqtt_client.publish(topic, json.dumps(payload), qos=1)
    print(f"[MQTT] Da gui canh bao ({topic}): {payload}")


def run_cv_pipeline() -> None:
    cfg = _load_config()

    minio_client = Minio(
        str(cfg["s3_endpoint"]),
        access_key=str(cfg["s3_access_key"]),
        secret_key=str(cfg["s3_secret_key"]),
        secure=bool(cfg["s3_secure"]),
    )

    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqtt_client.connect(str(cfg["mqtt_host"]), int(cfg["mqtt_port"]), 60)
    mqtt_client.loop_start()

    alert_topic = f"swiftletcare/{cfg['house_id']}/{cfg['camera_id']}/alert"
    print(f"[AI Smoke Test] Dang ket noi nguon video: {cfg['source']}")
    cap = cv2.VideoCapture(cfg["source"])

    if not cap.isOpened():
        print("[Error] Khong the ket noi toi nguon video! Vui long kiem tra lai cau hinh.")
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        return

    last_alert_time = 0.0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("[Warning] Mat khung hinh, dang thu ket noi lai...")
                time.sleep(2)
                cap.release()
                cap = cv2.VideoCapture(cfg["source"])
                continue

            pest_name = "Rat"
            h, w, _ = frame.shape
            x1, y1, x2, y2 = int(w * 0.3), int(h * 0.3), int(w * 0.7), int(h * 0.7)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("s"):
                current_time = time.time()
                if current_time - last_alert_time > 10:
                    print(f"[AI Detection] Phat hien thu hai: {pest_name}")
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(
                        frame,
                        f"WARNING: {pest_name} (98%)",
                        (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 0, 255),
                        2,
                    )
                    event_id = str(uuid4())
                    day = datetime.now(VIETNAM_TZ).date().isoformat()
                    object_name = f"alerts/{day}/{cfg['camera_id']}/{event_id}.jpg"
                    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                        tmp_path = Path(tmp.name)
                    try:
                        cv2.imwrite(str(tmp_path), frame)
                        uploaded = upload_snapshot_to_minio(minio_client, str(cfg["s3_bucket"]), tmp_path, object_name)
                    finally:
                        tmp_path.unlink(missing_ok=True)
                    send_mqtt_alert(
                        mqtt_client,
                        alert_topic,
                        pest_name,
                        event_id,
                        object_name if uploaded else None,
                    )
                    last_alert_time = current_time

            cv2.imshow("SwiftletCare - AI Pipeline Test (Press 's' to simulate, 'q' to quit)", frame)
            if key == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
        mqtt_client.loop_stop()
        mqtt_client.disconnect()


if __name__ == "__main__":
    run_cv_pipeline()
