/**
 * LLM generator seam. Wire a model client here later.
 * Selected when MEANWHILE_GENERATOR=llm.
 */
export async function generateLesson(_input) {
  throw new Error(
    "LLM generator is not wired. Set MEANWHILE_GENERATOR=stub or implement runtime/generators/llm.mjs."
  );
}
