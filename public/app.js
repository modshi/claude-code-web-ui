(() => {
  const messagesEl = document.getElementById("messages");
  const promptInput = document.getElementById("promptInput");
  const sendBtn = document.getElementById("sendBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusText = document.getElementById("statusText");
  const modelLabel = document.getElementById("modelLabel");
  const modelBtn = document.getElementById("modelBtn");
  const modelMenu = document.getElementById("modelMenu");
  const sessionBtn = document.getElementById("sessionBtn");
  const sessionMenu = document.getElementById("sessionMenu");
  const sessionLabel = document.getElementById("sessionLabel");
  const sessionList = document.getElementById("sessionList");
  const newSessionBtn = document.getElementById("newSessionBtn");
  const workdirInput = document.getElementById("workdirInput");
  const fontUpBtn = document.getElementById("fontUpBtn");
  const fontDownBtn = document.getElementById("fontDownBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  const activityBar = document.getElementById("activityBar");
  const activityText = document.getElementById("activityText");
  const wsDot = document.getElementById("wsDot");
  const wsLabel = document.getElementById("wsLabel");
  const workdirBtn = document.getElementById("workdirBtn");
  const workdirLabel = document.getElementById("workdirLabel");
  const dirPickerOverlay = document.getElementById("dirPickerOverlay");
  const dirPickerClose = document.getElementById("dirPickerClose");
  const dirPickerCurrent = document.getElementById("dirPickerCurrent");
  const dirPickerInput = document.getElementById("dirPickerInput");
  const dirPickerGo = document.getElementById("dirPickerGo");
  const dirPickerList = document.getElementById("dirPickerList");
  const dirPickerSelect = document.getElementById("dirPickerSelect");
  const dirPickerHint = document.getElementById("dirPickerHint");
  const mobileMoreBtn = document.getElementById("mobileMoreBtn");
  const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");
  const mobileMenu = document.getElementById("mobileMenu");
  const mobileModelItem = document.getElementById("mobileModelItem");
  const mobileModelLabel = document.getElementById("mobileModelLabel");
  const mobileWorkdirItem = document.getElementById("mobileWorkdirItem");
  const mobileWorkdirLabel = document.getElementById("mobileWorkdirLabel");
  const mobileFontUpItem = document.getElementById("mobileFontUpItem");
  const mobileFontDownItem = document.getElementById("mobileFontDownItem");
  const mobileRefreshItem = document.getElementById("mobileRefreshItem");

  let ws = null;
  let isProcessing = false;
  let currentAssistantEl = null;
  let currentTextBuffer = "";
  let sessionActive = false;
  let currentSessionId = localStorage.getItem("claude-session-id") || null;
  let currentModel = localStorage.getItem("claude-model") || "opus";

  const WELCOME_HTML = `
    <div class="welcome">
      <div class="welcome-icon">
        <svg viewBox="0 0 46 46" width="48" height="48">
          <path fill="#D97706" d="M23 0C10.297 0 0 10.297 0 23s10.297 23 23 23 23-10.297 23-23S35.703 0 23 0z"/>
          <path fill="#FFF" d="M13.5 18.5c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5v4c0 1.933-1.567 3.5-3.5 3.5s-3.5-1.567-3.5-3.5v-4zm12 0c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5v4c0 1.933-1.567 3.5-3.5 3.5s-3.5-1.567-3.5-3.5v-4zM15 31c0-.552.448-1 1-1h14c.552 0 1 .448 1 1s-.448 1-1 1H16c-.552 0-1-.448-1-1z"/>
        </svg>
      </div>
      <h2>What can I help you with?</h2>
      <p class="welcome-sub">I can read, edit, and create files, run commands, search your codebase, and more.</p>
    </div>`;

  // ── Markdown setup ──
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  });

  // ── Mobile keyboard handling ──
  function updateAppHeight() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", vh + "px");
    // Prevent page from scrolling behind keyboard
    window.scrollTo(0, 0);
    scrollToBottom();
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateAppHeight);
    window.visualViewport.addEventListener("scroll", () => window.scrollTo(0, 0));
  }
  window.addEventListener("resize", updateAppHeight);
  updateAppHeight();

  // ── WebSocket status indicator ──
  function setWsStatus(state) {
    // state: "connected", "disconnected", "reconnecting"
    if (wsDot) wsDot.className = "ws-dot " + state;
    const labels = { connected: "Connected", disconnected: "Disconnected", reconnecting: "Reconnecting..." };
    if (wsLabel) wsLabel.textContent = labels[state] || state;

    // Show notifications on connection changes
    if (state === "disconnected") {
      showNotification("Connection lost, reconnecting...", "warning", 0);
    } else if (state === "connected") {
      removeNotification(notificationQueue.find(n => n.element?.textContent.includes("reconnecting"))?.id);
      showNotification("Connected", "success", 2000);
    }
  }

  // ── WebSocket ──
  function connect() {
    setWsStatus("reconnecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.onopen = () => {
      setWsStatus("connected");
      if (currentSessionId) {
        // Tell server which session we're on — server will respond with
        // still_running if Claude is active, otherwise we set Ready
        setStatus("Reconnecting...", false);
        ws.send(JSON.stringify({
          type: "set_session",
          sessionId: currentSessionId,
          title: sessionLabel.textContent,
          model: currentModel,
        }));
        // Silently refresh messages without flash (skipIfCached=true)
        reloadMessages(currentSessionId, true);
        // Set Ready after a short delay if server doesn't send still_running
        setTimeout(() => {
          if (!isProcessing) {
            setStatus("Ready", false);
            setActivity(null);
          }
        }, 500);
      } else {
        setStatus("Ready", false);
        setActivity(null);
        finishProcessing();
      }
    };
    ws.onclose = () => {
      setWsStatus("disconnected");
      setStatus("Disconnected", false);
      // Reconnect every 1s, only if page is visible
      if (!document.hidden) setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      // Ignore messages from a different session (user switched away)
      if (data._sessionId && data._sessionId !== currentSessionId) return;
      handleMessage(data);
    };
  }

  // ── Activity bar ──
  function setActivity(text) {
    if (text) {
      activityText.textContent = text;
      activityBar.classList.remove("hidden");
    } else {
      activityBar.classList.add("hidden");
    }
  }

  function getToolActivity(name, input) {
    if (typeof input === "string") {
      try { input = JSON.parse(input); } catch {}
    }
    switch (name) {
      case "Read": return "Reading " + (input?.file_path || "file").split("/").pop();
      case "Edit": return "Editing " + (input?.file_path || "file").split("/").pop();
      case "Write": return "Writing " + (input?.file_path || "file").split("/").pop();
      case "Bash": return "Running command...";
      case "Glob": return "Searching files...";
      case "Grep": return "Searching code...";
      case "WebFetch": return "Fetching URL...";
      case "WebSearch": return "Searching web...";
      case "TodoWrite": return "Updating tasks...";
      case "Agent": return "Running agent...";
      default: return "Using " + name + "...";
    }
  }

  function handleMessage(data) {
    switch (data.type) {
      case "system":
        if (data.model) {
          const short = data.model.replace("claude-", "").split("-")[0];
          modelLabel.textContent = short;
        }
        setActivity("Starting...");
        break;
      case "session_info":
        currentSessionId = data.sessionId;
        localStorage.setItem("claude-session-id", currentSessionId);
        if (data.title) sessionLabel.textContent = data.title;
        break;
      case "still_running":
        // Claude is still active — set processing state properly
        isProcessing = true;
        sendBtn.classList.add("hidden");
        stopBtn.classList.remove("hidden");
        setStatus("Claude is working...", true);
        setActivity("Working...");
        // If server sent in-progress content blocks, render them
        if (data.contentBlocks && data.contentBlocks.length > 0) {
          for (const block of data.contentBlocks) {
            if (block.type === "text") {
              if (!currentAssistantEl) {
                currentAssistantEl = createMessageEl("assistant");
                currentTextBuffer = "";
              }
              currentTextBuffer += block.text;
              renderAssistantText();
            } else if (block.type === "tool_use") {
              flushAssistantText();
              const toolEl = createToolCall(block.name, block.input);
              messagesEl.appendChild(toolEl);
            }
          }
          scrollToBottom();
        }
        break;
      case "assistant":
        removeThinking();
        if (data.message?.content) {
          const hasThinking = data.message.content.some(b => b.type === "thinking");
          const hasText = data.message.content.some(b => b.type === "text");
          if (hasThinking) setActivity("Thinking...");
          else if (hasText) setActivity("Writing...");
        }
        handleAssistant(data);
        break;
      case "tool_use":
        removeThinking();
        setActivity(getToolActivity(data.tool_name || data.name, data.input || data.arguments));
        handleToolUse(data);
        break;
      case "tool_result":
        setActivity("Processing results...");
        handleToolResult(data);
        break;
      case "result":
        setActivity(null);
        handleResult(data);
        break;
      case "process_end":
        setActivity(null);
        finishProcessing();
        showNotification("Response complete", "success", 3000);
        sendBrowserNotification("Claude", { body: "Response complete" });
        break;
      case "queued":
        showQueued(data);
        showNotification(`Queued at position ${data.position}`, "info", 2000);
        break;
      case "aborted":
        setActivity(null);
        finishProcessing();
        showNotification("Request cancelled", "warning", 2000);
        break;
      case "error":
        setActivity(null);
        appendError(data.message);
        showNotification(`Error: ${data.message}`, "error", 5000);
        sendBrowserNotification("Claude Error", { body: data.message });
        break;
    }
  }

  // ── Message handlers ──

  function handleAssistant(data) {
    if (!data.message || !data.message.content) return;

    for (const block of data.message.content) {
      if (block.type === "thinking") {
        showThinkingBlock(block.thinking);
      } else if (block.type === "text") {
        if (!currentAssistantEl) {
          currentAssistantEl = createMessageEl("assistant");
          currentTextBuffer = "";
        }
        currentTextBuffer += block.text;
        renderAssistantText();
      } else if (block.type === "tool_use") {
        flushAssistantText();
        setActivity(getToolActivity(block.name, block.input));
        handleToolUseBlock(block);
      }
    }
  }

  function handleToolUseBlock(block) {
    const toolEl = createToolCall(block.name, block.input);
    messagesEl.appendChild(toolEl);
    scrollToBottom();
  }

  function handleToolUse(data) {
    flushAssistantText();
    const toolEl = createToolCall(data.tool_name || data.name, data.input || data.arguments);
    messagesEl.appendChild(toolEl);
    scrollToBottom();
  }

  function handleToolResult(data) {
    const resultEl = document.createElement("div");
    const isError = data.is_error || data.error;
    resultEl.className = `tool-result${isError ? " error" : ""}`;

    let content = "";
    if (typeof data.content === "string") {
      content = data.content;
    } else if (Array.isArray(data.content)) {
      content = data.content.map((c) => (c.type === "text" ? c.text : JSON.stringify(c))).join("\n");
    } else if (data.result) {
      content = typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
    }
    if (content.length > 2000) content = content.substring(0, 2000) + "\n... (truncated)";

    resultEl.textContent = content;
    messagesEl.appendChild(resultEl);
    scrollToBottom();
  }

  function handleResult(data) {
    if (data.total_cost_usd && currentAssistantEl) {
      const badge = document.createElement("span");
      badge.className = "cost-badge";
      badge.textContent = `$${data.total_cost_usd.toFixed(4)}`;
      currentAssistantEl.querySelector(".message-header").appendChild(badge);
    }
    finishProcessing();
  }

  // ── Render helpers ──

  function createMessageEl(role) {
    const welcome = messagesEl.querySelector(".welcome");
    if (welcome) welcome.remove();

    const el = document.createElement("div");
    el.className = `message ${role}`;

    const header = document.createElement("div");
    header.className = "message-header";

    const icon = document.createElement("span");
    icon.className = "message-role-icon";
    icon.textContent = role === "user" ? "U" : "C";

    const label = document.createElement("span");
    label.textContent = role === "user" ? "You" : "Claude";

    header.appendChild(icon);
    header.appendChild(label);

    const body = document.createElement("div");
    body.className = "message-body";

    el.appendChild(header);
    el.appendChild(body);
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function renderAssistantText() {
    if (!currentAssistantEl) return;
    const body = currentAssistantEl.querySelector(".message-body");

    let html = marked.parse(currentTextBuffer);

    html = html.replace(
      /<pre><code class="language-(\w+)">/g,
      `<pre><div class="code-block-header"><span class="lang">$1</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><code class="language-$1">`
    );
    html = html.replace(
      /<pre><code>/g,
      `<pre><div class="code-block-header"><span class="lang">text</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><code>`
    );

    body.innerHTML = html;
    scrollToBottom();
  }

  function showThinkingBlock(text) {
    flushAssistantText();
    const el = document.createElement("div");
    el.className = "thinking-block";
    const preview = text.substring(0, 80).replace(/\n/g, " ");
    el.innerHTML = `
      <div class="thinking-block-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="thinking-block-chevron">&#9654;</span>
        <span>💭</span>
        <span style="color:var(--green);font-family:var(--font-mono);font-weight:600">Thinking</span>
        <span style="color:var(--text-muted);font-size:11px;margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">${escapeHtml(preview)}...</span>
      </div>
      <div class="thinking-block-body">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function createToolCall(name, input) {
    const el = document.createElement("div");
    el.className = "tool-call";
    const icon = getToolIcon(name);
    const summary = getToolSummary(name, input);

    el.innerHTML = `
      <div class="tool-call-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="tool-call-chevron">&#9654;</span>
        <span class="tool-call-icon">${icon}</span>
        <span class="tool-call-name">${escapeHtml(name)}</span>
        <span class="tool-call-summary">${escapeHtml(summary)}</span>
      </div>
      <div class="tool-call-body">${escapeHtml(formatInput(input))}</div>
    `;
    return el;
  }

  function getToolIcon(name) {
    const icons = {
      Read: "📄", Edit: "✏️", Write: "📝", Bash: "⚡",
      Glob: "🔍", Grep: "🔎", WebFetch: "🌐", WebSearch: "🔍",
      TodoWrite: "✅", Agent: "🤖",
    };
    return icons[name] || "🔧";
  }

  function getToolSummary(name, input) {
    if (!input) return "";
    if (typeof input === "string") {
      try { input = JSON.parse(input); } catch { return input.substring(0, 60); }
    }
    switch (name) {
      case "Read": return input.file_path || "";
      case "Edit": return input.file_path || "";
      case "Write": return input.file_path || "";
      case "Bash": return (input.command || "").substring(0, 80);
      case "Glob": return input.pattern || "";
      case "Grep": return input.pattern || "";
      default: return Object.values(input)[0]?.toString().substring(0, 60) || "";
    }
  }

  function formatInput(input) {
    if (!input) return "";
    if (typeof input === "string") return input;
    return JSON.stringify(input, null, 2);
  }

  function flushAssistantText() {
    currentAssistantEl = null;
    currentTextBuffer = "";
  }

  function appendError(text) {
    const el = document.createElement("div");
    el.className = "tool-result error";
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function showThinking() {
    removeThinking();
    const el = document.createElement("div");
    el.className = "thinking";
    el.id = "thinkingIndicator";
    el.innerHTML = `
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      <span>Claude is thinking...</span>
    `;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function removeThinking() {
    const el = document.getElementById("thinkingIndicator");
    if (el) el.remove();
  }

  function showQueued(data) {
    const el = document.createElement("div");
    el.className = "queued-badge";
    el.innerHTML = `⏳ Queued (#${data.position}): ${escapeHtml(data.text.substring(0, 50))}`;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  // ── Session management ──

  async function loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      return await res.json();
    } catch { return []; }
  }

  async function loadSessionMessages(sessionId) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      return await res.json();
    } catch { return []; }
  }

  async function deleteSession(id, ev) {
    ev.stopPropagation();
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    renderSessionList();
  }

  async function renderSessionList() {
    const sessions = await loadSessions();
    if (sessions.length === 0) {
      sessionList.innerHTML = '<div class="session-empty">No saved sessions</div>';
      return;
    }

    sessionList.innerHTML = sessions.map((s) => {
      const date = new Date(s.updatedAt);
      const timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const isActive = s.id === currentSessionId;
      return `
        <div class="session-item${isActive ? " active" : ""}" data-id="${s.id}" data-title="${escapeAttr(s.title)}" data-workdir="${escapeAttr(s.workdir)}">
          <div class="session-item-info">
            <div class="session-item-title">${escapeHtml(s.title)}</div>
            <div class="session-item-meta">${escapeHtml(s.workdir)} · ${timeStr}</div>
          </div>
          <button class="session-item-delete" data-delete="${s.id}" title="Delete">×</button>
        </div>
      `;
    }).join("");

    sessionList.querySelectorAll(".session-item").forEach((el) => {
      el.addEventListener("click", () => resumeSession(el.dataset.id, el.dataset.title, el.dataset.workdir));
    });
    sessionList.querySelectorAll(".session-item-delete").forEach((el) => {
      el.addEventListener("click", (ev) => deleteSession(el.dataset.delete, ev));
    });
  }

  function buildMessagesHTML(messages) {
    if (messages.length === 0) return WELCOME_HTML;
    const parts = [];
    for (const msg of messages) {
      if (msg.role === "user") {
        parts.push(`<div class="message user"><div class="message-header"><span class="message-role-icon">U</span><span>You</span></div><div class="message-body">${escapeHtml(msg.text)}</div></div>`);
        continue;
      }
      // Assistant: render content blocks in order if available
      if (msg.content && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push(`<div class="message assistant"><div class="message-header"><span class="message-role-icon">C</span><span>Claude</span></div><div class="message-body">${marked.parse(block.text || "")}</div></div>`);
          } else if (block.type === "tool_use") {
            const icon = getToolIcon(block.name);
            const summary = getToolSummary(block.name, block.input);
            parts.push(`<div class="tool-call"><div class="tool-call-header" onclick="this.parentElement.classList.toggle('expanded')"><span class="tool-call-chevron">&#9654;</span><span class="tool-call-icon">${icon}</span><span class="tool-call-name">${escapeHtml(block.name)}</span><span class="tool-call-summary">${escapeHtml(summary)}</span></div><div class="tool-call-body">${escapeHtml(formatInput(block.input))}</div></div>`);
          }
        }
      } else {
        // Fallback for old format (text + tools)
        parts.push(`<div class="message assistant"><div class="message-header"><span class="message-role-icon">C</span><span>Claude</span></div><div class="message-body">${marked.parse(msg.text || "")}</div></div>`);
        if (msg.tools) {
          for (const tool of msg.tools) {
            const icon = getToolIcon(tool.name);
            const summary = getToolSummary(tool.name, tool.input);
            parts.push(`<div class="tool-call"><div class="tool-call-header" onclick="this.parentElement.classList.toggle('expanded')"><span class="tool-call-chevron">&#9654;</span><span class="tool-call-icon">${icon}</span><span class="tool-call-name">${escapeHtml(tool.name)}</span><span class="tool-call-summary">${escapeHtml(summary)}</span></div><div class="tool-call-body">${escapeHtml(formatInput(tool.input))}</div></div>`);
          }
        }
      }
    }
    return parts.join("");
  }

  async function reloadMessages(sessionId, skipIfCached) {
    // If skipIfCached, show cached HTML instantly and refresh in background
    const cacheKey = "claude-msgs-html-" + sessionId;
    const cached = sessionStorage.getItem(cacheKey);

    if (skipIfCached && cached && messagesEl.children.length > 0) {
      // Already showing content, don't flash — just do a silent background refresh
      const messages = await loadSessionMessages(sessionId);
      const html = buildMessagesHTML(messages);
      sessionStorage.setItem(cacheKey, html);
      // Only update if content actually changed
      if (messagesEl.innerHTML !== html) {
        messagesEl.innerHTML = html;
        scrollToBottom();
      }
      return;
    }

    // Show cached HTML instantly (no flash)
    if (cached) {
      messagesEl.innerHTML = cached;
      scrollToBottom();
      // Then refresh from server in background
      loadSessionMessages(sessionId).then(messages => {
        const html = buildMessagesHTML(messages);
        sessionStorage.setItem(cacheKey, html);
        if (messagesEl.innerHTML !== html) {
          messagesEl.innerHTML = html;
          scrollToBottom();
        }
      });
      return;
    }

    // No cache — fetch and render
    const messages = await loadSessionMessages(sessionId);
    const html = buildMessagesHTML(messages);
    sessionStorage.setItem(cacheKey, html);
    messagesEl.innerHTML = html;
    scrollToBottom();
  }

  async function resumeSession(id, title, workdir) {
    // Reset processing state from previous session
    finishProcessing();

    currentSessionId = id;
    localStorage.setItem("claude-session-id", id);
    sessionActive = true;
    sessionLabel.textContent = title || "Session";
    if (workdir) {
      workdirInput.value = workdir;
      workdirLabel.textContent = workdir;
      localStorage.setItem("claude-workdir", workdir);
    }
    closeSessionMenu();

    // Load and render — this is an explicit session switch so don't skip
    await reloadMessages(id, false);

    if (ws && ws.readyState === WebSocket.OPEN) {
      // Tell server we switched — it will reply with still_running if this session is active
      ws.send(JSON.stringify({ type: "set_session", sessionId: id, title, model: currentModel }));
    }
  }

  function startNewSession() {
    currentSessionId = null;
    localStorage.removeItem("claude-session-id");
    sessionActive = false;
    sessionLabel.textContent = "New Session";
    closeSessionMenu();
    messagesEl.innerHTML = WELCOME_HTML;
    // Clear all message caches
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith("claude-msgs-html-")) sessionStorage.removeItem(k);
    });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "new_session" }));
    }
  }

  function toggleSessionMenu() {
    if (sessionMenu.classList.contains("open")) {
      closeSessionMenu();
    } else {
      renderSessionList();
      const rect = sessionBtn.getBoundingClientRect();
      sessionMenu.style.top = (rect.bottom + 4) + "px";
      sessionMenu.classList.add("open");
    }
  }

  function closeSessionMenu() { sessionMenu.classList.remove("open"); }

  // ── Model selector ──

  function setModel(model) {
    currentModel = model;
    localStorage.setItem("claude-model", model);
    modelLabel.textContent = model;
    modelMenu.classList.remove("open");

    // Update selected state
    modelMenu.querySelectorAll(".model-option").forEach((el) => {
      el.classList.toggle("selected", el.dataset.model === model);
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_model", model }));
    }
  }

  // ── Actions ──

  function sendPrompt() {
    const text = promptInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    const userEl = createMessageEl("user");
    userEl.querySelector(".message-body").textContent = text;

    promptInput.value = "";
    autoResize();

    if (!isProcessing) {
      isProcessing = true;
      sendBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      setStatus("Processing...", true);
      showThinking();
    }

    ws.send(JSON.stringify({
      type: "prompt",
      text,
      workdir: workdirInput.value.trim() || "/root",
      continueSession: sessionActive,
      sessionId: currentSessionId,
      model: currentModel,
    }));

    sessionActive = true;
  }

  function abortProcessing() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "abort" }));
    }
  }

  function finishProcessing() {
    flushAssistantText();
    removeThinking();
    isProcessing = false;
    sendBtn.classList.remove("hidden");
    stopBtn.classList.add("hidden");
    setStatus("Ready", false);
    // Cache current messages HTML for instant restore on refresh
    if (currentSessionId) {
      sessionStorage.setItem("claude-msgs-html-" + currentSessionId, messagesEl.innerHTML);
    }
  }

  function setStatus(text, active) {
    if (!statusText) return;
    statusText.textContent = text;
    statusText.className = active ? "active" : "";
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  window.copyCode = function (btn) {
    const code = btn.closest("pre").querySelector("code");
    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
  };

  function autoResize() {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 150) + "px";
  }

  // ── Event listeners ──

  promptInput.addEventListener("input", autoResize);
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });

  sendBtn.addEventListener("click", sendPrompt);
  stopBtn.addEventListener("click", abortProcessing);

  sessionBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleSessionMenu(); });
  newSessionBtn.addEventListener("click", (e) => { e.stopPropagation(); startNewSession(); });

  modelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    modelMenu.classList.toggle("open");
    if (settingsMenu) settingsMenu.classList.remove("open");
  });

  if (settingsBtn && settingsMenu) {
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsMenu.classList.toggle("open");
      modelMenu.classList.remove("open");
      closeSessionMenu();
    });
  }

  modelMenu.querySelectorAll(".model-option").forEach((el) => {
    el.addEventListener("click", () => setModel(el.dataset.model));
  });

  document.addEventListener("click", (e) => {
    if (!sessionMenu.contains(e.target) && e.target !== sessionBtn) closeSessionMenu();
    if (!modelMenu.contains(e.target) && e.target !== modelBtn) modelMenu.classList.remove("open");
    if (settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) settingsMenu.classList.remove("open");
  });

  // ── Font size ──
  const FONT_MIN = 10;
  const FONT_MAX = 20;
  const FONT_STEP = 1;
  const FONT_DEFAULT = 13;

  function getBaseFontSize() {
    return parseInt(localStorage.getItem("claude-font-size") || FONT_DEFAULT, 10);
  }

  function setBaseFontSize(size) {
    size = Math.max(FONT_MIN, Math.min(FONT_MAX, size));
    localStorage.setItem("claude-font-size", size);
    document.documentElement.style.setProperty("--base-font-size", size + "px");
  }

  if (fontUpBtn) fontUpBtn.addEventListener("click", () => setBaseFontSize(getBaseFontSize() + FONT_STEP));
  if (fontDownBtn) fontDownBtn.addEventListener("click", () => setBaseFontSize(getBaseFontSize() - FONT_STEP));
  if (refreshBtn) refreshBtn.addEventListener("click", () => location.reload());

  // Mobile more menu
  function closeMobileMenu() { mobileMenuOverlay.classList.add("hidden"); }
  mobileMoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mobileModelLabel.textContent = currentModel;
    mobileWorkdirLabel.textContent = workdirInput.value || "/root";
    // Position menu below button
    const rect = mobileMoreBtn.getBoundingClientRect();
    mobileMenu.style.top = (rect.bottom + 8) + "px";
    mobileMenu.style.right = "8px";
    mobileMenuOverlay.classList.remove("hidden");
  });
  mobileMenuOverlay.addEventListener("click", closeMobileMenu);
  mobileModelItem.addEventListener("click", () => {
    const models = ["opus", "sonnet", "haiku"];
    const idx = (models.indexOf(currentModel) + 1) % models.length;
    setModel(models[idx]);
    mobileModelLabel.textContent = models[idx];
  });
  mobileWorkdirItem.addEventListener("click", () => { closeMobileMenu(); openDirPicker(); });
  if (mobileFontDownItem) mobileFontDownItem.addEventListener("click", () => setBaseFontSize(getBaseFontSize() - FONT_STEP));
  if (mobileFontUpItem) mobileFontUpItem.addEventListener("click", () => setBaseFontSize(getBaseFontSize() + FONT_STEP));
  if (mobileRefreshItem) mobileRefreshItem.addEventListener("click", () => location.reload());

  // ── Directory Picker ──
  let dirPickerCurrentPath = workdirInput.value || "/root";

  function openDirPicker() {
    dirPickerCurrentPath = workdirInput.value || "/root";
    dirPickerInput.value = dirPickerCurrentPath;
    dirPickerOverlay.classList.remove("hidden");
    loadDir(dirPickerCurrentPath);
  }

  function closeDirPicker() {
    dirPickerOverlay.classList.add("hidden");
  }

  async function loadDir(dirPath) {
    dirPickerCurrentPath = dirPath;
    dirPickerCurrent.textContent = dirPath;
    dirPickerInput.value = dirPath;
    dirPickerList.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px">Loading...</div>';

    try {
      const res = await fetch(`/api/dirs?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();

      dirPickerHint.textContent = data.hasClaude ? ".claude found" : "";

      let html = "";
      // Parent directory link
      if (data.parent && data.parent !== dirPath) {
        html += `<div class="dir-picker-item parent-dir" data-path="${escapeAttr(data.parent)}">
          <span class="dir-icon">..</span>
          <span class="dir-name">${escapeHtml(data.parent)}</span>
        </div>`;
      }
      // Subdirectories
      for (const d of data.dirs) {
        const name = d.split("/").pop();
        html += `<div class="dir-picker-item" data-path="${escapeAttr(d)}">
          <span class="dir-icon">📁</span>
          <span class="dir-name">${escapeHtml(name)}</span>
        </div>`;
      }
      if (data.dirs.length === 0 && !data.parent) {
        html = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center">No subdirectories</div>';
      }
      dirPickerList.innerHTML = html;

      // Click handlers for directory items
      dirPickerList.querySelectorAll(".dir-picker-item").forEach(el => {
        el.addEventListener("click", () => loadDir(el.dataset.path));
      });
    } catch {
      dirPickerList.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">Failed to load directory</div>';
    }
  }

  function selectDir() {
    const dir = dirPickerCurrentPath;
    workdirInput.value = dir;
    workdirLabel.textContent = dir;
    localStorage.setItem("claude-workdir", dir);
    closeDirPicker();
  }

  workdirBtn.addEventListener("click", openDirPicker);
  dirPickerClose.addEventListener("click", closeDirPicker);
  dirPickerOverlay.addEventListener("click", (e) => {
    if (e.target === dirPickerOverlay) closeDirPicker();
  });
  dirPickerSelect.addEventListener("click", selectDir);
  dirPickerGo.addEventListener("click", () => {
    const val = dirPickerInput.value.trim();
    if (val) loadDir(val);
  });
  dirPickerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = dirPickerInput.value.trim();
      if (val) loadDir(val);
    }
  });

  // Apply saved font size on load
  setBaseFontSize(getBaseFontSize());

  // Restore saved workdir
  const savedWorkdir = localStorage.getItem("claude-workdir");
  if (savedWorkdir) {
    workdirInput.value = savedWorkdir;
    workdirLabel.textContent = savedWorkdir;
  }

  // ── Notifications System ──
  const notificationsContainer = document.getElementById("notificationsContainer");
  const notificationQueue = [];
  let notificationCounter = 0;

  function showNotification(message, type = "info", duration = 4000) {
    const id = ++notificationCounter;
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.id = `notification-${id}`;

    const icons = {
      success: "✓",
      error: "✕",
      info: "ℹ",
      warning: "⚠",
    };

    notification.innerHTML = `
      <span class="notification-icon">${icons[type] || "•"}</span>
      <span class="notification-content">${message}</span>
      <span class="notification-close">✕</span>
    `;

    const closeBtn = notification.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => removeNotification(id));

    notificationsContainer.appendChild(notification);
    notificationQueue.push({ id, element: notification });

    // Haptic feedback on mobile
    if ("vibrate" in navigator && (type === "error" || type === "success")) {
      navigator.vibrate(type === "error" ? [50, 30, 50] : 50);
    }

    if (duration > 0) {
      setTimeout(() => removeNotification(id), duration);
    }

    return id;
  }

  function removeNotification(id) {
    const notification = document.getElementById(`notification-${id}`);
    if (notification) {
      notification.classList.add("removing");
      setTimeout(() => {
        if (notification.parentNode) notification.parentNode.removeChild(notification);
      }, 200);
    }
  }

  // ── Browser Notifications ──
  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function sendBrowserNotification(title, options = {}) {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification(title, {
        icon: "/icon-192.png",
        ...options,
      });
    }
  }

  // ── Reconnect when page becomes visible again ──
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
      setStatus("Reconnecting...", false);
      connect();
    }
  });

  // ── PWA ──
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // ── Request notification permission on first interaction ──
  let notificationPermissionRequested = false;
  function requestNotificationOnFirstInteraction() {
    if (!notificationPermissionRequested && "Notification" in window && Notification.permission === "default") {
      notificationPermissionRequested = true;
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          showNotification("Notifications enabled!", "success", 2000);
        }
      }).catch(() => {});
    }
  }

  document.addEventListener("click", requestNotificationOnFirstInteraction);
  document.addEventListener("touchstart", requestNotificationOnFirstInteraction);

  // ── Init ──
  // Restore last session on page load — show cached HTML instantly (no flash)
  if (currentSessionId) {
    sessionActive = true;
    const cacheKey = "claude-msgs-html-" + currentSessionId;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      messagesEl.innerHTML = cached;
      scrollToBottom();
    }
    // Load session title from sessions list
    loadSessions().then(sessions => {
      const s = sessions.find(s => s.id === currentSessionId);
      if (s) {
        sessionLabel.textContent = s.title;
        if (s.workdir) {
          workdirInput.value = s.workdir;
          workdirLabel.textContent = s.workdir;
        }
        modelLabel.textContent = s.model || currentModel;
      }
    });
    // Background refresh from server (won't flash if cached)
    reloadMessages(currentSessionId, true);
  }

  // ── Initialize Lucide icons ──
  if (window.lucide && window.lucide.createIcons) {
    try {
      lucide.createIcons({ icons: lucide.icons });
    } catch (e) {
      console.error("Lucide icons init failed:", e);
    }
  }

  connect();
  setStatus("Connecting...", false);
})();
