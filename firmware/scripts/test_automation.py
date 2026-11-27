#!/usr/bin/env python3
"""Unit tests for cross-platform auto-config, USB provisioning, and UDP broker discovery."""
from __future__ import annotations

import http.server
import json
import socket
import socketserver
import sys
import threading
import time
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT))

import env_bootstrap as eb
import setup_local_config as slc
import usb_provisioner as usb_prov
import start_system as ss


class _ThreadedTestServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class AutomationTests(unittest.TestCase):
    def test_virtual_interface_filter(self) -> None:
        self.assertTrue(slc.is_virtual_interface("vEthernet (DockerNAT)"))
        self.assertTrue(slc.is_virtual_interface("Tailscale Tunnel"))
        self.assertFalse(slc.is_virtual_interface("Wi-Fi"))
        self.assertFalse(slc.is_virtual_interface("en0"))

    def test_c_string_escape_roundtrip(self) -> None:
        raw = 'My\\"WiFi\\Pass"123'
        escaped = slc.escape_c(raw)
        self.assertEqual(slc.unescape_c(escaped), raw)

    def test_usb_command_builders_and_parsers(self) -> None:
        id_cmd = usb_prov.build_identify_command()
        self.assertTrue(id_cmd.startswith("__SWIFTLET_CFG__:"))
        self.assertEqual(json.loads(id_cmd.split(":", 1)[1])["cmd"], "IDENTIFY")

        main_cmd = usb_prov.build_config_command(
            role="esp32-main",
            wifi_ssid="TestNet",
            wifi_password="pw\"123",
            broker_host="192.168.1.44",
            broker_port=1883,
        )
        parsed_main = json.loads(main_cmd.split(":", 1)[1])
        self.assertEqual(parsed_main["wifiSsid"], "TestNet")
        self.assertEqual(parsed_main["mqttHost"], "192.168.1.44")
        self.assertEqual(parsed_main["mqttPort"], 1883)

        cam_cmd = usb_prov.build_config_command(
            role="esp32-cam",
            wifi_ssid="TestNet",
            wifi_password="",
            broker_host="192.168.1.44",
        )
        parsed_cam = json.loads(cam_cmd.split(":", 1)[1])
        self.assertNotIn("mqttHost", parsed_cam)

        self.assertEqual(
            usb_prov._extract_ip_from_log("[NET] READY IP=192.168.1.77 STREAM=http://192.168.1.77:81/stream"),
            "192.168.1.77",
        )
        self.assertEqual(usb_prov._extract_ip_from_log("[WiFi] GOT IP: 10.0.0.15"), "10.0.0.15")

    def test_udp_discovery_responder_roundtrip(self) -> None:
        stop_event = threading.Event()
        test_port = 41299
        thread = ss.start_udp_discovery_server("192.168.55.10", 1883, stop_event, discovery_port=test_port)
        self.assertIsNotNone(thread)
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2.0)
            try:
                sock.sendto(b"SWIFTLET_DISCOVER_MQTT", ("127.0.0.1", test_port))
                data, _ = sock.recvfrom(512)
                payload = json.loads(data.decode("utf-8"))
                self.assertEqual(payload["service"], "swiftlet-emqx")
                self.assertEqual(payload["host"], "192.168.55.10")
                self.assertEqual(payload["port"], 1883)
            finally:
                sock.close()
        finally:
            stop_event.set()
            assert thread is not None
            thread.join(timeout=2.0)

    def test_raw_camera_relay_status(self) -> None:
        stop_event = threading.Event()
        relay = ss.start_raw_camera_relay("http://127.0.0.1:65500/stream", stop_event, port=0)
        self.assertIsNotNone(relay)
        server, bound_port = relay  # type: ignore[misc]
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{bound_port}/", timeout=2.0) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(body["mode"], "raw-relay")
        finally:
            stop_event.set()
            server.shutdown()
            server.server_close()

    def test_env_bootstrap_fast_skip_when_present(self) -> None:
        self.assertEqual(eb.modules_missing(("json", "pathlib")), [])
        self.assertIn("definitely_nonexistent_pkg_xyz", eb.modules_missing(("json", "definitely_nonexistent_pkg_xyz")))
        # Da co san json -> skip pip ke ca khi path khong ton tai
        self.assertTrue(eb.ensure_python_requirements(ROOT / "missing-req.txt", ("json",), "test"))

    def test_probe_esp32_cam_stream_loopback(self) -> None:
        class MockCamHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                if self.path == "/status":
                    self.wfile.write(json.dumps({"deviceId": "ESP32_CAM_01", "cameraReady": True, "streamPort": 81}).encode())

            def log_message(self, *_args) -> None:
                pass

        class MockOtherHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())

            def log_message(self, *_args) -> None:
                pass

        srv = _ThreadedTestServer(("127.0.0.1", 0), MockCamHandler)
        other_srv = _ThreadedTestServer(("127.0.0.1", 0), MockOtherHandler)
        port = srv.server_address[1]
        other_port = other_srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        threading.Thread(target=other_srv.serve_forever, daemon=True).start()
        try:
            url = ss.probe_esp32_cam_stream(f"127.0.0.1:{port}", strict_identity=True)
            self.assertEqual(url, f"http://127.0.0.1:{port}:81/stream")
            self.assertIsNone(ss.probe_esp32_cam_stream(f"127.0.0.1:{other_port}", strict_identity=True))
        finally:
            srv.shutdown()
            srv.server_close()
            other_srv.shutdown()
            other_srv.server_close()

    def test_shared_mjpeg_relay_multi_client(self) -> None:
        fake_jpeg = b"\xff\xd8\xff\xe0MOCKJPEG\xff\xd9"
        upstream_conns = 0
        conn_lock = threading.Lock()
        relay_stop = threading.Event()

        class MockUpstreamStream(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                nonlocal upstream_conns
                with conn_lock:
                    upstream_conns += 1
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.end_headers()
                try:
                    while not relay_stop.is_set():
                        part = (
                            f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(fake_jpeg)}\r\n\r\n".encode("ascii")
                            + fake_jpeg
                            + b"\r\n"
                        )
                        self.wfile.write(part)
                        self.wfile.flush()
                        time.sleep(0.05)
                except OSError:
                    pass

            def log_message(self, *_args) -> None:
                pass

        up_srv = _ThreadedTestServer(("127.0.0.1", 0), MockUpstreamStream)
        up_port = up_srv.server_address[1]
        threading.Thread(target=up_srv.serve_forever, daemon=True).start()

        relay = ss.start_raw_camera_relay(f"http://127.0.0.1:{up_port}/stream", relay_stop, port=0)
        self.assertIsNotNone(relay)
        relay_srv, relay_port = relay  # type: ignore[misc]

        def read_until_jpeg(resp) -> bytes:
            buf = bytearray()
            read_fn = getattr(resp, "read1", resp.read)
            for _ in range(32):
                chunk = read_fn(512)
                if not chunk:
                    break
                buf.extend(chunk)
                if fake_jpeg in buf:
                    return bytes(buf)
            return bytes(buf)

        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{relay_port}/stream", timeout=3.0) as c1, \
                 urllib.request.urlopen(f"http://127.0.0.1:{relay_port}/stream", timeout=3.0) as c2:
                self.assertIn(fake_jpeg, read_until_jpeg(c1))
                self.assertIn(fake_jpeg, read_until_jpeg(c2))
                self.assertEqual(upstream_conns, 1)
                with urllib.request.urlopen(f"http://127.0.0.1:{relay_port}/health", timeout=2.0) as h:
                    health = json.loads(h.read().decode("utf-8"))
                    self.assertTrue(health["ready"])
                    self.assertEqual(health["clients"], 2)
        finally:
            relay_stop.set()
            relay_srv.shutdown()
            relay_srv.server_close()
            up_srv.shutdown()
            up_srv.server_close()


if __name__ == "__main__":
    unittest.main()
