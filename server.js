const express = require("express");
const http = require("http");
const fs = require("fs");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const path = require("path");
const slack = require("./slack");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_DIR = path.join(__dirname, "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Sessions persistence ──
function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")); } catch { return []; }
}
function saveSessions(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
function upsertSession(sessionId, data) {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  const entry = {
    id: sessionId, title: data.title || "Untitled", workdir: data.workdir || "/root",
    model: data.model || "opus", updatedAt: new Date().toISOString(),
    createdAt: data.createdAt || new Date().toISOString(), messageCount: data.messageCount || 0,
  };
  if (idx >= 0) { entry.createdAt = sessions[idx].createdAt; sessions[idx] = entry; }
  else { sessions.unshift(entry); }
  saveSessions(sessions.slice(0, 50));
}

// ── Message log ──
function getSessionLogPath(sid) { return path.join(DATA_DIR, `messages-${sid}.json`); }
function loadMessages(sid) {
  try { return JSON.parse(fs.readFileSync(getSessionLogPath(sid), "utf8")); } catch { return []; }
}
function appendMessage(sid, msg) {
  const msgs = loadMessages(sid); msgs.push(msg);
  fs.writeFileSync(getSessionLogPath(sid), JSON.stringify(msgs));
}
function updateLastAssistantMessage(sid, contentBlocks) {
  const msgs = loadMessages(sid);
  const last = msgs.length - 1;
  if (last >= 0 && msgs[last].role === "assistant") {
    msgs[last].content = contentBlocks;
    msgs[last].text = contentBlocks.filter(b => b.type === "text").map(b => b.text).join("");
    msgs[last].ts = Date.now();
  } else {
    const text = contentBlocks.filter(b => b.type === "text").map(b => b.text).join("");
    msgs.push({ role: "assistant", text, content: contentBlocks, ts: Date.now() });
  }
  fs.writeFileSync(getSessionLogPath(sid), JSON.stringify(msgs));
}

// ── REST API ──
app.use(express.json());
app.get("/api/sessions", (req, res) => res.json(loadSessions()));
app.get("/api/sessions/:id/messages", (req, res) => res.json(loadMessages(req.params.id)));
app.get("/api/sessions/:id/status", (req, res) => {
  const r = runners.get(req.params.id);
  res.json({ running: r ? r.isRunning : false });
});
// List directories for workdir picker
app.get("/api/dirs", (req, res) => {
  const dir = req.query.path || "/root";
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => path.join(dir, e.name))
      .sort();
    // Also check if this dir has .claude folder (CLAUDE.md etc)
    const hasClaude = fs.existsSync(path.join(dir, ".claude")) || fs.existsSync(path.join(dir, "CLAUDE.md"));
    res.json({ current: dir, parent: path.dirname(dir), dirs, hasClaude });
  } catch {
    res.json({ current: dir, parent: path.dirname(dir), dirs: [], hasClaude: false });
  }
});
app.delete("/api/sessions/:id", (req, res) => {
  saveSessions(loadSessions().filter((s) => s.id !== req.params.id));
  const r = runners.get(req.params.id);
  if (r && r.proc) { r.proc.kill("SIGTERM"); runners.delete(req.params.id); }
  try { fs.unlinkSync(getSessionLogPath(req.params.id)); } catch {}
  res.json({ ok: true });
});
// Slack config endpoints
app.get("/api/slack/config", (req, res) => {
  const url = slack.getWebhookUrl();
  res.json({ enabled: !!url, webhookUrl: url ? url.replace(/\/[^/]{6}$/, "/******") : null });
});
app.post("/api/slack/config", (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "webhookUrl required" });
  slack.setWebhookUrl(webhookUrl);
  res.json({ ok: true, enabled: true });
});
app.post("/api/slack/test", async (req, res) => {
  if (!slack.isEnabled()) return res.status(400).json({ error: "Slack webhook not configured. POST /api/slack/config first." });
  try {
    await slack.notifyTest();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.use(express.static(path.join(__dirname, "public")));

// ── Runners: Claude processes that survive WS disconnects ──
const runners = new Map();

// ── Ping/pong keepalive every 25s ──
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

// ── WebSocket ──
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  // Track which session this WS client is currently viewing
  let activeSessionId = null;
  let currentModel = "opus";

  function send(obj) {
    if (ws.readyState === 1) ws.send(typeof obj === "string" ? obj : JSON.stringify(obj));
  }

  function runPrompt(msg) {
    // Determine which session this prompt belongs to
    const targetSid = msg.sessionId || activeSessionId;

    // Get or create runner
    let runner = targetSid ? runners.get(targetSid) : null;
    if (!runner) {
      runner = {
        proc: null, isRunning: false, contentBlocks: [],
        saveTimer: null, assistantStarted: false, messageCount: 0,
        firstPrompt: "", currentWorkdir: "/root", currentModel: "opus",
        pendingQueue: [], ws: null, sessionId: targetSid,
      };
      if (targetSid) runners.set(targetSid, runner);
    }

    if (runner.proc) { runner.proc.kill("SIGTERM"); runner.proc = null; }

    runner.isRunning = true;
    runner.ws = ws;
    runner.currentWorkdir = msg.workdir || "/root";
    runner.currentModel = msg.model || currentModel;
    runner.contentBlocks = [];
    runner.assistantStarted = false;
    runner.messageCount++;
    if (runner.messageCount === 1) runner.firstPrompt = msg.text.substring(0, 60);

    if (targetSid) appendMessage(targetSid, { role: "user", text: msg.text, ts: Date.now() });

    const args = [
      "-p", msg.text, "--output-format", "stream-json", "--verbose",
      "--permission-mode", "auto", "--model", runner.currentModel,
    ];
    if (msg.sessionId) {
      activeSessionId = msg.sessionId;
      args.push("--resume", msg.sessionId);
    } else if (targetSid && msg.continueSession) {
      args.push("--resume", targetSid);
    }

    // Inherit full environment but remove CLAUDECODE to avoid nested-session error
    const env = Object.assign({}, process.env);
    delete env.CLAUDECODE;

    console.log(`[spawn] claude (session: ${targetSid || "new"}, model: ${runner.currentModel})`);

    const proc = spawn("script",
      ["-qfc", `claude ${args.map((a) => JSON.stringify(a)).join(" ")}`, "/dev/null"],
      { cwd: runner.currentWorkdir, env, stdio: ["pipe", "pipe", "pipe"] }
    );
    runner.proc = proc;

    // Capture the session ID for this specific process run
    // This ensures saves/emits go to the correct session even if user switches
    let procSessionId = targetSid;

    let buffer = "";

    // emit: send to the runner's current WS — only if user is viewing this session
    function emit(data) {
      if (runner.ws && runner.ws.readyState === 1) {
        // Tag with sessionId so client can ignore if viewing different session
        data._sessionId = procSessionId;
        runner.ws.send(JSON.stringify(data));
      }
    }

    function scheduleSave() {
      if (runner.saveTimer) return;
      runner.saveTimer = setTimeout(() => {
        runner.saveTimer = null;
        if (procSessionId && runner.contentBlocks.length > 0) {
          updateLastAssistantMessage(procSessionId, runner.contentBlocks.slice());
        }
      }, 500);
    }

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.replace(/\r/g, "").trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);

          if (parsed.type === "system" && parsed.session_id) {
            const isNew = !procSessionId;
            procSessionId = parsed.session_id;
            runner.sessionId = procSessionId;
            activeSessionId = procSessionId;
            runners.set(procSessionId, runner);
            upsertSession(procSessionId, {
              title: runner.firstPrompt || "New session", workdir: runner.currentWorkdir,
              model: runner.currentModel, messageCount: runner.messageCount,
            });
            if (isNew) {
              const msgs = loadMessages(procSessionId);
              if (msgs.length === 0) appendMessage(procSessionId, { role: "user", text: runner.firstPrompt, ts: Date.now() });
            }
            emit({ type: "session_info", sessionId: procSessionId, title: runner.firstPrompt });
          }

          if (parsed.type === "assistant" && parsed.message?.content) {
            if (!runner.assistantStarted && procSessionId) {
              runner.assistantStarted = true;
              appendMessage(procSessionId, { role: "assistant", text: "", content: [], ts: Date.now() });
            }
            for (const block of parsed.message.content) {
              if (block.type === "text") {
                const lastBlock = runner.contentBlocks[runner.contentBlocks.length - 1];
                if (lastBlock && lastBlock.type === "text") {
                  lastBlock.text += block.text;
                } else {
                  runner.contentBlocks.push({ type: "text", text: block.text });
                }
              }
              if (block.type === "tool_use") {
                runner.contentBlocks.push({ type: "tool_use", name: block.name, input: block.input });
              }
            }
            scheduleSave();
          }

          if (parsed.type === "tool_use") {
            runner.contentBlocks.push({ type: "tool_use", name: parsed.tool_name || parsed.name, input: parsed.input || parsed.arguments });
          }

          // Detect API error messages in assistant content
          if (parsed.type === "assistant" && parsed.message?.content) {
            for (const block of parsed.message.content) {
              if (block.type === "text" && block.text && block.text.includes("API Error:")) {
                emit({ type: "error", message: block.text.trim() });
                slack.notifyError({
                  sessionId: procSessionId, message: block.text.trim(),
                  workdir: runner.currentWorkdir, model: runner.currentModel,
                });
              }
            }
          }

          emit(parsed);
        } catch { /* skip non-JSON */ }
      }
    });

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      console.error(`[stderr] ${text}`);
      // Forward API errors to the client
      if (text.includes("API Error") || text.includes("invalid_request_error") || text.includes("authentication_error")) {
        emit({ type: "error", message: text.trim() });
        slack.notifyError({
          sessionId: procSessionId, message: text.trim(),
          workdir: runner.currentWorkdir, model: runner.currentModel,
        });
      }
    });

    proc.on("close", (code) => {
      console.log(`[close] exit ${code}, session: ${procSessionId}`);
      if (runner.saveTimer) { clearTimeout(runner.saveTimer); runner.saveTimer = null; }
      if (procSessionId && runner.contentBlocks.length > 0) {
        updateLastAssistantMessage(procSessionId, runner.contentBlocks.slice());
        upsertSession(procSessionId, {
          title: runner.firstPrompt || "Session", workdir: runner.currentWorkdir,
          model: runner.currentModel, messageCount: runner.messageCount,
        });
      }
      runner.isRunning = false;
      runner.proc = null;
      emit({ type: "process_end", code });
      slack.notifyComplete({
        sessionId: procSessionId, exitCode: code,
        workdir: runner.currentWorkdir, model: runner.currentModel,
        title: runner.firstPrompt,
      });

      if (runner.pendingQueue.length > 0) {
        runPrompt(runner.pendingQueue.shift());
      } else {
        setTimeout(() => {
          const r = runners.get(procSessionId);
          if (r && !r.isRunning) runners.delete(procSessionId);
        }, 60000);
      }
    });
  }

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "prompt") {
      // Use the session from the message, or the active one
      const sid = msg.sessionId || activeSessionId;
      const runner = sid ? runners.get(sid) : null;
      if (runner && runner.isRunning) {
        runner.pendingQueue.push(msg);
        send({ type: "queued", position: runner.pendingQueue.length, text: msg.text });
      } else {
        runPrompt(msg);
      }
    }

    if (msg.type === "set_session") {
      activeSessionId = msg.sessionId;
      currentModel = msg.model || "opus";
      // Point runner's WS to this connection + tell client if still running
      const runner = runners.get(activeSessionId);
      if (runner) {
        runner.ws = ws;
        runner.messageCount = msg.messageCount || runner.messageCount;
        runner.firstPrompt = msg.title || runner.firstPrompt;
        if (runner.isRunning) {
          send({
            type: "still_running", sessionId: activeSessionId,
            contentBlocks: runner.contentBlocks.length > 0 ? runner.contentBlocks : undefined,
          });
        }
      }
    }

    if (msg.type === "new_session") { activeSessionId = null; }
    if (msg.type === "set_model") { currentModel = msg.model; }

    if (msg.type === "abort") {
      const runner = activeSessionId ? runners.get(activeSessionId) : null;
      if (runner) {
        runner.pendingQueue = [];
        if (runner.proc) { runner.proc.kill("SIGTERM"); runner.proc = null; }
        runner.isRunning = false;
      }
      send({ type: "aborted" });
    }
  });

  ws.on("close", () => {
    console.log(`[ws close] session: ${activeSessionId} — Claude keeps running`);
  });
});

const PORT = process.env.PORT || 8181;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => console.log(`Claude Web UI on http://${HOST}:${PORT}`));
