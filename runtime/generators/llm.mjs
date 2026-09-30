/**
 * OpenRouter-backed lesson generator.
 * Selected when MEANWHILE_GENERATOR=llm or OPENROUTER_API_KEY is set.
 */

function clip(text, max = 400) {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function fallbackCards({ prompt, stack, videos }) {
  const summary = clip(prompt, 220);
  return [
    {
      id: "explain-intent",
      kind: "explain",
      variant: "openrouter-fallback",
      title: "What the agent is doing",
      body: `Working from:\n\n“${summary}”\n\nStack: ${(stack || []).join(", ") || "unknown"}.`,
      choices: null,
      expectedChoiceId: null,
      xp: 10,
      durationSec: 50,
      media: videos?.[0]
        ? { type: "video", ref: videos[0].videoId }
        : { type: "none" },
      contextRefs: [],
    },
    {
      id: "decision-scope",
      kind: "decision",
      variant: "openrouter-fallback",
      title: "Only you can decide",
      body: "Pick the constraint the agent cannot infer from the repo alone.",
      choices: [
        { id: "ship-thin", label: "Ship the thinnest vertical slice" },
        { id: "keep-compat", label: "Preserve existing behavior even if slower" },
        { id: "optimize-later", label: "Prefer clean internals; polish later" },
      ],
      expectedChoiceId: null,
      xp: 20,
      durationSec: 45,
      media: { type: "none" },
      contextRefs: [],
    },
  ];
}

function normalizeCards(raw, { videos }) {
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw.slice(0, 6).map((c, i) => ({
    id: String(c.id || `card-${i}`),
    kind: ["explain", "decision", "teach", "quiz"].includes(c.kind)
      ? c.kind
      : "explain",
    variant: "openrouter-v1",
    title: String(c.title || "Meanwhile").slice(0, 120),
    body: String(c.body || "").slice(0, 900),
    choices: Array.isArray(c.choices)
      ? c.choices.slice(0, 4).map((ch, j) => ({
          id: String(ch.id || `c${j}`),
          label: String(ch.label || "").slice(0, 160),
        }))
      : null,
    expectedChoiceId: c.expectedChoiceId ?? null,
    xp: Number(c.xp) || 10,
    durationSec: Number(c.durationSec) || 60,
    media:
      i === 0 && videos?.[0]
        ? { type: "video", ref: videos[0].videoId }
        : { type: "none" },
    contextRefs: [],
  }));
}

export async function generateLesson(input) {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const model =
    process.env.MEANWHILE_MODEL ||
    process.env.OPENROUTER_MODEL ||
    "openai/gpt-4.1-mini";

  const stack = input.stack || [];
  const estimate = input.estimate || null;
  const mid = estimate
    ? Math.round((estimate.secondsMin + estimate.secondsMax) / 2)
    : 480;
  const cardCount = Math.max(2, Math.min(5, Math.ceil(mid / 90)));

  const system = `You write Meanwhile micro-lesson cards for developers waiting on a coding agent.
Return ONLY valid JSON: {"cards":[...]} with ${cardCount} cards.
Each card: {id, kind, title, body, choices?, expectedChoiceId?, xp, durationSec}
kind is one of: explain | decision | teach | quiz
decision/teach/quiz should include 2-3 choices with id+label.
Keep titles short. Body max ~3 sentences. Personalized to the stack and prompt.
No markdown fences.`;

  const user = JSON.stringify({
    prompt: clip(input.prompt, 500),
    stack,
    estimateLabel: estimate?.label || null,
    videoTitles: (input.videos || []).map((v) => v.title).slice(0, 3),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cufelix/slop_ide",
        "X-Title": "Meanwhile",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter ${res.status}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const cards = normalizeCards(parsed.cards || parsed, input);
    if (!cards?.length) {
      return fallbackCards(input);
    }
    return cards;
  } catch {
    return fallbackCards(input);
  } finally {
    clearTimeout(timer);
  }
}
