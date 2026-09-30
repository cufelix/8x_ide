import { generateLesson as stubGenerate } from "./stub.mjs";
import { generateLesson as llmGenerate } from "./llm.mjs";

const GENERATORS = {
  stub: stubGenerate,
  llm: llmGenerate,
};

export function generatorId() {
  const raw = (process.env.MEANWHILE_GENERATOR || "").trim().toLowerCase();
  if (raw in GENERATORS) {
    return raw;
  }
  // Auto: OpenRouter when key present.
  if ((process.env.OPENROUTER_API_KEY || "").trim()) {
    return "llm";
  }
  return "stub";
}

export async function generateLesson(input) {
  const id = generatorId();
  try {
    return await GENERATORS[id](input);
  } catch {
    return stubGenerate(input);
  }
}
