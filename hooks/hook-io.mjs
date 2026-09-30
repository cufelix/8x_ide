function parseStdin() {
  const chunks = [];
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
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
