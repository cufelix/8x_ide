import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeEdit,
  describeThought,
  summarizeChanges,
} from "../runtime/activity.mjs";

test("route files read as wiring a route", () => {
  assert.equal(describeEdit("app/api/checkout/route.ts"), "wiring the checkout route");
  assert.equal(describeEdit("src/pages/api/orders.ts"), "wiring the orders route");
  assert.equal(
    describeEdit("/abs/proj/app/api/orders/[id]/route.ts"),
    "wiring the orders route"
  );
});

test("pages, components, schema, tests, config", () => {
  assert.equal(describeEdit("app/pricing/page.tsx"), "building the pricing page");
  assert.equal(describeEdit("app/page.tsx"), "building the home page");
  assert.equal(
    describeEdit("src/components/CartButton.tsx"),
    "editing the CartButton component"
  );
  assert.equal(describeEdit("prisma/schema.prisma"), "updating the database schema");
  assert.equal(describeEdit("tests/checkout.test.ts"), "writing the checkout tests");
  assert.equal(describeEdit("package.json"), "updating the dependencies");
  assert.equal(describeEdit(".env.example"), "updating the environment config");
});

test("unknown files fall back to the file name", () => {
  assert.equal(describeEdit("lib/stripe.ts"), "editing stripe.ts");
  assert.equal(describeEdit(null), null);
});

test("thoughts become one short plain-language line", () => {
  assert.equal(
    describeThought("Let me look at how the checkout route is wired. Then I will add the handler."),
    "looking at how the checkout route is wired"
  );
  assert.equal(
    describeThought("I'll add the Stripe webhook handler next"),
    "adding the Stripe webhook handler next"
  );
  assert.equal(
    describeThought("I need to check the env vars"),
    "checking the env vars"
  );
});

test("thoughts are clipped at a word boundary", () => {
  const line = describeThought(
    "Now I am reviewing the entire orders module to understand how payments flow through every single service"
  );
  assert.ok(line.length <= 64, line);
  assert.ok(line.endsWith("…"), line);
  assert.ok(!/\s…$/.test(line));
});

test("noise thoughts are ignored", () => {
  assert.equal(describeThought(""), null);
  assert.equal(describeThought("ok"), null);
  assert.equal(describeThought("```ts\nconst x = 1\n```"), null);
});

test("summarizeChanges names the main change and counts files", () => {
  assert.equal(
    summarizeChanges([
      { path: "package.json", isNew: false },
      { path: "app/api/checkout/route.ts", isNew: true },
      { path: "lib/stripe.ts", isNew: true },
      { path: "tests/checkout.test.ts", isNew: true },
    ]),
    "Checkout route added, 4 files"
  );
  assert.equal(
    summarizeChanges([{ path: "src/components/Nav.tsx", isNew: false }]),
    "Nav component updated, 1 file"
  );
  assert.equal(summarizeChanges([]), "No files changed");
});

test("among equal changes, the one the prompt names first wins", () => {
  const files = [
    { path: "app/api/webhooks/orders/route.ts", isNew: true },
    { path: "app/api/checkout/route.ts", isNew: true },
  ];
  assert.equal(summarizeChanges(files), "Orders route added, 2 files");
  assert.equal(
    summarizeChanges(files, "Add Stripe checkout: an API route and an orders webhook"),
    "Checkout route added, 2 files"
  );
});
