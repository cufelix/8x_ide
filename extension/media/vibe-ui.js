/** A personalized shelf for real services, with an optional official embed. */
(function (global) {
  "use strict";

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, className, onClick, key) {
    const node = element("button", className, text);
    node.type = "button";
    if (key) node.dataset.vibeFocus = key;
    node.addEventListener("click", onClick);
    return node;
  }

  function mount(root, options) {
    const config = options || {};
    const model = global.MeanwhileVibe;
    if (!root || !model) throw new Error("Vibe needs a root element and the MeanwhileVibe model.");
    let state = model.initialState(config.state);
    let stateKey = JSON.stringify(state);
    let agent = { running: false, finished: false, summary: "" };
    let destroyed = false;
    let frame = null;
    let frameId = null;
    const openResults = new Map();
    const shell = element("div", "vibe-shell");
    const status = element("div", "vibe-status-slot");
    const main = element("div", "vibe-main");
    const embedSlot = element("div", "vibe-embed-slot");
    root.classList.add("vibe-root");
    shell.append(status, main, embedSlot);
    root.replaceChildren(shell);

    function commit(nextState, focusKey) {
      if (destroyed) return;
      state = model.initialState(nextState);
      stateKey = JSON.stringify(state);
      render(focusKey);
      if (typeof config.onChange === "function") config.onChange(state);
    }

    function requestOpen(id) {
      if (destroyed || !model.getActivity(id) || openResults.get(id) === "pending") return;
      openResults.set(id, "pending");
      render();
      if (typeof config.onOpenActivity !== "function") {
        openResults.set(id, "failed");
        render();
        return;
      }
      try { config.onOpenActivity(id); }
      catch (_) { openResults.set(id, "failed"); render(); }
    }

    function choose(activity) {
      commit(model.choose(state, activity.id), "activity-heading");
      if (!activity.embedUrl) requestOpen(activity.id);
    }

    function renderStatus() {
      status.replaceChildren();
      if (agent.finished) {
        const banner = element("aside", "vibe-ready");
        banner.setAttribute("aria-label", "Coding agent status");
        const announcement = element("div", "vibe-ready-copy");
        announcement.setAttribute("role", "status");
        announcement.append(element("strong", "", "Your code is ready."), element("span", "", "Your picks will be here when you return."));
        if (agent.summary) announcement.title = agent.summary;
        banner.append(announcement);
        if (typeof config.onReturnToWork === "function") banner.append(button("Back to work ↗", "vibe-text-button", () => config.onReturnToWork(), "return-work"));
        status.append(banner);
        return;
      }
      const line = element("p", "vibe-agent-line");
      const dot = element("span", "vibe-status-dot" + (agent.running ? " is-running" : ""));
      dot.setAttribute("aria-hidden", "true");
      line.append(dot, element("span", "", agent.running ? "Your agent is working. This moment is yours." : "A little room for whatever you’re into."));
      status.append(line);
    }

    function pinButton(activity, key) {
      const pinned = state.pinnedIds.includes(activity.id);
      const pin = button(pinned ? "★" : "☆", "vibe-pin" + (pinned ? " is-pinned" : ""), () => commit(model.togglePin(state, activity.id)), key || "pin-" + activity.id);
      pin.setAttribute("aria-label", `${pinned ? "Unpin" : "Pin"} ${activity.title}`);
      pin.setAttribute("aria-pressed", String(pinned));
      pin.title = `${pinned ? "Unpin" : "Pin"} ${activity.title}`;
      return pin;
    }

    function renderHome() {
      frame = null;
      frameId = null;
      embedSlot.replaceChildren();
      const intro = element("header", "vibe-intro");
      intro.append(element("p", "vibe-eyebrow", "A moment for you"));
      const title = element("h1", "vibe-title", "A good little ");
      title.append(element("em", "", "detour."));
      intro.append(title, element("p", "vibe-description", "Your favorite places to learn, practice, or reset. Pick what you’re into."));
      main.append(intro);

      const interests = element("section", "vibe-interests-section");
      interests.setAttribute("aria-labelledby", "vibe-interest-label");
      const label = element("h2", "vibe-section-label", "Make it yours");
      label.id = "vibe-interest-label";
      interests.append(label);
      const picks = element("div", "vibe-interests");
      model.interests.forEach((interest) => {
        const selected = state.interestIds.includes(interest.id);
        const pick = button(interest.label, "vibe-interest" + (selected ? " is-selected" : ""), () => commit(model.toggleInterest(state, interest.id)), "interest-" + interest.id);
        pick.setAttribute("aria-pressed", String(selected));
        if (interest.description) pick.title = interest.description;
        picks.append(pick);
      });
      interests.append(picks);
      main.append(interests);

      const recents = state.recentIds.map((id) => model.getActivity(id)).filter(Boolean).slice(0, 3);
      if (recents.length) {
        const recent = element("section", "vibe-recents");
        recent.setAttribute("aria-label", "Recently opened");
        recent.append(element("span", "vibe-recent-label", "Back to"));
        recents.forEach((activity) => recent.append(button(activity.title + " ↗", "vibe-recent", () => choose(activity), "recent-" + activity.id)));
        main.append(recent);
      }
      const heading = element("div", "vibe-shelf-heading");
      heading.append(element("h2", "vibe-section-label", state.interestIds.length ? "Picked for your interests" : "Explore something new"), element("span", "vibe-small-note", "★ to keep a favorite"));
      main.append(heading);
      const shelf = element("div", "vibe-shelf");
      model.recommendations(state).forEach((activity) => {
        const card = element("article", "vibe-service" + (state.pinnedIds.includes(activity.id) ? " is-pinned" : ""));
        card.dataset.activity = activity.id;
        const top = element("div", "vibe-service-top");
        const monogram = element("span", "vibe-service-mark", activity.mark || activity.title.slice(0, 1));
        monogram.setAttribute("aria-hidden", "true");
        const identity = element("div", "vibe-service-identity");
        identity.append(element("h3", "vibe-service-title", activity.title), element("span", "vibe-service-domain", new URL(activity.url).hostname.replace(/^www\./, "")));
        top.append(monogram, identity, pinButton(activity));
        card.append(top, element("p", "vibe-service-description", activity.description));
        const footer = element("div", "vibe-service-footer");
        const matching = activity.interests.map((id) => model.interests.find((interest) => interest.id === id)).filter(Boolean);
        footer.append(element("span", "vibe-service-category", matching.map((interest) => interest.label).join(" · ")));
        footer.append(button(activity.embedUrl ? "Open here →" : "Open ↗", "vibe-open", () => choose(activity), "open-" + activity.id));
        card.append(footer);
        shelf.append(card);
      });
      main.append(shelf, element("p", "vibe-footnote", "Real services, your own accounts. Your interests and favorites stay on this device."));
    }

    function renderActivity(activity) {
      const navigation = element("div", "vibe-activity-nav");
      navigation.append(button("← Activities", "vibe-text-button", () => commit(model.goHome(state), "open-" + activity.id), "activities"), pinButton(activity, "active-pin"));
      main.append(navigation);
      const header = element("header", "vibe-activity-header");
      header.append(element("p", "vibe-eyebrow", activity.embedUrl ? "A little time to play" : "Your own account. Your own pace."));
      const title = element("h1", "vibe-activity-title", activity.title);
      title.tabIndex = -1;
      title.dataset.vibeFocus = "activity-heading";
      header.append(title, element("p", "vibe-description", activity.description));
      main.append(header);
      const result = openResults.get(activity.id);
      if (activity.embedUrl) {
        const toolbar = element("div", "vibe-embed-toolbar");
        toolbar.append(element("span", "vibe-small-note", "Live from " + new URL(activity.embedUrl).hostname), button(result === "pending" ? "Opening…" : "Open in browser ↗", "vibe-text-button", () => requestOpen(activity.id), "open-browser"));
        toolbar.lastElementChild.disabled = result === "pending";
        main.append(toolbar);
        if (!frame || frameId !== activity.id) {
          frame = document.createElement("iframe");
          frame.className = "vibe-embed";
          frame.src = activity.embedUrl;
          frame.title = activity.title + " activity";
          frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
          frame.referrerPolicy = "no-referrer";
          frameId = activity.id;
          const embed = element("div", "vibe-embed-wrap");
          embed.append(frame);
          embedSlot.replaceChildren(embed, element("p", "vibe-footnote", "Having trouble loading? Open the activity in your browser."));
        }
        if (result === "failed") {
          const notice = element("p", "vibe-open-status is-error", "Couldn’t open the link. Try the browser button again.");
          notice.setAttribute("role", "status");
          main.append(notice);
        }
      } else {
        frame = null;
        frameId = null;
        embedSlot.replaceChildren();
        const external = element("section", "vibe-external");
        const arrow = element("span", "vibe-external-mark", "↗");
        arrow.setAttribute("aria-hidden", "true");
        external.append(arrow, element("h2", "vibe-external-title", "Continue in your browser."), element("p", "vibe-description", "Use the real site and keep your progress with the service. Your agent can keep working here."));
        const open = button(result === "pending" ? "Opening…" : `Open ${activity.title} ↗`, "vibe-primary", () => requestOpen(activity.id), "open-browser");
        open.disabled = result === "pending";
        external.append(open);
        const message = result === "pending" ? "Opening the link in your browser…" : result === "opened" ? "Link opened in your browser." : result === "failed" ? "Couldn’t open the link. Please try again." : "Ready when you are.";
        const notice = element("p", "vibe-open-status" + (result === "failed" ? " is-error" : ""), message);
        notice.setAttribute("role", "status");
        external.append(notice);
        main.append(external, button("Return to activities", "vibe-secondary", () => commit(model.goHome(state), "open-" + activity.id), "return-activities"));
      }
    }

    function render(focusKey) {
      if (destroyed) return;
      const focused = document.activeElement;
      const previousKey = main.contains(focused) ? focused.dataset.vibeFocus : null;
      // The separate embed slot stays attached across renders and mode switches.
      main.replaceChildren();
      const activity = model.getActivity(state.selectedActivityId);
      if (activity) renderActivity(activity);
      else renderHome();
      const targetKey = focusKey || previousKey;
      if (targetKey) {
        const target = Array.from(main.querySelectorAll("[data-vibe-focus]")).find((item) => item.dataset.vibeFocus === targetKey);
        if (target && !target.disabled) target.focus({ preventScroll: !focusKey });
      }
      if (focusKey === "activity-heading") root.scrollTop = 0;
    }

    renderStatus();
    render();
    return {
      update(nextState) {
        if (destroyed) return;
        const clean = model.initialState(nextState);
        const key = JSON.stringify(clean);
        if (key === stateKey) return;
        state = clean;
        stateKey = key;
        render();
      },
      setAgentStatus(next) {
        if (destroyed) return;
        const nextAgent = { running: !!next?.running, finished: !!next?.finished, summary: String(next?.summary || "") };
        if (JSON.stringify(agent) === JSON.stringify(nextAgent)) return;
        agent = nextAgent;
        renderStatus();
      },
      setOpenResult(result) {
        if (destroyed || !model.getActivity(result?.activityId)) return;
        openResults.set(result.activityId, result.ok === true ? "opened" : "failed");
        if (state.selectedActivityId === result.activityId) render();
      },
      setVisible(visible) { if (!destroyed) root.hidden = !visible; },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        frame = null;
        frameId = null;
        openResults.clear();
        root.replaceChildren();
        root.classList.remove("vibe-root");
      },
    };
  }

  global.MeanwhileVibeUI = { mount };
})(typeof window !== "undefined" ? window : globalThis);
