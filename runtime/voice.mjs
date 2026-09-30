import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { meanwhileDir, ensureMeanwhileDir } from "./paths.mjs";

/**
 * Optional ElevenLabs TTS for a short waiting-room line.
 * Writes .meanwhile/voice.mp3 when ELEVENLABS_API_KEY (or ELEVEN_API_KEY) is set.
 */
export async function maybeSpeak(text, { root } = {}) {
  const apiKey = (
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVEN_API_KEY ||
    ""
  ).trim();
  if (!apiKey || !text) {
    return null;
  }

  const voiceId =
    process.env.ELEVENLABS_VOICE_ID ||
    process.env.ELEVEN_VOICE_ID ||
    "21m00Tcm4TlvDq8ikWAM"; // Rachel default
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
  const line = String(text).replace(/\s+/g, " ").trim().slice(0, 280);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: line,
          model_id: modelId,
          voice_settings: { stability: 0.4, similarity_boost: 0.7 },
        }),
      }
    );
    if (!res.ok) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = ensureMeanwhileDir(root);
    const out = join(dir, "voice.mp3");
    writeFileSync(out, buf);
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function voicePath(root) {
  return join(meanwhileDir(root), "voice.mp3");
}
