#!/usr/bin/env python3
"""Unit tests for cross-platform auto-config, USB provisioning, and UDP broker discovery."""
from __future__ import annotations

import json
import socket
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT))

import setup_local_config as slc
import usb_provisioner as usb_prov
import start_system as ss


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
        import urllib.request
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


if __name__ == "__main__":
    unittest.main()
