/* Connect real Vibe activities to the extension's browser and local storage. */
(function (root) {
  "use strict";

  function mount({ vscode, onModeChange }) {
    const home = document.getElementById("vibeRoot");
    const work = document.getElementById("stage");
    const status = document.getElementById("vibeSaveStatus");
    const statusText = document.getElementById("vibeSaveText");
    const retry = document.getElementById("vibeSaveRetry");
    const buttons = [...document.querySelectorAll("[data-mode]")];
    const themeButton = document.getElementById("themeToggle");
    let mode = "work";
    let state = root.MeanwhileVibe.initialState();
    let initialized = false;
    let requestId = 0;
    let agent = { running: false, finished: false, summary: "" };
    let agentKey = "";

    function save(nextState) {
      state = root.MeanwhileVibe.initialState(nextState);
      status.hidden = true;
      vscode.postMessage({ type: "vibeSave", state, requestId: ++requestId });
    }

    const ui = root.MeanwhileVibeUI.mount(home, {
      state,
      onChange: save,
      onOpenActivity(activityId) {
        vscode.postMessage({ type: "openActivity", activityId });
      },
      onReturnToWork() {
        setMode("work", true);
        if (agent.finished) vscode.postMessage({ type: "openDiff" });
      },
    });
    const appearance = root.MeanwhileTheme.mount(themeButton, (theme) => {
      state = root.MeanwhileVibe.initialState({ ...state, theme });
      ui.update(state);
      save(state);
    });

    function setMode(next, notify = false) {
      mode = next === "vibe" ? "vibe" : "work";
      document.body.dataset.mode = mode;
      home.hidden = mode !== "vibe";
      home.inert = !initialized;
      work.hidden = mode !== "work";
      buttons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
        button.disabled = !initialized;
      });
      ui.setVisible(mode === "vibe");
      themeButton.disabled = !initialized;
      onModeChange(mode);
      if (notify) vscode.postMessage({ type: "setMode", mode });
    }

    buttons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode, true)));
    retry.addEventListener("click", () => save(state));

    function setSession(session) {
      agent = {
        running: session?.codingAgent?.status === "running",
        finished: session?.codingAgent?.status === "stopped",
        summary: session?.summary || "",
      };
      const key = JSON.stringify(agent);
      if (key !== agentKey) {
        agentKey = key;
        ui.setAgentStatus(agent);
      }
    }

    function receive(data) {
      if (data.type === "vibeInit") {
        state = root.MeanwhileVibe.initialState(data.payload?.state);
        initialized = true;
        ui.update(state);
        appearance.update(state.theme);
        setMode(data.payload?.mode);
      } else if (data.type === "mode") {
        setMode(data.mode);
      } else if (data.type === "vibeSaved" && data.requestId === requestId) {
        status.hidden = data.ok === true;
        statusText.textContent = data.ok ? "" : "Preferences couldn't be saved. Keep this panel open and try again.";
      } else if (data.type === "activityOpened") {
        ui.setOpenResult({ activityId: data.activityId, ok: data.ok === true });
      } else if (data.type === "focusVibe" && mode === "vibe") {
        home.querySelector("button:not(:disabled)")?.focus();
      }
    }

    setMode("work");
    return { receive, setSession, get mode() { return mode; } };
  }

  root.MeanwhileModes = { mount };
})(typeof window !== "undefined" ? window : globalThis);
