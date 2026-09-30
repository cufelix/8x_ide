const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { startPlayerServer } = require("./player-server");
const { createAdaptiveLayout } = require("./adaptive");

const STEP_ASIDE_MS = 5000;

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
  if (!session || isRunning(session) || leftAlone.has(session.id) || stepAsideTimer) {
    return;
  }
  stepAsideTimer = setTimeout(async () => {
    stepAsideTimer = null;
    const current = readSession();
    if (!current || current.id !== session.id || isRunning(current)) return; // A new run started.
    leftAlone.add(session.id);
    await adaptive.exitTheater();
    try {
      await vscode.commands.executeCommand("workbench.view.scm");
    } catch (err) {
      console.error("[meanwhile] open scm:", err);
    }
    panel?.dispose();
  }, STEP_ASIDE_MS);
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
    pushState();
  } else if (msg.type === "answer") {
    if (applyAnswer(String(msg.choiceId || ""))) pushState();
  } else if (msg.type === "openUrl") {
    openExternal(msg.url);
  } else if (msg.type === "openDiff") {
    await vscode.commands.executeCommand("workbench.view.scm");
  } else if (msg.type === "player") {
    adaptive.onPlayer(msg.playing === true);
  } else if (msg.type === "exitTheater") {
    adaptive.exitTheater();
  }
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
  panel.onDidChangeViewState(() => adaptive.onViewState(), null, context.subscriptions);
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
    panel.webview.postMessage({ type: "cycleChoice" });
    return;
  }
  // Opened on purpose after the run stopped: do not step aside again.
  const session = readSession();
  if (session && !isRunning(session)) leftAlone.add(session.id);
  openPanel(context, { focus: true });
  panel?.webview.postMessage({ type: "focusQuestion" });
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
  try {
    player = await startPlayerServer();
    context.subscriptions.push({ dispose: () => player?.close() });
  } catch (err) {
    console.error("[meanwhile] player server:", err);
    player = null; // Panel falls back to a thumbnail that opens YouTube.
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("meanwhile.open", () => openOrCycle(context)),
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
  const frames = ["https://www.youtube.com", player ? player.base : null].filter(Boolean).join(" ");
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} https://i.ytimg.com data:`,
    `media-src ${webview.cspSource}`,
    `frame-src ${frames}`,
  ].join("; ");
  return html.replace(/\{\{CSP\}\}/g, csp).replace(/\{\{VIEW_MODEL\}\}/g, viewModel.toString());
}

function deactivate() {
  player?.close();
}

module.exports = { activate, deactivate };
