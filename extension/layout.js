/**
 * Adaptive layout: whatever has your attention gets the room.
 *
 * - Focus in Meanwhile → Meanwhile widens.
 * - Focus elsewhere (agent pane, editor) → Meanwhile narrows.
 * - Video playing → theater: side panes close, the video fills the window.
 *
 * VS Code has no "set width" API, so width is moved in steps with
 * workbench.action.increaseViewWidth, which grows whichever part has focus.
 * `offset` tracks the net steps we applied (positive = Meanwhile wider), so
 * we never drift and can always undo.
 */

const MAX_STEPS = 5;

/**
 * @param {number} offset current net steps (Meanwhile wider when positive)
 * @param {"wide" | "narrow" | "rest"} want
 * @returns {number} steps to apply: >0 grow Meanwhile (focus must be in it),
 *   <0 grow the focused other part.
 */
function stepsToward(offset, want) {
  const target = want === "wide" ? MAX_STEPS : want === "narrow" ? -MAX_STEPS : 0;
  return target - offset;
}

/**
 * Which way to lean for a focus change. Only lean while the panel is on screen.
 * @param {{ panelVisible: boolean, panelActive: boolean }} state
 */
function wantFor({ panelVisible, panelActive }) {
  if (!panelVisible) return "rest";
  return panelActive ? "wide" : "narrow";
}

/**
 * Theater mode closes panes and must reopen exactly the ones it closed.
 * @param {{ auxiliaryBar: boolean, sideBar: boolean }} visible
 */
function theaterPlan(visible) {
  const close = [];
  if (visible.auxiliaryBar) close.push("auxiliaryBar");
  if (visible.sideBar) close.push("sideBar");
  return close;
}

const COMMANDS = {
  close: {
    auxiliaryBar: "workbench.action.closeAuxiliaryBar",
    sideBar: "workbench.action.closeSidebar",
  },
  reopen: {
    auxiliaryBar: "workbench.action.toggleAuxiliaryBar",
    sideBar: "workbench.action.toggleSidebarVisibility",
  },
  grow: "workbench.action.increaseViewWidth",
};

module.exports = { MAX_STEPS, stepsToward, wantFor, theaterPlan, COMMANDS };
