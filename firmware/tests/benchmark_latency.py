#!/usr/bin/env python3

import time
import json
import socket
import struct
import sys
import threading

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Broker + topic PHẢI khớp với firmware/esp32-main/include/mqtt_config.h
# và BackEnd/src/main/resources/application.yaml
# Đổi cả 3 chỗ cùng lúc nếu đổi TENANT.
TENANT = "thanhliem"

DEFAULT_BROKER = "localhost"
DEFAULT_PORT = 1883
DEVICE_ID = "ESP32_MAIN_01"

BASE = f"swiftlet/{TENANT}/1/1/{DEVICE_ID}"
TOPIC_TELEMETRY = f"{BASE}/telemetry"
TOPIC_COMMAND = f"{BASE}/command"
TOPIC_RESPONSE = f"{BASE}/response"
TOPIC_ALERT = f"{BASE}/alert"

def encode_remaining_length(length):
    """MQTT Remaining Length bien thien 1-4 byte (spec 2.2.3)."""
    out = bytearray()
    while True:
        byte = length % 128
        length //= 128
        if length > 0:
            byte |= 128
        out.append(byte)
        if length == 0:
            break
    return bytes(out)


class SimpleMqttClient:
    def __init__(self, host, port=1883, client_id="swiftlet_tester"):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.sock = None
        self.running = False
        self.callbacks = {}
        self.packet_id = 1

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=10)
        var_header = b'\x00\x04MQTT\x04\x02\x00<\x00' + struct.pack("!H", len(self.client_id)) + self.client_id.encode('utf-8')
        remaining_len = len(var_header)
        connect_packet = bytes([0x10]) + encode_remaining_length(remaining_len) + var_header
        self.sock.sendall(connect_packet)
        ack = self.sock.recv(4)
        if len(ack) >= 4 and ack[0] == 0x20 and ack[3] == 0x00:
            self.running = True
            threading.Thread(target=self._recv_loop, daemon=True).start()
            return True
        return False

    def subscribe(self, topic, callback=None):
        if callback:
            self.callbacks[topic] = callback
        var_header = struct.pack("!H", self.packet_id)
        self.packet_id += 1
        payload = struct.pack("!H", len(topic)) + topic.encode('utf-8') + b'\x00'
        rem_len = len(var_header) + len(payload)
        packet = bytes([0x82]) + encode_remaining_length(rem_len) + var_header + payload
        self.sock.sendall(packet)

    def publish(self, topic, message):
        topic_bytes = topic.encode('utf-8')
        msg_bytes = message.encode('utf-8') if isinstance(message, str) else message
        payload = struct.pack("!H", len(topic_bytes)) + topic_bytes + msg_bytes
        self.sock.sendall(bytes([0x30]) + encode_remaining_length(len(payload)) + payload)

    def _recv_loop(self):
        while self.running:
            try:
                header = self.sock.recv(1)
                if not header:
                    break
                pkt_type = header[0] >> 4
                # Remaining Length la bien thien 1-4 byte.
                # Chi doc 1 byte se lam stream lech voi goi tin > 127 byte.
                rem_len = 0
                multiplier = 1
                for _ in range(4):
                    b = self.sock.recv(1)
                    if not b:
                        raise ConnectionError("closed")
                    rem_len += (b[0] & 127) * multiplier
                    multiplier *= 128
                    if not (b[0] & 128):
                        break
                body = b''
                while len(body) < rem_len:
                    chunk = self.sock.recv(rem_len - len(body))
                    if not chunk:
                        raise ConnectionError("closed")
                    body += chunk
                if pkt_type == 3:
                    topic_len = struct.unpack("!H", body[0:2])[0]
                    topic = body[2:2+topic_len].decode('utf-8', errors='ignore')
                    msg = body[2+topic_len:].decode('utf-8', errors='ignore')
                    for sub_topic, cb in self.callbacks.items():
                        if sub_topic == topic or sub_topic.endswith("#"):
                            cb(topic, msg)
            except Exception:
                break

    def disconnect(self):
        self.running = False
        try:
            if self.sock:
                self.sock.sendall(b'\xE0\x00')
                self.sock.close()
        except Exception:
            pass


def run_benchmark(broker=DEFAULT_BROKER, port=DEFAULT_PORT):
    telemetry_samples = []
    response_latencies = []
    # Thoi diem gui tung lenh -> dung de tinh RTT o phia client.
    # Firmware KHONG echo "_sent_timestamp" trong payload response,
    # nen RTT phai do bang thuoc o day chu khong doc tu response.
    pending_commands = []
    lock = threading.Lock()

    def on_telemetry(topic, msg):
        now = time.time()
        try:
            data = json.loads(msg)
            telemetry_samples.append((now, data))
            print(f"[telemetry] temp={data.get('temp')} hum={data.get('hum')} co2={data.get('co2')}")
        except Exception as e:
            pass

    def on_response(topic, msg):
        recv_time = time.time()
        try:
            data = json.loads(msg)
            with lock:
                sent_time = pending_commands.pop(0) if pending_commands else None
            if sent_time is not None:
                rtt_ms = (recv_time - sent_time) * 1000.0
                response_latencies.append(rtt_ms)
                print(f"[ack] target={data.get('target')} state={data.get('state')} rtt={rtt_ms:.2f}ms")
        except Exception as e:
            pass

    client = SimpleMqttClient(broker, port, client_id="swiftlet_benchmark_runner")
    try:
        if not client.connect():
            print(f"[ERROR] Khong ket noi duoc broker {broker}:{port}")
            print_summary(connect_error=True)
            return

        client.subscribe(TOPIC_TELEMETRY, on_telemetry)
        client.subscribe(TOPIC_RESPONSE, on_response)

        time.sleep(5)

        test_commands = [
            {"command": "RELAY_CONTROL", "target": "mist", "state": 1, "mode": "MANUAL"},
            {"command": "RELAY_CONTROL", "target": "fan",  "state": 1, "mode": "MANUAL"},
            {"command": "RELAY_CONTROL", "target": "mist", "state": 0, "mode": "AUTO"},
            {"command": "RELAY_CONTROL", "target": "fan",  "state": 0, "mode": "AUTO"},
        ]

        for cmd in test_commands:
            sent_at = time.time()
            with lock:
                pending_commands.append(sent_at)
            client.publish(TOPIC_COMMAND, json.dumps(cmd))
            time.sleep(1.0)

        client.disconnect()
        print_summary(telemetry_samples, response_latencies)
    except Exception as e:
        print(f"[ERROR] Benchmark that bai: {e}")
        print_summary(telemetry_samples, response_latencies, connect_error=True)


def print_summary(telemetry_samples=None, response_latencies=None, connect_error=None):
    """In bang tong hop KET QUA DO THAT.

    Truoc day ham nay in san 5 dong PASS gia dinh, khong lien quan gi den
    so do thuc te - lien "chay pass" ma thuong chay fail.
    """
    telemetry_samples = telemetry_samples or []
    response_latencies = response_latencies or []

    results = []

    if connect_error:
        results.append(("Broker connection", "FAILED", "-", "FAIL"))

    # 1. Chu ky phat telemetry: 2 giay/lan
    if len(telemetry_samples) >= 2:
        intervals = [
            telemetry_samples[i + 1][0] - telemetry_samples[i][0]
            for i in range(len(telemetry_samples) - 1)
        ]
        avg_interval = sum(intervals) / len(intervals)
        ok = 1.8 <= avg_interval <= 2.2
        results.append((
            "Telemetry Interval",
            f"{avg_interval:.2f} s",
            "2.0 s +/- 10%",
            "PASS" if ok else "FAIL",
        ))
    else:
        results.append(("Telemetry Interval", "no data", "2.0 s +/- 10%", "N/A"))

    # 2. RTT lenh relay (do o phia client)
    if response_latencies:
        avg_rtt = sum(response_latencies) / len(response_latencies)
        ok = avg_rtt < 500
        results.append((
            "Relay Command RTT",
            f"{avg_rtt:.2f} ms",
            "< 500 ms",
            "PASS" if ok else "FAIL",
        ))
    else:
        results.append(("Relay Command RTT", "no ack", "< 500 ms", "N/A"))

    # 3. So mau telemetry nhan duoc
    results.append((
        "Telemetry samples",
        str(len(telemetry_samples)),
        "> 0",
        "PASS" if telemetry_samples else "N/A",
    ))

    # 4. So phan hoi lenh nhan duoc
    results.append((
        "Command responses",
        str(len(response_latencies)),
        "> 0",
        "PASS" if response_latencies else "N/A",
    ))

    print(f"\n{'Metric':<30} | {'Value':<12} | {'SLA':<14} | {'Status':<6}")
    print("-" * 68)
    for name, val, sla, st in results:
        print(f"{name:<30} | {val:<12} | {sla:<14} | {st:<6}")


if __name__ == "__main__":
    run_benchmark()
