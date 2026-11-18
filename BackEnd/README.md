# Môn Lập trình Java
Kho lưu trữ các bài tập và dự án môn Lập trình Java.

## Telegram notifications

Set these backend environment variables (for example in `BackEnd/.env`):

- `TELEGRAM_BOT_TOKEN`: token for the Telegram bot.
- `TELEGRAM_WEBHOOK_URL`: public HTTPS URL ending in `/api/v1/telegram/webhook`.
- `TELEGRAM_WEBHOOK_SECRET`: a private random value using only letters, digits, `_`, or `-` (1-256 characters).

On startup, the backend registers the configured webhook with Telegram. The webhook URL must already route to this backend and be reachable over HTTPS; the backend cannot create or publish a public URL for a local server. Keep the bot token and webhook secret private.

After signing in to the web app, users can open **Telegram**, create a one-time code, open the bot, send `/start`, and then send the code. Codes expire after 10 minutes and can only be used once. Linked users receive threat-alert text and images. Users can send `/stop` or unlink Telegram from the web app to stop notifications.

`TELEGRAM_CHAT_ID` is no longer used; recipients are the user accounts linked through the bot.
