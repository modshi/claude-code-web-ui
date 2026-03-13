# Claude Code Web UI

**A web-based interface for [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — because the terminal isn't always enough.**

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-blue)
![PWA](https://img.shields.io/badge/PWA-Installable-purple)

---

## The Problem

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is a powerful AI coding assistant that runs as a CLI tool in your terminal. It can read, edit, and create files, run commands, search codebases, and much more — all from the command line.

But working only in the terminal has limitations:

- **No remote access** — You can't interact with Claude Code from your phone, tablet, or another machine
- **Terminal sessions are fragile** — Close the tab and your session is gone
- **No visibility when away** — If you leave a long task running, you have no way to know when it's done or if it errored out
- **Hard to read long responses** — Markdown, code blocks, and tool calls are difficult to follow in raw terminal output
- **No multi-session management** — Switching between conversations requires manual session ID tracking

## The Solution

Claude Code Web UI wraps the Claude Code CLI in a browser-based interface that solves all of these problems:

- **Access from anywhere** — Open it from any browser on any device (phone, tablet, laptop)
- **Sessions survive disconnects** — Claude keeps running even if you close the browser; reconnect and pick up where you left off
- **Slack notifications** — Get notified in Slack when tasks complete or errors occur, so you don't have to watch the screen
- **Rich rendering** — Markdown with syntax highlighting, collapsible tool calls, thinking blocks, and cost tracking
- **Session management** — Create, switch, and resume multiple conversations from a simple dropdown
- **Model switching** — Toggle between Opus, Sonnet, and Haiku with one click
- **PWA** — Install as a standalone app on your home screen

It does **not** replace Claude Code — it wraps it. The CLI does all the actual work; this project just gives it a browser-friendly face.

---

## Features

- **Real-time streaming** — Watch Claude's responses as they arrive via WebSocket
- **Multi-session** — Create, switch, and resume multiple conversations
- **Model selection** — Switch between Opus, Sonnet, and Haiku
- **Tool visualization** — See Read, Edit, Bash, Grep, and other tool calls with collapsible details
- **Thinking blocks** — Expandable view of Claude's reasoning
- **Slack notifications** — Error alerts and task completion messages sent to your channel
- **PWA** — Install as a standalone app on desktop and mobile
- **Offline support** — Service Worker caching for offline access
- **Mobile-friendly** — Responsive design with touch support and haptic feedback
- **Working directory picker** — Browse and select project directories from the UI
- **Markdown rendering** — Full GFM support with syntax-highlighted code blocks
- **Session persistence** — Conversations saved to disk, survive server restarts

---

## Prerequisites

- **Node.js** 18+
- **Claude Code CLI** installed and authenticated ([setup guide](https://docs.anthropic.com/en/docs/claude-code))

## Quick Start

```bash
git clone git@github.com:modshi/claude-code-web-ui.git
cd claude-code-web-ui
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

Get notified in Slack when Claude finishes a task or hits an error — perfect for long-running tasks where you don't want to keep the browser open.

You can configure Slack at runtime without restarting:

```bash
# Set webhook URL
curl -X POST http://localhost:8181/api/slack/config \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://hooks.slack.com/services/T.../B.../xxx"}'

# Test it
curl -X POST http://localhost:8181/api/slack/test
```

See [docs/slack-notifications.md](docs/slack-notifications.md) for full setup guide.

---

## Architecture

```
Browser (app.js)
    ↕ WebSocket
Express Server (server.js)
    ↕ child_process.spawn
Claude Code CLI (stream-json output)
```

The server acts as a bridge between the browser and the Claude Code CLI:

1. You type a prompt in the browser
2. The server sends it to `claude -p ... --output-format stream-json`
3. Claude's streamed JSON output is parsed and forwarded to the browser in real-time
4. Sessions and messages are persisted to disk
5. Slack notifications fire on errors and task completion

## Project Structure

```
claude-code-web-ui/
├── server.js          # Express + WebSocket server, Claude process manager
├── slack.js           # Slack notification module
├── package.json
├── public/
│   ├── index.html     # Single-page HTML
│   ├── app.js         # Client application
│   ├── style.css      # Dark theme styling
│   ├── sw.js          # Service Worker (caching + push)
│   ├── manifest.json  # PWA manifest
│   └── vendor/        # Bundled libraries (Lucide icons)
├── data/              # Runtime data (git-ignored)
└── docs/              # Documentation
    ├── project-guide.md
    └── slack-notifications.md
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

## Documentation

- [Project Guide](docs/project-guide.md) — Full technical documentation
- [Slack Notifications](docs/slack-notifications.md) — Slack setup and configuration

## License

MIT
