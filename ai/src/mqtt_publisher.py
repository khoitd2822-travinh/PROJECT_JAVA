"""Gui ket qua tu edge len MQTT broker (EMQX/Mosquitto) cho BackEnd.

Topic:
  swiftletcare/{houseId}/{cameraId}/count      moi luot IN/OUT
  swiftletcare/{houseId}/{cameraId}/alert      phat hien Owl/Rat/Snake
  swiftletcare/{houseId}/{cameraId}/heartbeat  5-10s/lan: fps, tong so
  swiftletcare/{houseId}/{cameraId}/status     online/offline (retained + Last Will)

Bien moi truong: MQTT_HOST, MQTT_PORT (1883), MQTT_USER, MQTT_PASS. Khong dat MQTT_HOST -> tat MQTT.
"""
from __future__ import annotations

import json
import os


class NullPublisher:
    enabled = False

    def publish(self, *_a, **_k) -> None:
        pass

    def close(self) -> None:
        pass


class MqttPublisher:
    enabled = True

    def __init__(self, host: str, port: int, user: str | None, password: str | None,
                 house_id: str, camera_id: str) -> None:
        import paho.mqtt.client as mqtt

        self.base = f"swiftletcare/{house_id}/{camera_id}"
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id=f"edge-{house_id}-{camera_id}")
        if user:
            self.client.username_pw_set(user, password)
        self.client.will_set(f"{self.base}/status", json.dumps({"online": False}), qos=1, retain=True)
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.max_queued_messages_set(1000)     # dem tam khi mat mang
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = lambda *a, **k: print("[MQTT] Mat ket noi, se tu noi lai...")
        self.client.connect_async(host, port, keepalive=30)
        self.client.loop_start()

    def _on_connect(self, client, _userdata, _flags, reason_code, _props=None) -> None:
        print(f"[MQTT] Da ket noi ({reason_code})")
        client.publish(f"{self.base}/status", json.dumps({"online": True}), qos=1, retain=True)

    def publish(self, sub_topic: str, payload: dict, qos: int = 1, retain: bool = False):
        try:
            return self.client.publish(f"{self.base}/{sub_topic}",
                                       json.dumps(payload, ensure_ascii=False, default=str),
                                       qos=qos, retain=retain)
        except Exception as e:                      # MQTT loi khong duoc lam sap vong dem chim
            print(f"[MQTT] Loi gui {sub_topic}: {e}")

    def close(self) -> None:
        try:
            # Ngat ket noi "sach" thi broker KHONG gui Last Will -> phai tu bao offline va cho gui xong
            info = self.publish("status", {"online": False}, retain=True)
            if info is not None:
                info.wait_for_publish(timeout=3)
        except Exception:
            pass
        try:
            self.client.disconnect()
            self.client.loop_stop()
        except Exception:
            pass


def build_publisher(house_id: str, camera_id: str):
    host = os.environ.get("MQTT_HOST")
    if not host:
        print("[MQTT] MQTT_HOST chua dat -> chay offline (khong gui MQTT)")
        return NullPublisher()
    return MqttPublisher(host, int(os.environ.get("MQTT_PORT", "1883")),
                         os.environ.get("MQTT_USER"), os.environ.get("MQTT_PASS"),
                         house_id, camera_id)