# SwiftletCare — Smart Swiftlet House Monitoring & Control System

Monorepo for SwiftletCare (`BackEnd` Spring Boot + `FrontEnd` Next.js + `ai` Edge YOLOv8/ByteTrack + `firmware` ESP32 / ESP32-CAM + `docker` EMQX/TimescaleDB/Redis/S3).

## Structure

- `docker/` — EMQX (`1883`, `8083`, `18083`), TimescaleDB (`5432`), Redis (`6379`), Zenko S3 (`9000`)
- `BackEnd/` — Spring Boot 3.3 (Java 21) REST API, STOMP WebSocket, MQTT consumers/publishers, Telegram bot notifications
- `FrontEnd/` — Next.js 14 dashboard
- `ai/` — Python YOLOv8 + ByteTrack bird counter & predator alert pipeline (`ai/src/main.py`)
- `firmware/esp32-main/` — ESP32 telemetry & relay actuation (`ESP32_ZONE_1`: SHT31, BH1750, MQ135, 5 relay channels)
- `firmware/esp32-cam/` — ESP32-CAM HTTP + MJPEG live video stream (`:80/` UI, `:81/stream`, mDNS `swiftlet-cam.local`)
- `firmware/scripts/` — Cross-platform Wi-Fi & LAN IP auto-detection (`setup_local_config.py`, PlatformIO `pio_auto_local_config.py`)

## Quick Start (Any Machine)

### 1. Start Infrastructure (Docker)

```bash
cd docker
docker compose up -d
```

TimescaleDB automatically runs `docker/timescaledb/init-scripts/01_init_hypertables.sql` on first database initialization.

### 2. Automatic Wi-Fi & LAN Config for Firmware

Never hardcode Wi-Fi passwords or personal LAN IPs in Git-tracked headers.

- **Automatic on build:** Running `pio run` (or `pio run -t upload`) inside `firmware/esp32-main` or `firmware/esp32-cam` automatically triggers `firmware/scripts/pio_auto_local_config.py` before compilation to detect your active LAN IP and Wi-Fi SSID (plus saved OS Wi-Fi key on Windows/Linux) and write git-ignored `config.local.h` / `wifi_config.local.h`.
- **Manual / pre-check:**
  ```bash
  python firmware/scripts/setup_local_config.py --check
  python firmware/scripts/setup_local_config.py --yes
  ```
- **CI / Wokwi / explicit override:** Set `CI=true` or `SWIFTLET_SKIP_AUTO_CONFIG=1`, or pass `-DWIFI_SSID=...` / `-DMQTT_HOST=...` in PlatformIO `build_flags`.

### 3. BackEnd

```bash
cd BackEnd
cp .env.example .env   # add Telegram tokens if needed; ACTUATION_ENABLED defaults to true
./mvnw spring-boot:run
```

Run isolated unit/smoke tests (uses in-memory H2 + mocked MQTT inbound adapters, safe even while another local BackEnd instance is connected to EMQX):

```bash
cd BackEnd
./mvnw test
```

### 4. FrontEnd

```bash
cd FrontEnd
npm install
npm run dev
```

### 5. AI Edge Pipeline

Place your trained weights at `ai/models/best.pt`, then:

```bash
pip install -r ai/requirements.txt
cd ai/src
python main.py
```

By default `main.py` connects to `swiftlet-cam.local:81/stream` (mDNS from ESP32-CAM); set `CAMERA_IP` or `MQTT_HOST` (see `ai/.env.example`) to override.

## Hardware Notes

- **Windows path encoding:** On Windows, compile PlatformIO from an ASCII folder path (e.g. `C:\swiftlet-care\PROJECT_JAVA`) so `xtensa-esp32-elf-ld` does not fail on Unicode characters in OneDrive/user folders.
- **USB-UART driver (`CP2102` Error 28):** Install Silicon Labs CP210x Universal Windows Driver if Device Manager shows no COM port.
- **ESP32 boot loop (`POWERON_RESET` / brownout):** Use a short shielded data USB cable plugged directly into a motherboard USB port or powered 5V supply.
