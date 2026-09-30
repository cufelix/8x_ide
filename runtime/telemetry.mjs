/**
 * Telemetry seam. Swap FileSink for HTTP/Posthog later without touching hooks.
 * @typedef {{ emit(event: object): void }} TelemetrySink
 */

import { eventsPath } from "./paths.mjs";
import { appendJsonl } from "./store.mjs";

export const FileSink = {
  emit(event) {
    appendJsonl(eventsPath(), event);
  },
};

/** @type {TelemetrySink} */
export let sink = FileSink;

export function setSink(next) {
  sink = next;
}

export function track(type, payload = {}, sessionId = null) {
  const event = {
    ts: new Date().toISOString(),
    type,
    sessionId,
    payload,
  };
  sink.emit(event);
  return event;
}
