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

## Zalo delivery

Backend does not send Zalo on the initial `alert` when its image is unavailable. On
`alert-image`, it stores the key, creates a short-lived presigned URL, then sends one
message containing the alert text and image. Delivery state (`zaloNotified`, attempts,
and result) is stored with the alert. A failed request is logged and can be retried by a
redelivery, up to three attempts; a successful event is never sent again.

FE subscribes to `/topic/bird-tracking/{houseId}/{cameraId}` for count, alert,
alert-image, heartbeat and status. It can bootstrap state with
`GET /api/v1/bird-tracking/cameras/{cameraId}/state` and fetch history/current through
the existing bird-tracking APIs.
