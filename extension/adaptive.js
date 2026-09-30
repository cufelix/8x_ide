/**
 * Drives the workbench for the adaptive layout (pure rules live in layout.js).
 */
const vscode = require("vscode");
const { COMMANDS, stepsToward, wantFor } = require("./layout");

const SETTLE_MS = 180;
const THEATER_EXIT_MS = 1200;

function enabled() {
  return vscode.workspace.getConfiguration("meanwhile").get("adaptiveLayout", true);
}

async function run(command, times = 1) {
  for (let i = 0; i < times; i += 1) {
    try {
      await vscode.commands.executeCommand(command);
    } catch (err) {
      console.error(`[meanwhile] ${command}:`, err);
      return false;
    }
  }
  return true;
}

/**
 * @param {() => import("vscode").WebviewPanel | undefined} getPanel
 */
function createAdaptiveLayout(getPanel) {
  let offset = 0; // net 60px steps applied; >0 = Meanwhile wider
  let theater = false;
  let settleTimer = null;
  let exitTimer = null;
  let busy = false;

  async function settle() {
    const panel = getPanel();
    if (!panel || theater || busy || !enabled()) return;
    const want = wantFor({ panelVisible: panel.visible, panelActive: panel.active });
    if (want === "rest") return; // Focus is somewhere we cannot attribute; leave it.
    const steps = stepsToward(offset, want);
    // increaseViewWidth grows whichever part has focus: Meanwhile when it is
    // active (steps > 0), otherwise the part you moved to (steps < 0).
    if ((steps > 0 && !panel.active) || (steps < 0 && panel.active) || steps === 0) return;
    busy = true;
    try {
      if (await run(COMMANDS.grow, Math.abs(steps))) offset += steps;
    } finally {
      busy = false;
    }
  }

  function onViewState() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  }

  async function enterTheater() {
    clearTimeout(exitTimer);
    if (theater || !enabled()) return;
    theater = true;
    await run("workbench.action.maximizeEditorHideSidebar");
    getPanel()?.webview.postMessage({ type: "theater", on: true });
  }

  /** Bring back the agent pane and the side bar the theater hid. */
  async function exitTheater() {
    if (!theater) return;
    theater = false;
    await run(COMMANDS.reopen.auxiliaryBar);
    await run(COMMANDS.reopen.sideBar);
    const panel = getPanel();
    if (panel) {
      panel.reveal(panel.viewColumn, false);
      panel.webview.postMessage({ type: "theater", on: false });
    }
  }

  /** Playing → theater now; paused/ended → leave after a beat (skips flicker on seek). */
  function onPlayer(playing) {
    clearTimeout(exitTimer);
    if (playing) {
      enterTheater();
    } else {
      exitTimer = setTimeout(exitTheater, THEATER_EXIT_MS);
    }
  }

  function dispose() {
    clearTimeout(settleTimer);
    clearTimeout(exitTimer);
    if (theater) exitTheater();
  }

  return { onViewState, onPlayer, exitTheater, dispose, get theater() { return theater; } };
}

module.exports = { createAdaptiveLayout };
