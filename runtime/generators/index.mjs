import { generateLesson as stubGenerate } from "./stub.mjs";
import { generateLesson as llmGenerate } from "./llm.mjs";

const GENERATORS = {
  stub: stubGenerate,
  llm: llmGenerate,
};

export function generatorId() {
  const raw = (process.env.MEANWHILE_GENERATOR || "stub").trim().toLowerCase();
  return raw in GENERATORS ? raw : "stub";
}

export async function generateLesson(input) {
  const id = generatorId();
  return GENERATORS[id](input);
}
