"""Best-effort asynchronous snapshot upload to an S3-compatible service."""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

VIETNAM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class SnapshotStorage:
    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str,
                 secure: bool = False) -> None:
        from minio import Minio
        self.client = Minio(endpoint.removeprefix("http://").removeprefix("https://"),
                            access_key=access_key, secret_key=secret_key,
                            secure=secure or endpoint.startswith("https://"))
        self.bucket = bucket
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="snapshot-upload")

    @classmethod
    def from_environment(cls):
        endpoint = os.getenv("S3_ENDPOINT")
        access_key = os.getenv("S3_ACCESS_KEY")
        secret_key = os.getenv("S3_SECRET_KEY")
        bucket = os.getenv("S3_BUCKET")
        if not all((endpoint, access_key, secret_key, bucket)):
            return None
        return cls(endpoint, access_key, secret_key, bucket,
                   os.getenv("S3_SECURE", "false").lower() == "true")

    def submit(self, image_path: Path, camera_id: str, event_id: str, on_success, on_failure) -> str:
        day = datetime.now(VIETNAM_TZ).date().isoformat()
        key = f"alerts/{day}/{camera_id}/{event_id}.jpg"

        def upload():
            try:
                if not self.client.bucket_exists(self.bucket):
                    self.client.make_bucket(self.bucket)
                self.client.fput_object(self.bucket, key, str(image_path), content_type="image/jpeg")
                on_success(key)
            except Exception as exc:
                on_failure(exc)

        self.executor.submit(upload)
        return key

    def close(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=False)
