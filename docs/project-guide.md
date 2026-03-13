# Claude Web UI — Project Guide

A lightweight web interface for Claude Code that runs in your browser. Built with Node.js, Express, and WebSocket for real-time streaming responses.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Server (Backend)](#server-backend)
- [Client (Frontend)](#client-frontend)
- [WebSocket Protocol](#websocket-protocol)
- [REST API](#rest-api)
- [Session Management](#session-management)
- [Notification System](#notification-system)
- [Slack Integration](#slack-integration)
- [PWA & Offline Support](#pwa--offline-support)
- [Data Storage](#data-storage)
- [UI Features](#ui-features)
- [Troubleshooting](#troubleshooting)

---

## Overview

Claude Web UI provides a chat-based interface to interact with Claude Code directly from the browser. Key capabilities:

- Real-time streaming responses via WebSocket
- Multi-session support with persistence
- Model selection (Opus, Sonnet, Haiku)
- Working directory picker
- Tool call visualization (Read, Edit, Write, Bash, Grep, etc.)
- Markdown rendering with syntax highlighting
- Slack notifications for errors and completions
- PWA with offline support and push notifications
- Mobile-responsive design with haptic feedback

---

## Architecture

```
Browser (app.js)
    |
    |  WebSocket (bidirectional)
    v
Express Server (server.js)
    |
    |  child_process.spawn
    v
Claude CLI (claude -p ... --output-format stream-json)
    |
    |  stdout (JSON stream)
    v
Server parses JSON → emits to WebSocket → Client renders
```

The server acts as a bridge between the browser and the Claude CLI. It:
1. Receives prompts via WebSocket
2. Spawns a Claude CLI process with `--output-format stream-json`
3. Parses the JSON stream from stdout
4. Forwards events to the client in real-time
5. Persists sessions and messages to disk
6. Sends Slack notifications on errors and completion

---

## Getting Started

### Prerequisites

- Node.js 18+
- Claude CLI installed and authenticated (`claude` command available)

### Installation

```bash
git clone <repo-url>
cd claude-web-ui
npm install
```

### Running

```bash
npm start
# or
node server.js
```

Open `http://localhost:8181` in your browser.

### With Slack Notifications

```bash
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../xxx" node server.js
```

---

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8181` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address |
| `SLACK_WEBHOOK_URL` | *(none)* | Slack Incoming Webhook URL for notifications |

---

## Project Structure

```
claude-web-ui/
├── server.js              # Express + WebSocket server, Claude process manager
├── slack.js               # Slack notification module (webhook integration)
├── package.json           # Dependencies: express, ws, lucide
├── public/                # Static frontend assets
│   ├── index.html         # Single-page HTML shell
│   ├── app.js             # Client-side application logic
│   ├── style.css          # Full styling (dark theme)
│   ├── sw.js              # Service Worker (caching + push)
│   ├── manifest.json      # PWA manifest
│   ├── icon-192.png       # App icon (192x192)
│   ├── icon-512.png       # App icon (512x512)
│   ├── icon-192.svg       # SVG icon source
│   ├── icon-512.svg       # SVG icon source
│   └── vendor/
│       └── lucide.min.js  # Lucide icon library (bundled)
├── data/                  # Runtime data (auto-created)
│   ├── sessions.json      # Session index (max 50)
│   └── messages-{id}.json # Per-session message logs
└── docs/                  # Documentation
    ├── project-guide.md   # This file
    └── slack-notifications.md
```

---

## Server (Backend)

**File:** `server.js` (~375 lines)

### Core Components

**Express HTTP Server**
- Serves static files from `public/`
- Provides REST API for sessions, messages, and directory browsing
- Slack test endpoint

**WebSocket Server**
- One WebSocket connection per browser tab
- Handles message types: `prompt`, `set_session`, `new_session`, `set_model`, `abort`
- Ping/pong keepalive every 25 seconds

**Runner System**
- Each active session has a "runner" object that manages a Claude CLI process
- Runners survive WebSocket disconnects (Claude keeps working if you close the tab)
- Runners are cleaned up 60 seconds after the process finishes
- Supports prompt queuing — if Claude is busy, new prompts wait in line

**Claude Process Management**
- Spawns: `script -qfc "claude -p <prompt> --output-format stream-json --verbose --permission-mode auto --model <model>" /dev/null`
- Wraps in `script` to get a PTY (required for Claude's output handling)
- Supports `--resume <sessionId>` for continuing conversations
- Parses stdout line-by-line for JSON events
- Handles stderr for error detection

---

## Client (Frontend)

**File:** `public/app.js` (~1093 lines)

### Key Features

- **WebSocket Connection** — Auto-reconnects on disconnect, resumes session state
- **Message Rendering** — Markdown via `marked.js`, syntax highlighting via `highlight.js`
- **Tool Call Display** — Collapsible panels showing tool name, icon, and input
- **Thinking Blocks** — Expandable sections showing Claude's reasoning
- **Activity Bar** — Shows current operation (Reading file, Running command, etc.)
- **Session Caching** — Uses `sessionStorage` for instant HTML restore (no flash on reload)

### External Libraries (CDN)

- `highlight.js` 11.9.0 — Code syntax highlighting
- `marked` 12.0.1 — Markdown parsing

### Bundled Libraries

- `lucide` 0.577.0 — Icon library (in `vendor/`)

---

## WebSocket Protocol

### Client → Server Messages

| Type | Fields | Description |
|---|---|---|
| `prompt` | `text`, `workdir`, `model`, `sessionId`, `continueSession` | Send a prompt to Claude |
| `set_session` | `sessionId`, `title`, `model`, `messageCount` | Switch to a session |
| `new_session` | — | Start a new session |
| `set_model` | `model` | Change model (`opus`, `sonnet`, `haiku`) |
| `abort` | — | Stop the current Claude process |

### Server → Client Messages

| Type | Fields | Description |
|---|---|---|
| `system` | `session_id`, `model` | Claude process started |
| `session_info` | `sessionId`, `title` | Session ID assigned |
| `assistant` | `message.content[]` | Assistant text/tool_use blocks |
| `tool_use` | `tool_name`, `input` | Tool invocation |
| `tool_result` | `content`, `is_error` | Tool execution result |
| `result` | `total_cost_usd` | Final result with cost |
| `process_end` | `code` | Claude process exited |
| `still_running` | `sessionId`, `contentBlocks` | Session is active (on reconnect) |
| `queued` | `position`, `text` | Prompt queued while busy |
| `aborted` | — | Process was stopped |
| `error` | `message` | Error occurred |

All server messages include `_sessionId` so the client can filter messages from other sessions.

---

## REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions (max 50) |
| `GET` | `/api/sessions/:id/messages` | Get messages for a session |
| `GET` | `/api/sessions/:id/status` | Check if session is running |
| `DELETE` | `/api/sessions/:id` | Delete a session and its messages |
| `GET` | `/api/dirs?path=/root` | List subdirectories for workdir picker |
| `POST` | `/api/slack/test` | Send a test Slack notification |

---

## Session Management

- Sessions are created automatically when the first prompt is sent
- Each session maps to a Claude CLI `--resume` session
- Session metadata stored in `data/sessions.json` (max 50 entries)
- Messages stored in `data/messages-{sessionId}.json`
- Sessions persist across server restarts
- Client caches rendered HTML in `sessionStorage` for instant restore

### Session Lifecycle

1. User sends first prompt → server spawns Claude with no `--resume`
2. Claude returns `session_id` in system event → server stores it
3. Subsequent prompts use `--resume <sessionId>`
4. On reconnect, server sends `still_running` if Claude is active
5. Sessions auto-clean from runner map 60s after process exits

---

## Notification System

The app has a multi-layer notification system:

### 1. In-App Toast Notifications
- Success, error, info, warning types
- Auto-dismiss with configurable duration
- Haptic feedback on mobile (vibration)

### 2. Browser Desktop Notifications
- Uses the Notification API
- Only shown when the page is hidden (tab in background)
- Permission requested on first user interaction

### 3. Push Notifications (Service Worker)
- Service Worker listens for `push` events
- Ready for server-side push (not yet implemented)

### 4. Slack Notifications
- Error alerts sent to Slack on API/auth errors
- Task completion notifications on every process exit
- See [Slack Notifications Guide](./slack-notifications.md)

---

## Slack Integration

**File:** `slack.js`

Uses Slack Incoming Webhooks to send notifications. Reads `SLACK_WEBHOOK_URL` from the environment dynamically (can be set after server start).

### Events Sent to Slack

| Event | Trigger | Info Included |
|---|---|---|
| Error | API error, auth error, invalid request | Session, model, workdir, error message |
| Completion | Claude process exits (any exit code) | Session, model, workdir, task title, exit code |
| Test | `POST /api/slack/test` | Verification message |

### Message Format

Notifications use Slack Block Kit with:
- Header block with emoji indicator
- Section with fields (session, model, workdir)
- Error text in code block (for errors)

For full setup instructions, see [docs/slack-notifications.md](./slack-notifications.md).

---

## PWA & Offline Support

**File:** `public/sw.js`

- **Cache Name:** `claude-code-v6`
- **Precached Assets:** `/`, `/style.css`, `/app.js`, `/vendor/lucide.min.js`, `/manifest.json`, `/icon-192.png`
- **Strategy:** Network-first with cache fallback
- API requests and WebSocket are excluded from caching
- Falls back to cached assets when offline

**PWA Manifest** (`manifest.json`):
- Standalone display mode
- Dark theme (`#1e1e1e`)
- Portrait orientation
- Installable on mobile and desktop

---

## Data Storage

All data is stored as JSON files in the `data/` directory.

### sessions.json

```json
[
  {
    "id": "uuid-string",
    "title": "First 60 chars of first prompt",
    "workdir": "/root/project",
    "model": "opus",
    "updatedAt": "2026-03-13T12:00:00.000Z",
    "createdAt": "2026-03-13T11:00:00.000Z",
    "messageCount": 5
  }
]
```

- Maximum 50 sessions stored
- Newest first

### messages-{sessionId}.json

```json
[
  {
    "role": "user",
    "text": "Fix the login bug",
    "ts": 1710000000000
  },
  {
    "role": "assistant",
    "text": "I'll fix the login bug...",
    "content": [
      { "type": "text", "text": "I'll fix the login bug..." },
      { "type": "tool_use", "name": "Read", "input": { "file_path": "/src/login.js" } }
    ],
    "ts": 1710000001000
  }
]
```

- Messages saved on each assistant response (debounced at 500ms)
- Final save on process close
- Content blocks preserve the full tool call history

---

## UI Features

### Header
- Claude icon and title
- Model selector dropdown (Opus/Sonnet/Haiku)
- Session dropdown with session list
- Working directory picker
- Settings menu (font size, refresh)
- Mobile hamburger menu

### Chat Area
- Welcome screen with branding
- User and assistant message bubbles
- Thinking blocks (collapsible)
- Tool call panels (collapsible, with icons)
- Tool result blocks (with error styling)
- Activity indicator bar (current operation)
- Cost badge on final result

### Input Area
- Auto-resizing textarea (max 150px)
- Enter to send, Shift+Enter for newline
- Send/Stop buttons
- Keyboard hint

### Settings
- Font size adjustment (10–20px, stored in localStorage)
- Working directory picker with filesystem browser
- Model switching (persisted in localStorage)

### Mobile Support
- Viewport-aware height handling (keyboard resize)
- Touch-friendly controls
- Haptic feedback on notifications
- Mobile-specific menu overlay
- Apple mobile web app capable

---

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| "Disconnected" in status bar | WebSocket dropped | Auto-reconnects; check server is running |
| Claude not responding | CLI not installed or not authenticated | Run `claude` in terminal to verify |
| No syntax highlighting | CDN blocked | Check network access to cdnjs.cloudflare.com |
| Session not resuming | Session expired in Claude CLI | Start a new session |
| Slack notifications not working | `SLACK_WEBHOOK_URL` not set | Set env var and restart server |
| PWA not installing | Not served over HTTPS | Use HTTPS or localhost |
| Port already in use | Another process on 8181 | Set `PORT=8182 node server.js` |
| "API Error" messages | Rate limit or auth issue | Check Claude API key/quota |
