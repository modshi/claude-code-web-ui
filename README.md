# Claude Web UI

A lightweight web interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that runs in your browser. Real-time streaming, multi-session support, and Slack notifications.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-blue)
![PWA](https://img.shields.io/badge/PWA-Installable-purple)

## Features

- **Real-time streaming** — Watch Claude's responses as they arrive via WebSocket
- **Multi-session** — Create, switch, and resume multiple conversations
- **Model selection** — Switch between Opus, Sonnet, and Haiku
- **Tool visualization** — See Read, Edit, Bash, Grep, and other tool calls with collapsible details
- **Thinking blocks** — Expandable view of Claude's reasoning
- **Slack notifications** — Get error alerts and task completion messages in Slack
- **PWA** — Install as a standalone app on desktop and mobile
- **Offline support** — Service Worker caching for offline access
- **Mobile-friendly** — Responsive design with touch support and haptic feedback
- **Working directory picker** — Browse and select project directories from the UI
- **Markdown rendering** — Full GFM support with syntax-highlighted code blocks
- **Session persistence** — Conversations saved to disk, survive server restarts

## Prerequisites

- **Node.js** 18+
- **Claude CLI** installed and authenticated ([setup guide](https://docs.anthropic.com/en/docs/claude-code))

## Quick Start

```bash
git clone https://github.com/<your-username>/claude-web-ui.git
cd claude-web-ui
npm install
npm start
```

Open **http://localhost:8181** in your browser.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `8181` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `SLACK_WEBHOOK_URL` | — | Slack Incoming Webhook URL |

```bash
PORT=3000 SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." npm start
```

### Slack Notifications (optional)

You can also configure Slack at runtime without restarting:

```bash
# Set webhook URL
curl -X POST http://localhost:8181/api/slack/config \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://hooks.slack.com/services/T.../B.../xxx"}'

# Test it
curl -X POST http://localhost:8181/api/slack/test
```

See [docs/slack-notifications.md](docs/slack-notifications.md) for full setup guide.

## Architecture

```
Browser (app.js)
    ↕ WebSocket
Express Server (server.js)
    ↕ child_process.spawn
Claude CLI (stream-json output)
```

The server bridges the browser and Claude CLI:
1. Receives prompts via WebSocket
2. Spawns `claude -p ... --output-format stream-json`
3. Streams parsed JSON events back to the client
4. Persists sessions and messages to `data/`
5. Sends Slack notifications on errors and task completion

## Project Structure

```
claude-web-ui/
├── server.js          # Express + WebSocket server
├── slack.js           # Slack notification module
├── package.json
├── public/
│   ├── index.html     # Single-page HTML
│   ├── app.js         # Client application
│   ├── style.css      # Dark theme styling
│   ├── sw.js          # Service Worker
│   ├── manifest.json  # PWA manifest
│   └── vendor/        # Bundled libraries
├── data/              # Runtime data (git-ignored)
└── docs/              # Documentation
```

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sessions` | List sessions |
| `GET` | `/api/sessions/:id/messages` | Get session messages |
| `GET` | `/api/sessions/:id/status` | Check if session is running |
| `DELETE` | `/api/sessions/:id` | Delete session |
| `GET` | `/api/dirs?path=/root` | Browse directories |
| `GET` | `/api/slack/config` | Get Slack config status |
| `POST` | `/api/slack/config` | Set Slack webhook URL |
| `POST` | `/api/slack/test` | Send test Slack notification |

## License

MIT
