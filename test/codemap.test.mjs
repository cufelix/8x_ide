import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchema, factsFromSource, resolveLocal } from "../runtime/codemap.mjs";

const route = `import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Order } from "../../../types";
export async function POST(req: Request) { return NextResponse.json({}); }
export const runtime = "nodejs";`;

test("imports and exports are read from the source", () => {
  const f = factsFromSource(route, "app/api/checkout/route.ts");
  assert.deepEqual(f.imports, ["stripe", "next/server", "@/lib/db", "../../../types"]);
  assert.deepEqual(f.exports, ["POST", "runtime"]);
  assert.equal(f.lines, 6);
});

test("require, re-exports, default exports and python", () => {
  const js = factsFromSource(`const fs = require("fs");\nexport * from "./a";\nexport default function Page() {}\nexport { x as y };`, "p.js");
  assert.deepEqual(js.imports, ["./a", "fs"]);
  assert.deepEqual(js.exports, ["Page", "y"]);
  const py = factsFromSource("from app.db import session\nimport stripe\n\ndef create_checkout():\n  pass\ndef _private():\n  pass", "x.py");
  assert.deepEqual(py.imports, ["app.db", "stripe"]);
  assert.deepEqual(py.exports, ["create_checkout"]);
});

test("local imports resolve to touched files, including @/ aliases and src/", () => {
  const known = ["app/api/checkout/route.ts", "lib/db.ts", "src/components/Button.tsx", "types.ts"];
  assert.equal(resolveLocal("app/api/checkout/route.ts", "@/lib/db", known), "lib/db.ts");
  assert.equal(resolveLocal("app/api/checkout/route.ts", "../../../types", known), "types.ts");
  assert.equal(resolveLocal("app/page.tsx", "@/components/Button", known), "src/components/Button.tsx");
  assert.equal(resolveLocal("app/page.tsx", "./nowhere", known), null);
});

test("schema: entry files on top, their imports below, packages last", () => {
  const code = {
    "app/api/checkout/route.ts": factsFromSource(route, "route.ts"),
    "lib/db.ts": factsFromSource(`import { PrismaClient } from "@prisma/client";\nexport const prisma = new PrismaClient();`, "db.ts"),
  };
  const s = buildSchema(code, { order: ["lib/db.ts", "app/api/checkout/route.ts"], active: "lib/db.ts", newFiles: ["lib/db.ts"] });
  const byId = Object.fromEntries(s.nodes.map((n) => [n.id, n]));
  assert.equal(byId["app/api/checkout/route.ts"].layer, 0);
  assert.equal(byId["app/api/checkout/route.ts"].label, "checkout/route.ts");
  assert.equal(byId["lib/db.ts"].layer, 1);
  assert.equal(byId["lib/db.ts"].active, true);
  assert.equal(byId["lib/db.ts"].isNew, true);
  assert.equal(byId["pkg:stripe"].layer, 2);
  assert.equal(byId["pkg:@prisma/client"].kind, "package");
  assert.ok(byId["pkg:next"], "subpath imports collapse to the package");
  assert.deepEqual(
    s.edges.filter((e) => e.from === "app/api/checkout/route.ts").map((e) => e.to).sort(),
    ["lib/db.ts", "pkg:next", "pkg:stripe"]
  );
});

test("unchanged files the change imports appear as context below it", () => {
  const s = buildSchema({
    "app/api/prices/route.ts": {
      imports: ["@/lib/products", "@/lib/format-price", "next/server"],
      resolved: { "@/lib/products": "lib/products.ts", "@/lib/format-price": "lib/format-price.ts" },
    },
  });
  const byId = Object.fromEntries(s.nodes.map((n) => [n.id, n]));
  assert.equal(byId["lib/products.ts"].kind, "context");
  assert.equal(byId["lib/products.ts"].layer, 1);
  assert.equal(byId["pkg:next"].layer, 2);
  assert.equal(s.edges.length, 3);
});

test("schema skips node builtins, survives cycles, and is null when empty", () => {
  const s = buildSchema({
    "a.ts": { imports: ["./b", "node:fs", "path"] },
    "b.ts": { imports: ["./a"] },
  });
  assert.equal(s.nodes.length, 2);
  assert.ok(s.nodes.every((n) => n.layer < 2));
  assert.equal(buildSchema({}), null);
});
