import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2


class AnnotatedStreamServer:
    def __init__(self, host="127.0.0.1", port=8090):
        self.host = host
        self.port = port
        self._condition = threading.Condition()
        self._jpeg = None
        self._sequence = 0
        self._updated_at = 0.0
        self._running = False
        self._server = None
        self._thread = None

    def start(self):
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                path = self.path.split("?", 1)[0]

                with owner._condition:
                    age = time.monotonic() - owner._updated_at
                    ready = owner._jpeg is not None and age < 10
                    sequence = owner._sequence

                if path == "/health":
                    body = json.dumps({
                        "ready": ready,
                        "frames": sequence,
                    }).encode()

                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return

                if path != "/stream":
                    self.send_error(404)
                    return

                if not ready:
                    self.send_error(503, "Waiting for AI frames")
                    return

                self.connection.settimeout(5)
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    "multipart/x-mixed-replace; boundary=frame",
                )
                self.send_header("Cache-Control", "no-store")
                self.end_headers()

                last_sequence = -1

                try:
                    while True:
                        with owner._condition:
                            owner._condition.wait_for(
                                lambda: not owner._running
                                or owner._sequence != last_sequence,
                                timeout=10,
                            )

                            if (
                                not owner._running
                                or owner._sequence == last_sequence
                                or time.monotonic() - owner._updated_at >= 10
                            ):
                                break

                            jpeg = owner._jpeg
                            last_sequence = owner._sequence

                        self.wfile.write(
                            b"--frame\r\nContent-Type: image/jpeg\r\n"
                            + f"Content-Length: {len(jpeg)}\r\n\r\n".encode()
                            + jpeg
                            + b"\r\n"
                        )
                        self.wfile.flush()

                except OSError:
                    pass

                finally:
                    self.close_connection = True

        self._server = ThreadingHTTPServer(
            (self.host, self.port), Handler
        )
        self._server.daemon_threads = True
        self.port = self._server.server_port
        self._running = True

        self._thread = threading.Thread(
            target=self._server.serve_forever,
            daemon=True,
        )
        self._thread.start()

    def update_frame(self, frame):
        ok, encoded = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, 80],
        )

        if ok:
            with self._condition:
                self._jpeg = encoded.tobytes()
                self._sequence += 1
                self._updated_at = time.monotonic()
                self._condition.notify_all()

    def stop(self):
        with self._condition:
            self._running = False
            self._condition.notify_all()

        if self._thread is not None and self._thread.is_alive():
            self._server.shutdown()
            self._thread.join(timeout=2)

        if self._server is not None:
            self._server.server_close()