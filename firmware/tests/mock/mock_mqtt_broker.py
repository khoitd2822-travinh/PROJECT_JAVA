#!/usr/bin/env python3
"""
MQTT giả lập cho kiểm thử tích hợp (Mục 13 - nhiệm vụ của Liêm).

Cho phép chạy kịch bản kiểm thử mà KHÔNG cần board ESP32 thật:
publish các gói tin telemetry / command / status lên broker EMQX,
hoặc dựng một broker MQTT cục bộ riêng để test khi không bật Docker.

Ví dụ:
    # Chạy broker ảo cục bộ (không cần Docker)
    python firmware/tests/mock/mock_mqtt_broker.py --standalone --port 1883

    # Phát gói tin telemetry lên broker đang chạy
    python firmware/tests/mock/mock_mqtt_broker.py --publish telemetry --count 5

    # Kịch bản lỗi: JSON sai, thiếu ID, thiếu số đo
    python firmware/tests/mock/mock_mqtt_broker.py --scenario invalid
"""

import argparse
import json
import os
import socket
import ssl
import struct
import sys
import time
from datetime import datetime, timezone

# Windows console hay dùng cp1258 (viet) khiến print() lỗi UnicodeEncodeError.
# Ép stdout dùng UTF-8 để script chạy được trên cả cmd lẫn PowerShell.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

# ----------------------------------------------------------------------
# Hằng số đồng bộ với firmware/esp32-main/include/mqtt_config.h
# ----------------------------------------------------------------------
MQTT_TENANT = os.environ.get("MQTT_TENANT", "thanhliem")
DEVICE_ID = os.environ.get("DEVICE_ID", "ESP32_MAIN_01")
FARM_ID = 1
ZONE_ID = 1

TOPIC_PREFIX = f"swiftlet/{MQTT_TENANT}/{FARM_ID}/{ZONE_ID}/{DEVICE_ID}"
TOPIC_TELEMETRY = f"{TOPIC_PREFIX}/telemetry"
TOPIC_COMMAND = f"{TOPIC_PREFIX}/command"
TOPIC_RESPONSE = f"{TOPIC_PREFIX}/response"
TOPIC_ALERT = f"{TOPIC_PREFIX}/alert"
TOPIC_STATUS = f"{TOPIC_PREFIX}/status"

DEFAULT_HOST = os.environ.get("MQTT_HOST", "localhost")
DEFAULT_PORT = int(os.environ.get("MQTT_PORT", "1883"))

CONNECT = 0x10
CONNACK = 0x20
PUBLISH = 0x30
PUBACK = 0x40
SUBSCRIBE = 0x80
SUBACK = 0x90
PINGREQ = 0xC0
PINGRESP = 0xD0
DISCONNECT = 0xE0


# ----------------------------------------------------------------------
# Dựng gói tin MQTT
# ----------------------------------------------------------------------
def encode_remaining_length(length: int) -> bytes:
    """Remaining Length biến thiên 1-4 byte theo chuẩn MQTT 3.1.1."""
    out = bytearray()
    while True:
        digit = length % 128
        length //= 128
        if length > 0:
            digit |= 0x80
        out.append(digit)
        if length == 0:
            break
    return bytes(out)


def encode_string(text: str) -> bytes:
    raw = text.encode("utf-8")
    return struct.pack("!H", len(raw)) + raw


def build_connect(client_id: str, keepalive: int = 60) -> bytes:
    """CONNECT: client id + keepalive 2 byte."""
    variable = encode_string(client_id) + struct.pack("!HH", 4, keepalive)
    return bytes([CONNECT]) + encode_remaining_length(len(variable)) + variable


def build_publish(topic: str, payload: bytes, qos: int = 0, retain: bool = False) -> bytes:
    flags = (qos << 1) | (1 if retain else 0)
    variable = encode_string(topic)
    if qos > 0:
        variable += struct.pack("!H", 1)  # packet id
    body = variable + payload
    return bytes([PUBLISH | flags]) + encode_remaining_length(len(body)) + body


def build_subscribe(packet_id: int, topic: str, qos: int = 0) -> bytes:
    variable = struct.pack("!H", packet_id) + encode_string(topic) + bytes([qos])
    return bytes([SUBSCRIBE | 0x02]) + encode_remaining_length(len(variable)) + variable


def build_pingreq() -> bytes:
    return bytes([PINGREQ, 0x00])


def build_disconnect() -> bytes:
    return bytes([DISCONNECT, 0x00])


def read_remaining_length(sock: socket.socket) -> int:
    """Đọc Remaining Length biến thiên 1-4 byte."""
    multiplier = 1
    value = 0
    for _ in range(4):
        chunk = sock.recv(1)
        if not chunk:
            raise ConnectionError("Broker đóng kết nối khi đọc Remaining Length")
        byte = chunk[0]
        value += (byte & 127) * multiplier
        if not byte & 0x80:
            return value
        multiplier *= 128
    raise ValueError("Remaining Length không hợp lệ")


# ----------------------------------------------------------------------
# Client MQTT tối giản
# ----------------------------------------------------------------------
class SimpleMqttClient:
    def __init__(self, host=DEFAULT_HOST, port=DEFAULT_PORT, client_id="mock_device",
                 keepalive=60, use_tls=False):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.keepalive = keepalive
        self.use_tls = use_tls
        self.sock = None
        self._packet_id = 0

    def connect(self, timeout=10.0):
        self.sock = socket.create_connection((self.host, self.port), timeout=timeout)
        if self.use_tls:
            context = ssl.create_default_context()
            self.sock = context.wrap_socket(self.sock, server_hostname=self.host)
        self.sock.sendall(build_connect(self.client_id, self.keepalive))
        header = self.sock.recv(4)
        if len(header) < 2 or (header[0] & 0xF0) != CONNACK:
            raise ConnectionError("Broker không trả lời CONNACK")
        if header[3] != 0:
            raise ConnectionError(f"Broker từ chối kết nối, mã lỗi {header[3]}")
        return True

    def next_packet_id(self):
        self._packet_id = (self._packet_id % 65535) + 1
        return self._packet_id

    def publish(self, topic, payload, qos=0, retain=False):
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        packet = build_publish(topic, payload, qos=qos, retain=retain)
        if qos > 0:
            packet_id = self.next_packet_id()
            variable = encode_string(topic) + struct.pack("!H", packet_id)
            body = variable + payload
            packet = bytes([PUBLISH | (qos << 1)]) + encode_remaining_length(len(body)) + body
        self.sock.sendall(packet)

    def subscribe(self, topic, qos=0):
        packet_id = self.next_packet_id()
        self.sock.sendall(build_subscribe(packet_id, topic, qos))
        return packet_id

    def read_message(self, timeout=5.0):
        """Đọc một PUBLISH. Trả về (topic, payload) hoặc None nếu hết thời gian."""
        self.sock.settimeout(timeout)
        try:
            header = self.sock.recv(1)
            if not header:
                return None
            length = read_remaining_length(self.sock)
            body = b""
            while len(body) < length:
                chunk = self.sock.recv(length - len(body))
                if not chunk:
                    break
                body += chunk
        except socket.timeout:
            return None

        if not header:
            return None
        cmd = header[0] & 0xF0
        if cmd != PUBLISH:
            return None
        qos = (header[0] >> 1) & 0x03
        topic_len = struct.unpack("!H", body[0:2])[0]
        topic = body[2:2 + topic_len].decode("utf-8", errors="replace")
        offset = 2 + topic_len
        if qos > 0:
            offset += 2
        return topic, body[offset:]

    def ping(self):
        self.sock.sendall(build_pingreq())

    def disconnect(self):
        if self.sock:
            try:
                self.sock.sendall(build_disconnect())
            except OSError:
                pass
            self.sock.close()
            self.sock = None


# ----------------------------------------------------------------------
# Broker MQTT tối giản (dùng khi không bật Docker)
# ----------------------------------------------------------------------
class MockMqttBroker:
    """Broker rất đơn giản: nhận CONNECT/PUBLISH/SUBSCRIBE và in ra log.

    Chỉ phục vụ kiểm thử tích hợp, không phải broker production.
    """

    def __init__(self, host="0.0.0.0", port=1883):
        self.host = host
        self.port = port
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind((host, port))
        self.server.listen(5)
        self.running = True
        self.received = []

    def serve_forever(self):
        print(f"[mock-broker] Đang lắng nghe MQTT tại {self.host}:{self.port}")
        while self.running:
            try:
                conn, addr = self.server.accept()
            except OSError:
                break
            print(f"[mock-broker] Client kết nối: {addr[0]}:{addr[1]}")
            try:
                self._handle(conn, addr)
            except Exception as exc:  # noqa: BLE001
                print(f"[mock-broker] Lỗi khi xử lý client: {exc}")
            finally:
                try:
                    conn.close()
                except OSError:
                    pass

    def _handle(self, conn, addr):
        conn.settimeout(60)
        while self.running:
            header = conn.recv(1)
            if not header:
                return
            length = read_remaining_length(conn)
            body = b""
            while len(body) < length:
                chunk = conn.recv(length - len(body))
                if not chunk:
                    return
                body += chunk

            cmd = header[0] & 0xF0

            if cmd == CONNECT:
                conn.sendall(bytes([CONNACK, 0x02, 0x00, 0x00]))
                print("[mock-broker] CONNACK -> client")

            elif cmd == PUBLISH:
                qos = (header[0] >> 1) & 0x03
                retain = header[0] & 0x01
                topic_len = struct.unpack("!H", body[0:2])[0]
                topic = body[2:2 + topic_len].decode("utf-8", errors="replace")
                offset = 2 + topic_len
                packet_id = None
                if qos > 0:
                    packet_id = struct.unpack("!H", body[offset:offset + 2])[0]
                    offset += 2
                payload = body[offset:]
                self.received.append((topic, payload))
                print(f"[mock-broker] PUBLISH topic={topic} qos={qos} retain={retain}")
                print(f"             payload={payload.decode('utf-8', errors='replace')}")
                if qos == 1 and packet_id is not None:
                    conn.sendall(bytes([PUBACK, 0x02]) + struct.pack("!H", packet_id))

            elif cmd == SUBSCRIBE:
                packet_id = struct.unpack("!H", body[0:2])[0]
                conn.sendall(bytes([SUBACK, 0x03, (packet_id >> 8) & 0xFF, packet_id & 0xFF, 0x00]))
                print("[mock-broker] SUBACK -> client")

            elif cmd == PINGREQ:
                conn.sendall(bytes([PINGRESP, 0x00]))
                print("[mock-broker] PINGRESP -> client")

            elif cmd == DISCONNECT:
                print("[mock-broker] Client ngắt kết nối")
                return

    def stop(self):
        self.running = False
        try:
            self.server.close()
        except OSError:
            pass


# ----------------------------------------------------------------------
# Kịch bản kiểm thử
# ----------------------------------------------------------------------
def build_telemetry(index=0, **overrides):
    """Gói tin telemetry đúng chuẩn firmware."""
    payload = {
        "deviceId": DEVICE_ID,
        "farmId": FARM_ID,
        "zoneId": ZONE_ID,
        "temp": round(27.0 + (index % 10) * 0.3, 1),
        "hum": round(70.0 + (index % 5) * 0.5, 1),
        "co2": 500 + (index % 7) * 40,
        "light": 20 + (index % 30),
        "sound": round(60.0 + (index % 6) * 1.5, 1),
        "relays": {"mist": 0, "fan": 0, "heat": 0, "alarm": 0},
    }
    payload.update(overrides)
    return payload


SCENARIOS = {
    "valid": [
        ("telemetry", build_telemetry(0)),
        ("telemetry", build_telemetry(1)),
    ],
    "invalid": [
        ("telemetry", "{ this is not valid json "),
        ("telemetry", "[]"),
        ("telemetry", None),  # payload rong
    ],
    "missing_id": [
        ("telemetry", {"farmId": 1, "zoneId": 1, "temp": 27.0}),
    ],
    "missing_measurement": [
        ("telemetry", {"deviceId": DEVICE_ID, "farmId": 1, "zoneId": 1, "temp": 27.0}),
    ],
    "multi_zone": [
        ("telemetry", build_telemetry(0, farmId=1, zoneId=1)),
        ("telemetry", build_telemetry(1, farmId=2, zoneId=3, deviceId="ESP32_MAIN_02")),
    ],
    "offline": [
        ("status", {"deviceId": DEVICE_ID, "status": "OFFLINE"}),
    ],
}


def run_publish(host, port, kind, count, interval, scenario, use_tls):
    client = SimpleMqttClient(host=host, port=port,
                              client_id=f"mock_{kind}_{int(time.time())}", use_tls=use_tls)
    try:
        client.connect()
        print(f"[mock] Đã kết nối broker {host}:{port}")

        if scenario:
            items = SCENARIOS.get(scenario)
            if items is None:
                print(f"[mock] Không có kịch bản '{scenario}'. "
                      f"Chọn: {', '.join(SCENARIOS)}")
                return 1
            print(f"[mock] Chạy kịch bản: {scenario}")
            for kind, payload in items:
                topic = topic_for(kind)
                body = payload if isinstance(payload, str) else json.dumps(payload)
                if payload is None:
                    body = ""
                client.publish(topic, body)
                print(f"[mock] -> {topic}: {body}")
                time.sleep(0.3)
            return 0

        if kind == "telemetry":
            for i in range(count):
                client.publish(TOPIC_TELEMETRY, json.dumps(build_telemetry(i)))
                print(f"[mock] -> {TOPIC_TELEMETRY} ({i + 1}/{count})")
                time.sleep(interval)
        elif kind == "status":
            client.publish(TOPIC_STATUS, json.dumps({"deviceId": DEVICE_ID, "status": "ONLINE"}),
                           retain=True)
            print(f"[mock] -> {TOPIC_STATUS} ONLINE (retained)")
        elif kind == "command":
            client.publish(TOPIC_COMMAND, json.dumps({
                "command": "RELAY_CONTROL", "target": "fan", "state": 1, "mode": "MANUAL"}))
            print(f"[mock] -> {TOPIC_COMMAND} RELAY_CONTROL fan ON")
        elif kind == "alert":
            client.publish(TOPIC_ALERT, json.dumps({
                "deviceId": DEVICE_ID, "type": "SPEAKER_ANOMALY", "severity": "WARNING",
                "message": "Loa dan du mat tin hieu", "soundDb": 42.0}))
            print(f"[mock] -> {TOPIC_ALERT} SPEAKER_ANOMALY")
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"[mock] Lỗi: {exc}")
        return 1
    finally:
        client.disconnect()


def topic_for(kind):
    return {
        "telemetry": TOPIC_TELEMETRY,
        "command": TOPIC_COMMAND,
        "response": TOPIC_RESPONSE,
        "alert": TOPIC_ALERT,
        "status": TOPIC_STATUS,
    }.get(kind, TOPIC_TELEMETRY)


def run_listen(host, port, topics, timeout, use_tls):
    client = SimpleMqttClient(host=host, port=port,
                              client_id=f"mock_listener_{int(time.time())}", use_tls=use_tls)
    try:
        client.connect()
        print(f"[mock] Đã kết nối broker {host}:{port}")
        for topic in topics:
            client.subscribe(topic)
            print(f"[mock] Subscribe: {topic}")

        deadline = time.time() + timeout
        received = 0
        while time.time() < deadline:
            message = client.read_message(timeout=1.0)
            if message is None:
                continue
            topic, payload = message
            received += 1
            print(f"[mock] <- {topic}: {payload.decode('utf-8', errors='replace')}")
        print(f"[mock] Kết thúc. Nhận được {received} gói tin.")
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"[mock] Lỗi: {exc}")
        return 1
    finally:
        client.disconnect()


def main():
    parser = argparse.ArgumentParser(
        description="MQTT giả lập cho kiểm thử tích hợp mục 13")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Địa chỉ broker")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Cổng broker")
    parser.add_argument("--standalone", action="store_true",
                        help="Chạy broker MQTT giả lập cục bộ (không cần Docker)")
    parser.add_argument("--publish", choices=["telemetry", "command", "status", "alert"],
                        help="Loại gói tin cần phát")
    parser.add_argument("--listen", action="store_true",
                        help="Chế độ lắng nghe và in gói tin nhận được")
    parser.add_argument("--topic", action="append",
                        help="Topic cần subscribe (dùng với --listen)")
    parser.add_argument("--count", type=int, default=5, help="Số gói tin telemetry phát")
    parser.add_argument("--interval", type=float, default=2.0, help="Giây giữa 2 gói tin")
    parser.add_argument("--timeout", type=float, default=30.0, help="Thời gian lắng nghe (giây)")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS),
                        help="Chạy một kịch bản kiểm thử có sẵn")
    parser.add_argument("--tls", action="store_true", help="Dùng TLS")
    parser.add_argument("--print-topics", action="store_true",
                        help="In danh sách topic đang dùng rồi thoát")
    args = parser.parse_args()

    if args.print_topics:
        print("Các topic đang dùng:")
        for name, topic in (("telemetry", TOPIC_TELEMETRY), ("command", TOPIC_COMMAND),
                            ("response", TOPIC_RESPONSE), ("alert", TOPIC_ALERT),
                            ("status", TOPIC_STATUS)):
            print(f"  {name:10s} {topic}")
        return 0

    if args.standalone:
        broker = MockMqttBroker(host="0.0.0.0", port=args.port)
        try:
            broker.serve_forever()
        except KeyboardInterrupt:
            print("\n[mock-broker] Dừng.")
            broker.stop()
        return 0

    if args.listen:
        topics = args.topic or [TOPIC_TELEMETRY, TOPIC_COMMAND, TOPIC_STATUS, TOPIC_ALERT]
        return run_listen(args.host, args.port, topics, args.timeout, args.tls)

    if args.publish or args.scenario:
        return run_publish(args.host, args.port, args.publish or "telemetry",
                           args.count, args.interval, args.scenario, args.tls)

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
