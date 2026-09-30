#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conversationIdFrom, parseStdin } from "./hook-io.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { onCodingSessionStart } = await import(
  pathToFileURL(join(root, "runtime/pipeline.mjs")).href
);

const input = await parseStdin();
onCodingSessionStart({ conversationId: conversationIdFrom(input) });
process.exit(0);
