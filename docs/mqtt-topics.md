# Edge AI MQTT contract

Base topic: `swiftletcare/{houseId}/{cameraId}`. The edge AI implementation is the
source of truth for this contract.

| Topic suffix | Required fields | Meaning |
| --- | --- | --- |
| `count` | `eventId`, `event` (`IN`/`OUT`), `trackId`, `in`, `out`, `current`, `ts` | A single line-crossing event. |
| `alert` | `eventId`, `type`, `class`, `confidence`, `snapshotKey` (nullable), `ts` | A new predator alert. |
| `alert-image` | `eventId`, `snapshotKey`, `ts` | Adds an S3 image to an existing alert. |
| `heartbeat` | `fps`, `in`, `out`, `current`, `ts` | Liveness/state only; no event id. |
| `status` | `online` | Retained liveness state; no event id. |

`eventId` is a UUID generated once for every new count/alert. MQTT retries must send
the same ID. Backend has a unique database constraint and never increments or notifies
again when the same count/alert is delivered twice. `alert-image` updates that existing
event and never creates a new alert; backend temporarily retains an image that arrives
before its alert. S3 object keys use
`alerts/YYYY-MM-DD/{cameraId}/{eventId}.jpg`, where the date is Asia/Ho_Chi_Minh.

Set these environment variables on the AI edge to enable upload: `S3_ENDPOINT`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, and optional `S3_SECURE=true`.
Without them, AI deliberately sends the alert with `snapshotKey: null` and retains the
local image.

## Telegram delivery

Backend does not send a Telegram alert on the initial `alert` when its image is unavailable. On
`alert-image`, it stores the key, creates a short-lived presigned URL, then sends the
alert text and image as separate Telegram messages. Delivery state (text/image accepted,
attempts, and result) is stored with the alert. A failed request is logged and can be
retried by a redelivery, up to three attempts; successfully sent text is not repeated
when retrying a failed image, and a successful event is never sent again.

Configure the backend with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in
`BackEnd/.env` (copy the format from `BackEnd/.env.example`). Spring Boot loads this
file automatically when started from the `BackEnd` directory. Keep `.env` local and
never commit or share it. Create a bot
with Telegram's BotFather, then start a conversation with it (or add it to the target
group) so Telegram accepts messages for that chat. Set `S3_PUBLIC_ENDPOINT` to the HTTPS
S3-compatible endpoint that Telegram can reach; keep
`S3_ENDPOINT` as the endpoint used internally by the backend and edge. Do not use
`localhost` or a LAN-only address for the public endpoint. The authenticated test
endpoint is `POST /api/v1/notification/test-alert?message=...&imageUrl=...`; it returns
success only when Telegram accepts both messages. The `imageUrl` must be a public HTTPS URL.

FE subscribes to `/topic/bird-tracking/{houseId}/{cameraId}` for count, alert,
alert-image, heartbeat and status. It can bootstrap state with
`GET /api/v1/bird-tracking/cameras/{cameraId}/state` and fetch history/current through
the existing bird-tracking APIs.
