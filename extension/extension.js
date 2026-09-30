const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

/** @type {vscode.WebviewPanel | undefined} */
let panel;

/**
 * @param {vscode.ExtensionContext} context
 */
function openPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "meanwhile",
    "Meanwhile",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "media")),
      ],
    }
  );

  panel.webview.html = getHtml(panel.webview, context.extensionPath);

  panel.onDidDispose(
    () => {
      panel = undefined;
    },
    null,
    context.subscriptions
  );
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const open = vscode.commands.registerCommand("meanwhile.open", () => {
    openPanel(context);
  });

  context.subscriptions.push(open);

  // Preview: open half-screen panel as soon as the window is ready.
  setTimeout(() => openPanel(context), 400);
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
    `img-src ${webview.cspSource} data:`,
  ].join("; ");
  html = html.replace(/\{\{CSP\}\}/g, csp);
  return html;
}

function deactivate() {}

module.exports = { activate, deactivate };
