# Monitoring Setup

## Sentry

Set these environment variables on the backend deployment:

- `SENTRY_DSN` (required to enable reporting)
- `SENTRY_TRACES_SAMPLE_RATE` (optional, default: `0.1`)

When `SENTRY_DSN` is present, backend errors and unhandled process exceptions are sent to Sentry.

## UptimeRobot

Create an HTTP(s) monitor that pings:

- `GET https://<your-backend-domain>/health`

Recommended settings:

- Check interval: `5 minutes`
- Timeout: `30 seconds`
- Alert contacts: email/Slack/on-call channel

Expected healthy response:

- HTTP `200`
- JSON body containing `"success": true`
