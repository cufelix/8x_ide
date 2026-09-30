const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

/** @type {vscode.WebviewPanel | undefined} */
let panel;
/** @type {vscode.ExtensionContext | undefined} */
let extContext;

function meanwhileDir() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) {
    return null;
  }
  return path.join(folder, ".meanwhile");
}

function sessionPath() {
  const dir = meanwhileDir();
  return dir ? path.join(dir, "session.json") : null;
}

function activityPath() {
  const dir = meanwhileDir();
  return dir ? path.join(dir, "activity.jsonl") : null;
}

function readJson(file, fallback) {
  try {
    if (!file || !fs.existsSync(file)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readActivityTail(limit = 30) {
  const file = activityPath();
  if (!file || !fs.existsSync(file)) {
    return [];
  }
  try {
    return fs
      .readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function voicePath() {
  const dir = meanwhileDir();
  return dir ? path.join(dir, "voice.mp3") : null;
}

function buildState() {
  const session = readJson(sessionPath(), null);
  const activity = readActivityTail(24);
  const card =
    session && Array.isArray(session.cards)
      ? session.cards[session.cursor] ?? null
      : null;
  let voiceUri = null;
  const vp = voicePath();
  if (panel && vp && fs.existsSync(vp)) {
    voiceUri = panel.webview
      .asWebviewUri(vscode.Uri.file(vp))
      .toString();
  }
  return { session, activity, card, now: Date.now(), voiceUri };
}

function pushState() {
  if (!panel) {
    return;
  }
  panel.webview.postMessage({ type: "state", payload: buildState() });
}

/** Session ids we already revealed, so a closed panel stays closed. */
let revealedFor = null;

/**
 * @param {vscode.ExtensionContext} context
 * @param {{ preserveFocus?: boolean }} [opts]
 */
function openPanel(context, opts = {}) {
  const preserveFocus = opts.preserveFocus !== false;
  if (panel) {
    if (!preserveFocus) {
      panel.reveal(vscode.ViewColumn.Beside, false);
    }
    pushState();
    return panel;
  }

  const roots = [
    vscode.Uri.file(path.join(context.extensionPath, "media")),
  ];
  const mw = meanwhileDir();
  if (mw) {
    roots.push(vscode.Uri.file(mw));
  }

  panel = vscode.window.createWebviewPanel(
    "meanwhile",
    "Meanwhile",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: roots,
    }
  );

  panel.webview.html = getHtml(panel.webview, context.extensionPath);

  panel.webview.onDidReceiveMessage(
    async (msg) => {
      if (!msg || typeof msg !== "object") {
        return;
      }
      if (msg.type === "ready") {
        pushState();
        return;
      }
      if (msg.type === "answer") {
        applyAnswer(msg.choiceId || null);
        pushState();
        return;
      }
      if (msg.type === "next") {
        applyAnswer(null);
        pushState();
        return;
      }
      if (msg.type === "demo") {
        await runDemo(msg.prompt);
        return;
      }
      if (msg.type === "reviewDiff") {
        await vscode.commands.executeCommand("workbench.view.scm");
        return;
      }
      if (msg.type === "openUrl" && msg.url) {
        vscode.env.openExternal(vscode.Uri.parse(String(msg.url)));
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(
    () => {
      panel = undefined;
    },
    null,
    context.subscriptions
  );

  pushState();
  return panel;
}

function applyAnswer(choiceId) {
  const file = sessionPath();
  const session = readJson(file, null);
  if (!session || !Array.isArray(session.cards)) {
    return;
  }
  if (session.status === "queued" || session.status === "idle") {
    session.status = "active";
  }
  const card = session.cards[session.cursor];
  if (!card) {
    return;
  }
  const correct =
    card.expectedChoiceId == null || choiceId == null
      ? null
      : choiceId === card.expectedChoiceId;
  session.answers = session.answers || [];
  session.answers.push({
    cardId: card.id,
    choiceId: choiceId ?? null,
    text: null,
    correct,
    at: new Date().toISOString(),
  });
  session.cursor += 1;
  if (session.waitPlan) {
    session.waitPlan.cursor = Math.min(
      (session.waitPlan.cursor || 0) + 1,
      (session.waitPlan.segments || []).length
    );
  }
  if (session.cursor >= session.cards.length) {
    session.status = "completed";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function pluginRootGuess(context) {
  // Prefer workspace (monorepo) so demo uses the same runtime hooks write to.
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder && fs.existsSync(path.join(folder, "runtime", "pipeline.mjs"))) {
    return folder;
  }
  return context.extensionPath.replace(/[/\\]extension$/, "") || context.extensionPath;
}

function runDemo(prompt) {
  return new Promise((resolve) => {
    const root = pluginRootGuess(extContext);
    const script = path.join(root, "scripts", "demo-session.mjs");
    if (!fs.existsSync(script)) {
      vscode.window.showErrorMessage("Meanwhile demo script not found.");
      resolve(false);
      return;
    }
    const args = [script];
    if (prompt) {
      args.push(prompt);
    }
    const child = spawn(process.execPath, args, {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || root,
      env: process.env,
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        vscode.window.showErrorMessage(
          `Meanwhile demo failed${err ? `: ${err.slice(0, 200)}` : ""}`
        );
        resolve(false);
        return;
      }
      openPanel(extContext, { preserveFocus: false });
      pushState();
      resolve(true);
    });
  });
}

function maybeReveal(context, session) {
  if (panel) {
    pushState();
    return;
  }
  if (!session || session.codingAgent?.status !== "running") {
    return;
  }
  if (revealedFor === session.id) {
    return;
  }
  revealedFor = session.id;
  openPanel(context, { preserveFocus: true });
}

function watchMeanwhile(context) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  const pattern = new vscode.RelativePattern(folder, ".meanwhile/**");
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const onChange = () => {
    maybeReveal(context, readJson(sessionPath(), null));
  };

  watcher.onDidCreate(onChange, null, context.subscriptions);
  watcher.onDidChange(onChange, null, context.subscriptions);
  context.subscriptions.push(watcher);

  // Poll as backup (some hosts miss rapid jsonl appends).
  const timer = setInterval(() => {
    if (panel) {
      pushState();
      return;
    }
    maybeReveal(context, readJson(sessionPath(), null));
  }, 1500);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  extContext = context;

  context.subscriptions.push(
    vscode.commands.registerCommand("meanwhile.open", () => {
      openPanel(context, { preserveFocus: false });
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("meanwhile.demo", async () => {
      await runDemo("Add Stripe checkout to this Next.js site.");
    })
  );

  watchMeanwhile(context);

  // If a session already exists, open beside once without taking chat focus.
  setTimeout(() => {
    const session = readJson(sessionPath(), null);
    if (!session) {
      return;
    }
    if (session.codingAgent?.status === "running") {
      maybeReveal(context, session);
      return;
    }
    openPanel(context, { preserveFocus: true });
  }, 600);
}

/**
 * @param {vscode.Webview} webview
 * @param {string} extensionPath
 */
function getHtml(webview, extensionPath) {
  const htmlPath = path.join(extensionPath, "media", "panel.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `img-src ${webview.cspSource} https: data:`,
    `media-src ${webview.cspSource} blob:`,
    `frame-src https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com`,
  ].join("; ");
  const activityJs = path.join(extensionPath, "media", "activity-line.js");
  const activityFn = fs.existsSync(activityJs)
    ? fs.readFileSync(activityJs, "utf8")
    : "function toActivitySentence(raw){return String(raw||'').slice(0,80);}";
  html = html.replace(/\{\{CSP\}\}/g, csp);
  html = html.replace("{{ACTIVITY_FN}}", activityFn);
  return html;
}

function deactivate() {}

module.exports = { activate, deactivate };
