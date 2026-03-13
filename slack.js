// Slack notification module — sends errors and completion events via Incoming Webhook
// Configure via: SLACK_WEBHOOK_URL env var, or POST /api/slack/config

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "data", "slack-config.json");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getWebhookUrl() {
  return process.env.SLACK_WEBHOOK_URL || loadConfig().webhookUrl || null;
}

function setWebhookUrl(url) {
  const config = loadConfig();
  config.webhookUrl = url;
  saveConfig(config);
}

function isEnabled() {
  return !!getWebhookUrl();
}

async function send(payload) {
  const url = getWebhookUrl();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[slack] webhook failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[slack] webhook error: ${err.message}`);
  }
}

function notifyError({ sessionId, message, workdir, model }) {
  return send({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: ":rotating_light: Claude Error", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Session:*\n\`${sessionId || "unknown"}\`` },
          { type: "mrkdwn", text: `*Model:*\n${model || "unknown"}` },
          { type: "mrkdwn", text: `*Workdir:*\n\`${workdir || "unknown"}\`` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error:*\n\`\`\`${truncate(message, 2500)}\`\`\``,
        },
      },
    ],
  });
}

function notifyComplete({ sessionId, exitCode, workdir, model, title }) {
  const success = exitCode === 0;
  const emoji = success ? ":white_check_mark:" : ":warning:";
  const status = success ? "Completed" : `Exited with code ${exitCode}`;

  return send({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} Claude Task ${status}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Session:*\n\`${sessionId || "unknown"}\`` },
          { type: "mrkdwn", text: `*Model:*\n${model || "unknown"}` },
          { type: "mrkdwn", text: `*Workdir:*\n\`${workdir || "unknown"}\`` },
          { type: "mrkdwn", text: `*Task:*\n${title || "Untitled"}` },
        ],
      },
    ],
  });
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function notifyTest() {
  return send({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: ":test_tube: Claude Web UI — Test Notification", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Slack notifications are working! You will receive:\n• :rotating_light: *Error* alerts when Claude encounters API or auth errors\n• :white_check_mark: *Completion* notifications when a task finishes",
        },
      },
    ],
  });
}

module.exports = { isEnabled, getWebhookUrl, setWebhookUrl, notifyError, notifyComplete, notifyTest };
