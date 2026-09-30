import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  activityPath,
  ensureMeanwhileDir,
  eventsPath,
  playerPath,
  sessionPath,
} from "./paths.mjs";

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  ensureMeanwhileDir();
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function appendJsonl(path, value) {
  ensureMeanwhileDir();
  appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

export function defaultPlayer() {
  return {
    version: 1,
    xp: 0,
    streakDays: 0,
    lastActiveDate: null,
    lessonsCompleted: 0,
  };
}

export function loadPlayer() {
  return readJson(playerPath(), defaultPlayer());
}

export function savePlayer(player) {
  writeJson(playerPath(), player);
}

export function loadSession() {
  return readJson(sessionPath(), null);
}

export function saveSession(session) {
  writeJson(sessionPath(), session);
}

export function emitEvent(type, payload = {}, sessionId) {
  const event = {
    ts: new Date().toISOString(),
    type,
    sessionId: sessionId ?? loadSession()?.id ?? null,
    payload,
  };
  appendJsonl(eventsPath(), event);
  return event;
}

export function appendActivity(entry) {
  appendJsonl(activityPath(), {
    ts: new Date().toISOString(),
    ...entry,
  });
}

export function readActivityTail(limit = 40) {
  if (!existsSync(activityPath())) {
    return [];
  }
  try {
    const lines = readFileSync(activityPath(), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function utcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function awardXp(player, amount, now = new Date()) {
  const today = utcDate(now);
  const next = { ...player, xp: player.xp + amount };
  if (player.lastActiveDate === today) {
    return next;
  }
  const yesterday = utcDate(new Date(now.getTime() - 86400000));
  next.streakDays =
    player.lastActiveDate === yesterday ? player.streakDays + 1 : 1;
  next.lastActiveDate = today;
  return next;
}
