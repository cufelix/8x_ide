import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStack, mergeStack, stackFromEdit } from "../runtime/stack.mjs";

test("prompt stack uses the allowlist", () => {
  assert.deepEqual(extractStack("Add Stripe checkout to this Next.js site"), ["Stripe", "Next.js"]);
  assert.deepEqual(extractStack("make the button blue"), []);
});

test("edits add tech the task actually touches", () => {
  assert.deepEqual(
    stackFromEdit("app/api/checkout/route.ts", [
      { old_string: "", new_string: 'import Stripe from "stripe";\nimport { NextResponse } from "next/server";' },
    ]),
    ["Stripe", "Next.js"]
  );
  assert.deepEqual(stackFromEdit("prisma/schema.prisma", []), ["Prisma"]);
  assert.deepEqual(stackFromEdit("README.md", [{ new_string: "We might use stripe later" }]), []);
});

test("mergeStack keeps order and is immutable", () => {
  const cur = ["Stripe"];
  assert.deepEqual(mergeStack(cur, ["Next.js", "Stripe"]), ["Stripe", "Next.js"]);
  assert.deepEqual(cur, ["Stripe"]);
});
