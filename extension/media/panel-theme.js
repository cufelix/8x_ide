/* Panel appearance stays independent of the user's Cursor editor theme. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeanwhileTheme = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(value) {
    return value === "light" || value === "dark" ? value : "system";
  }

  function resolve(preference, editorClasses = "", prefersDark = true) {
    const chosen = normalize(preference);
    if (chosen !== "system") return chosen;
    const classes = new Set(editorClasses.split(/\s+/));
    if (classes.has("vscode-light") || classes.has("vscode-high-contrast-light")) return "light";
    if (classes.has("vscode-dark") || classes.has("vscode-high-contrast")) return "dark";
    return prefersDark ? "dark" : "light";
  }

  function mount(button, onChange) {
    let preference = "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      const effective = resolve(preference, document.body.className, media.matches);
      document.documentElement.dataset.panelTheme = effective;
      const label = effective === "dark" ? "Switch to light theme" : "Switch to dark theme";
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    button.addEventListener("click", () => {
      preference = document.documentElement.dataset.panelTheme === "dark" ? "light" : "dark";
      apply();
      onChange(preference);
    });
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    media.addEventListener("change", apply);
    apply();
    return { update(value) { preference = normalize(value); apply(); } };
  }

  return { normalize, resolve, mount };
});
