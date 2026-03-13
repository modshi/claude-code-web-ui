# Slack Notifications Guide

Send error alerts and task completion notifications from Claude Web UI to a Slack channel.

---

## Setup

### 1. Create a Slack Incoming Webhook

1. Go to [Slack API: Incoming Webhooks](https://api.slack.com/messaging/webhooks)
2. Click **Create your Slack app** (or select an existing app)
3. Enable **Incoming Webhooks**
4. Click **Add New Webhook to Workspace**
5. Select the channel where you want notifications
6. Copy the **Webhook URL** (looks like `https://hooks.slack.com/services/T.../B.../xxx`)

### 2. Set the Environment Variable

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../xxx"
```

Or add it to your `.env` file / startup script:

```bash
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../xxx" node server.js
```

### 3. Verify

Send a test notification:

```bash
curl -X POST http://localhost:8181/api/slack/test
```

You should see a test message in your Slack channel.

---

## Notification Types

### Error Notifications

Triggered when Claude encounters an API or authentication error.

**Includes:**
- Session ID
- Model name
- Working directory
- Error message

**Example Slack message:**

> **Claude Error**
> **Session:** `abc-123` | **Model:** opus | **Workdir:** `/root/myproject`
> ```
> API Error: Rate limit exceeded
> ```

### Completion Notifications

Triggered when a Claude task finishes (success or failure).

**Includes:**
- Session ID
- Model name
- Working directory
- Task title
- Exit code

**Example Slack message:**

> **Claude Task Completed**
> **Session:** `abc-123` | **Model:** opus | **Workdir:** `/root/myproject` | **Task:** Fix login bug

---

## API Reference

### `POST /api/slack/test`

Sends a test notification to verify the webhook is configured correctly.

**Response:**
- `200 { "ok": true }` — Test sent successfully
- `400 { "error": "SLACK_WEBHOOK_URL not set" }` — Missing env variable
- `500 { "error": "..." }` — Webhook request failed

---

## Configuration

| Environment Variable | Required | Description |
|---|---|---|
| `SLACK_WEBHOOK_URL` | Yes | Slack Incoming Webhook URL |

When `SLACK_WEBHOOK_URL` is not set, all Slack notifications are silently skipped with no impact on the application.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| No notifications received | Check that `SLACK_WEBHOOK_URL` is set and the server was restarted |
| `400` on test endpoint | The env variable is not set — verify with `echo $SLACK_WEBHOOK_URL` |
| `500` or webhook errors | Check the server logs for `[slack]` messages; verify the webhook URL is valid |
| Channel not receiving | Confirm the webhook is linked to the correct channel in Slack app settings |
| Duplicate notifications | Each error or completion fires once — check for multiple server instances |
