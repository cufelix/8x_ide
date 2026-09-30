/**
 * Optional OpenRouter pass: propose the one constraint the repo cannot answer.
 * Used only in the background enrich step, and only when the question bank
 * had nothing. Returns null when no key, no need, or any failure.
 */
import { normalizeQuestion } from "./question.mjs";

const SYSTEM = `A developer just asked a coding agent to do a task. Decide whether the agent will be blocked on a product constraint that the repository cannot answer (e.g. pricing model, who can sign in, whether existing data may be dropped).
Return ONLY JSON: {"question": null} when there is no such constraint.
Otherwise {"question": {"title": "...?", "body": "one short sentence", "choices": [{"id":"a","label":"<= 5 words","constraint":"one sentence the agent should follow"}, ... exactly 3]}}.`;

export function questionModel() {
  return process.env.MEANWHILE_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
}

export async function proposeQuestion({ prompt, stack }) {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cufelix/slop_ide",
        "X-Title": "Meanwhile",
      },
      body: JSON.stringify({
        model: questionModel(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify({ prompt: String(prompt || "").slice(0, 600), stack }) },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[meanwhile] OpenRouter ${res.status}`);
      return null;
    }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return normalizeQuestion(parsed.question);
  } catch (err) {
    console.error("[meanwhile] question LLM:", err?.message || err);
    return null;
  }
}
