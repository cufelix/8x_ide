const STDIN_TIMEOUT_MS = 3000;

function parseStdin() {
  const chunks = [];
  return new Promise((resolve) => {
    // If the host never closes stdin, go with what arrived rather than hang.
    const timer = setTimeout(() => process.stdin.emit("end"), STDIN_TIMEOUT_MS);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.once("end", () => {
      clearTimeout(timer);
      const raw = chunks.join("").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ _raw: raw });
      }
    });
  });
}

function promptFrom(input) {
  return (
    input.prompt ||
    input.text ||
    input.user_prompt ||
    input.message ||
    input.content ||
    ""
  );
}

function conversationIdFrom(input) {
  return input.conversation_id || input.conversationId || null;
}

export { conversationIdFrom, parseStdin, promptFrom };
