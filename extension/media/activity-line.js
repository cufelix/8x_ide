/**
 * Turn an agent thought or edit note into one short sentence.
 * Shared by the session writer and the half-tab.
 */
function toActivitySentence(raw) {
  let text = String(raw || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }

  const editing = text.match(/^Editing\s+(\S+)/i);
  if (editing && /[/\\.]/.test(editing[1])) {
    const generic = new Set([
      "route",
      "page",
      "index",
      "layout",
      "loading",
      "error",
      "template",
    ]);
    const parts = editing[1].split(/[/\\]/).filter(Boolean);
    const file = parts
      .pop()
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ");
    const parent = parts.length
      ? parts[parts.length - 1].replace(/[-_]+/g, " ")
      : "";
    const name = generic.has(file) && parent ? `${parent} ${file}` : file;
    return clipSentence(`Editing the ${name}`);
  }

  text = text.replace(/^(sure|okay|ok)[,:]?\s+/i, "");
  text = text.replace(
    /^(I['’]ll|I will|Let me|I['’]m going to|I['’]m|Going to|Now I['’]ll|Let's|Let us)\s+/i,
    ""
  );

  const gerund = {
    add: "Adding",
    adding: "Adding",
    create: "Creating",
    creating: "Creating",
    update: "Updating",
    updating: "Updating",
    edit: "Editing",
    editing: "Editing",
    wire: "Wiring",
    wiring: "Wiring",
    implement: "Implementing",
    implementing: "Implementing",
    fix: "Fixing",
    fixing: "Fixing",
    write: "Writing",
    writing: "Writing",
    refactor: "Refactoring",
    refactoring: "Refactoring",
    install: "Installing",
    installing: "Installing",
    configure: "Configuring",
    configuring: "Configuring",
    connect: "Connecting",
    connecting: "Connecting",
    set: "Setting",
    remove: "Removing",
    removing: "Removing",
    build: "Building",
    building: "Building",
    check: "Checking",
    checking: "Checking",
    read: "Reading",
    reading: "Reading",
    open: "Opening",
    opening: "Opening",
  };

  const match = text.match(/^([A-Za-z]+)\s+(.+)$/);
  if (match && gerund[match[1].toLowerCase()]) {
    const object = match[2]
      .replace(/\s+(?:in|inside|under|at)\s+\S.*$/i, "")
      .replace(/[.].*$/, "")
      .trim();
    return clipSentence(`${gerund[match[1].toLowerCase()]} ${object}`);
  }

  return clipSentence(text.split(/[.!?]/)[0]);
}

function clipSentence(value) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
  if (clean.length <= 84) {
    return clean;
  }
  return `${clean.slice(0, 81).trim()}…`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { toActivitySentence };
}
