const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { startPlayerServer } = require("./player-server");
const { createAdaptiveLayout } = require("./adaptive");
const vibeModel = require("./media/vibe-model");
const { initialState: normalizeVibe } = vibeModel;

const STEP_ASIDE_MS = 5000;
/** "What changed" stays up long enough to be read before the panel steps aside. */
const READ_MS_PER_EXPLANATION = 4000;
const VIBE_KEY = "meanwhile.vibe.browser.v1";
const MODE_KEY = "meanwhile.mode.v1";

/** @type {vscode.WebviewPanel | undefined} */
let panel;
/** @type {vscode.ExtensionContext | undefined} */
let extContext;
/** @type {{ base: string, port: number, close: () => void } | null} */
let player = null;
/**
 * Sessions the panel should not reopen for on its own: already stepped aside
 * after the stop, or closed by the user mid-run. The shortcut always opens.
 */
const leftAlone = new Set();
let stepAsideTimer = null;
let mode = "work";
let vibeState;
let saveQueue = Promise.resolve();
const adaptive = createAdaptiveLayout(() => panel);

function meanwhileDir() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return folder ? path.join(folder, ".meanwhile") : null;
}

function sessionPath() {
  const dir = meanwhileDir();
  return dir ? path.join(dir, "session.json") : null;
}

function readJsonFile(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null; // Mid-write; the next change event re-reads it.
  }
}

function answerPath() {
  const dir = meanwhileDir();
  return dir ? path.join(dir, "answer.json") : null;
}

/**
 * session.json is written only by the hooks; the user's pick lives in
 * answer.json until a hook folds it in (same rule as runtime/store.mjs).
 */
function readSession() {
  const session = readJsonFile(sessionPath());
  const answer = readJsonFile(answerPath());
  const question = session?.question;
  if (!question || question.answer || !answer || answer.sessionId !== session.id) {
    return session;
  }
  const choice = (question.choices || []).find((c) => c.id === answer.choiceId);
  if (!choice) return session;
  return {
    ...session,
    question: {
      ...question,
      answer: { choiceId: choice.id, label: choice.label, constraint: choice.constraint || choice.label, at: answer.at, deliveredAt: null },
    },
  };
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function isRunning(session) {
  return session?.codingAgent?.status === "running";
}

/** Spoken intro only if it was recorded for this session (MEANWHILE_VOICE=1). */
function voiceUriFor(session) {
  const dir = meanwhileDir();
  if (!panel || !dir || !session) return null;
  const file = path.join(dir, "voice.mp3");
  try {
    const recorded = fs.statSync(file).mtimeMs;
    if (recorded < Date.parse(session.source?.capturedAt || 0)) return null;
  } catch {
    return null;
  }
  return panel.webview.asWebviewUri(vscode.Uri.file(file)).toString();
}

function pushState() {
  if (!panel) return;
  const session = readSession();
  panel.webview.postMessage({
    type: "state",
    payload: {
      session,
      now: Date.now(),
      playerBase: player?.base || null,
      voiceUri: voiceUriFor(session),
    },
  });
  scheduleStepAside(session);
}

/**
 * When the agent stops, show "Review the diff" briefly, then get out of the
 * way: open Source Control and close the column.
 */
function scheduleStepAside(session) {
  if (mode === "vibe" || !session || isRunning(session) || leftAlone.has(session.id) || stepAsideTimer) {
    return;
  }
  stepAsideTimer = setTimeout(async () => {
    stepAsideTimer = null;
    const current = readSession();
    if (mode === "vibe" || !current || current.id !== session.id || isRunning(current)) return;
    leftAlone.add(session.id);
    await adaptive.exitTheater();
    try {
      await vscode.commands.executeCommand("workbench.view.scm");
    } catch (err) {
      console.error("[meanwhile] open scm:", err);
    }
    panel?.dispose();
  }, STEP_ASIDE_MS + Math.min(4, (session.explain || []).length) * READ_MS_PER_EXPLANATION);
}

function applyAnswer(choiceId) {
  const session = readSession();
  const question = session?.question;
  const file = answerPath();
  if (!file || !question || question.answer || !isRunning(session)) return false;
  if (!(question.choices || []).some((c) => c.id === choiceId)) return false;
  writeJsonFile(file, { sessionId: session.id, choiceId, at: new Date().toISOString() });
  return true;
}

function openExternal(url) {
  try {
    const uri = vscode.Uri.parse(String(url));
    if (uri.scheme === "https" && /(^|\.)youtube\.com$/.test(uri.authority)) {
      vscode.env.openExternal(uri);
    }
  } catch (err) {
    console.error("[meanwhile] openUrl:", err);
  }
}

async function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "ready") {
    panel?.webview.postMessage({ type: "vibeInit", payload: { mode, state: vibeState } });
    pushState();
  } else if (msg.type === "setMode") {
    if (msg.mode === "work" || msg.mode === "vibe") await changeMode(msg.mode);
  } else if (msg.type === "vibeSave") {
    // Browser preferences never enter the coding agent's answer.json channel.
    vibeState = normalizeVibe(msg.state);
    const snapshot = vibeState;
    const requestId = msg.requestId;
    saveQueue = saveQueue.catch(() => {}).then(() => extContext.globalState.update(VIBE_KEY, snapshot));
    try {
      await saveQueue;
      panel?.webview.postMessage({ type: "vibeSaved", requestId, ok: true });
    } catch (err) {
      console.error("[meanwhile] save Vibe preferences:", err);
      panel?.webview.postMessage({ type: "vibeSaved", requestId, ok: false });
    }
  } else if (msg.type === "openActivity") {
    // Resolve a catalog id here; never trust a URL supplied by a webview.
    const activity = vibeModel.getActivity(msg.activityId);
    let ok = false;
    if (activity && mode === "vibe") {
      try {
        ok = await vscode.env.openExternal(vscode.Uri.parse(activity.url));
      } catch (err) {
        console.error("[meanwhile] open activity:", err);
      }
    }
    panel?.webview.postMessage({ type: "activityOpened", activityId: msg.activityId, ok: ok === true });
  } else if (msg.type === "answer") {
    if (mode === "work" && applyAnswer(String(msg.choiceId || ""))) pushState();
  } else if (msg.type === "openUrl") {
    openExternal(msg.url);
  } else if (msg.type === "openDiff") {
    await vscode.commands.executeCommand("workbench.view.scm");
  } else if (msg.type === "player") {
    if (mode === "work") adaptive.onPlayer(msg.playing === true);
  } else if (msg.type === "exitTheater") {
    adaptive.exitTheater();
  }
}

async function changeMode(nextMode) {
  mode = nextMode;
  clearTimeout(stepAsideTimer);
  stepAsideTimer = null;
  const session = readSession();
  // Deliberately returning from Vibe must not immediately close the panel.
  if (session && !isRunning(session)) leftAlone.add(session.id);
  panel?.webview.postMessage({ type: "mode", mode });
  if (mode === "vibe") await adaptive.exitTheater();
  try {
    await extContext.globalState.update(MODE_KEY, mode);
  } catch (err) {
    console.error("[meanwhile] save mode:", err);
  }
  pushState();
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {{ focus?: boolean }} [opts]
 */
function openPanel(context, opts = {}) {
  const preserveFocus = !opts.focus;
  if (panel) {
    // Reveal where it already is; "Beside" would move it to another group.
    panel.reveal(panel.viewColumn, preserveFocus);
    pushState();
    return panel;
  }
  const roots = [vscode.Uri.file(path.join(context.extensionPath, "media"))];
  const mw = meanwhileDir();
  if (mw) roots.push(vscode.Uri.file(mw));

  panel = vscode.window.createWebviewPanel(
    "meanwhile",
    "Meanwhile",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: roots,
      portMapping: player ? [{ webviewPort: player.port, extensionHostPort: player.port }] : [],
    }
  );
  panel.webview.html = getHtml(panel.webview, context.extensionPath);
  panel.webview.onDidReceiveMessage(onMessage, undefined, context.subscriptions);
  panel.onDidChangeViewState(() => {
    if (mode === "work") adaptive.onViewState();
  }, null, context.subscriptions);
  panel.onDidDispose(
    () => {
      adaptive.dispose();
      panel = undefined;
      const session = readSession();
      if (session) leftAlone.add(session.id);
      clearTimeout(stepAsideTimer);
      stepAsideTimer = null;
    },
    null,
    context.subscriptions
  );
  return panel;
}

/**
 * Ctrl/Cmd+Alt+M: open the panel. Pressed again while the panel has focus and
 * a question is open, it moves through the choices (Enter or 1–3 answers).
 */
function openOrCycle(context) {
  if (panel?.active) {
    panel.webview.postMessage({ type: mode === "vibe" ? "focusVibe" : "cycleChoice" });
    return;
  }
  // Opened on purpose after the run stopped: do not step aside again.
  const session = readSession();
  if (session && !isRunning(session)) leftAlone.add(session.id);
  openPanel(context, { focus: true });
  panel?.webview.postMessage({ type: mode === "vibe" ? "focusVibe" : "focusQuestion" });
}

function runDemo(prompt) {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const candidates = [
    folder && path.join(folder, "scripts", "demo-session.mjs"),
    path.join(extContext.extensionPath, "..", "scripts", "demo-session.mjs"),
  ].filter(Boolean);
  const script = candidates.find((p) => fs.existsSync(p));
  if (!script) {
    vscode.window.showErrorMessage("Meanwhile: demo script not found (open the Meanwhile repo).");
    return;
  }
  const child = spawn(process.execPath, [script, prompt], {
    cwd: folder || path.dirname(script),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", CURSOR_PROJECT_DIR: folder || "" },
  });
  let err = "";
  child.stderr.on("data", (d) => {
    err += String(d);
  });
  child.on("close", (code) => {
    if (code !== 0) {
      vscode.window.showErrorMessage(`Meanwhile demo failed${err ? `: ${err.slice(0, 200)}` : ""}`);
      return;
    }
    openPanel(extContext, { focus: false });
    pushState();
  });
}

function onSessionChange(context) {
  const session = readSession();
  if (panel) {
    pushState();
  } else if (isRunning(session) && !leftAlone.has(session.id)) {
    openPanel(context, { focus: false });
  }
}

function watchMeanwhile(context) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, ".meanwhile/session.json")
  );
  watcher.onDidCreate(() => onSessionChange(context), null, context.subscriptions);
  watcher.onDidChange(() => onSessionChange(context), null, context.subscriptions);
  context.subscriptions.push(watcher);

  // Clock tick: live range, clip roll-forward. Also a backup for missed events.
  const timer = setInterval(() => onSessionChange(context), 2000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  extContext = context;
  mode = context.globalState.get(MODE_KEY) === "vibe" ? "vibe" : "work";
  vibeState = normalizeVibe(context.globalState.get(VIBE_KEY));
  try {
    player = await startPlayerServer();
    context.subscriptions.push({ dispose: () => player?.close() });
  } catch (err) {
    console.error("[meanwhile] player server:", err);
    player = null; // Panel falls back to a thumbnail that opens YouTube.
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("meanwhile.open", () => openOrCycle(context)),
    vscode.commands.registerCommand("meanwhile.vibe", async () => {
      await changeMode("vibe");
      openPanel(context, { focus: true });
    }),
    vscode.commands.registerCommand("meanwhile.demo", () =>
      runDemo("Add Stripe checkout to this Next.js site with Postgres for orders.")
    )
  );
  watchMeanwhile(context);
  if (isRunning(readSession())) openPanel(context, { focus: false });
}

/**
 * @param {vscode.Webview} webview
 * @param {string} extensionPath
 */
function getHtml(webview, extensionPath) {
  const media = path.join(extensionPath, "media");
  const html = fs.readFileSync(path.join(media, "panel.html"), "utf8");
  const viewModel = webview.asWebviewUri(vscode.Uri.file(path.join(media, "view-model.js")));
  const activityFrames = vibeModel.activities.filter((activity) => activity.embedUrl).map((activity) => new URL(activity.embedUrl).origin);
  const frames = [...new Set(["https://www.youtube.com", player ? player.base : null, ...activityFrames].filter(Boolean))].join(" ");
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} https://i.ytimg.com data:`,
    `media-src ${webview.cspSource}`,
    `frame-src ${frames}`,
  ].join("; ");
  const assets = {
    VIEW_MODEL: viewModel,
    VIBE_MODEL: webview.asWebviewUri(vscode.Uri.file(path.join(media, "vibe-model.js"))),
    VIBE_UI: webview.asWebviewUri(vscode.Uri.file(path.join(media, "vibe-ui.js"))),
    VIBE_BRIDGE: webview.asWebviewUri(vscode.Uri.file(path.join(media, "vibe-bridge.js"))),
    VIBE_CSS: webview.asWebviewUri(vscode.Uri.file(path.join(media, "vibe.css"))),
  };
  return html.replace(/\{\{CSP\}\}/g, csp).replace(/\{\{(VIEW_MODEL|VIBE_MODEL|VIBE_UI|VIBE_BRIDGE|VIBE_CSS)\}\}/g, (_, key) => assets[key].toString());
}

function deactivate() {
  player?.close();
}

module.exports = { activate, deactivate };
