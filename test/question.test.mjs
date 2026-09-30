import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerQuestion,
  constraintMessage,
  markDelivered,
  normalizeQuestion,
  questionFor,
} from "../runtime/question.mjs";
import { estimateDuration } from "../runtime/estimate.mjs";

const stripePrompt = "Add Stripe checkout to this Next.js site";
const stripeEstimate = estimateDuration(stripePrompt, ["Stripe", "Next.js"]);

test("Stripe checkout asks where customers pay, with three short choices", () => {
  const q = questionFor({ prompt: stripePrompt, stack: ["Stripe", "Next.js"], estimate: stripeEstimate });
  assert.equal(q.kicker, "Only you can decide");
  assert.equal(q.choices.length, 3);
  for (const c of q.choices) {
    assert.ok(c.label.length <= 40, c.label);
    assert.ok(c.constraint);
  }
  assert.equal(q.answer, null);
});

test("no question when the repo can answer it or the task is tiny", () => {
  assert.equal(
    questionFor({ prompt: "fix the typo in README", stack: [], estimate: estimateDuration("fix the typo in README") }),
    null
  );
  assert.equal(
    questionFor({ prompt: "explain this function", stack: [], estimate: estimateDuration("explain this function") }),
    null
  );
});

test("auth and data questions exist", () => {
  const auth = questionFor({ prompt: "add login with auth", stack: ["Auth"], estimate: estimateDuration("add login") });
  assert.match(auth.title, /sign in/i);
  const data = questionFor({
    prompt: "change the orders schema in postgres",
    stack: ["Postgres"],
    estimate: estimateDuration("change the orders schema"),
  });
  assert.match(data.title, /existing data/i);
});

test("broad refactors ask how careful to be", () => {
  const q = questionFor({
    prompt: "refactor the entire billing module",
    stack: [],
    estimate: estimateDuration("refactor the entire billing module"),
  });
  assert.ok(q);
  assert.equal(q.choices.length, 3);
});

test("answering records the choice without mutating, and only once", () => {
  const q = questionFor({ prompt: stripePrompt, stack: ["Stripe"], estimate: stripeEstimate });
  const pick = q.choices[1];
  const answered = answerQuestion(q, pick.id, new Date("2026-09-30T12:00:00Z"));
  assert.equal(q.answer, null);
  assert.equal(answered.answer.choiceId, pick.id);
  assert.equal(answered.answer.constraint, pick.constraint);
  assert.equal(answered.answer.deliveredAt, null);
  assert.equal(answerQuestion(answered, q.choices[0].id), answered);
  assert.equal(answerQuestion(q, "nope"), q);
});

test("constraintMessage and markDelivered", () => {
  const q = questionFor({ prompt: stripePrompt, stack: ["Stripe"], estimate: stripeEstimate });
  assert.equal(constraintMessage(q), null);
  const answered = answerQuestion(q, q.choices[0].id);
  const msg = constraintMessage(answered);
  assert.match(msg, /constraint/i);
  assert.ok(msg.includes(q.choices[0].constraint));
  const delivered = markDelivered(answered, new Date("2026-09-30T12:01:00Z"));
  assert.equal(delivered.answer.deliveredAt, "2026-09-30T12:01:00.000Z");
  assert.equal(answered.answer.deliveredAt, null);
});

test("normalizeQuestion accepts an LLM question and rejects junk", () => {
  const q = normalizeQuestion({
    title: "Which currency?",
    body: "The repo does not say.",
    choices: [
      { id: "usd", label: "USD only", constraint: "Charge in USD only" },
      { id: "eur", label: "EUR only" },
      { id: "multi", label: "Let customers pick", constraint: "Support multiple currencies" },
      { id: "extra", label: "ignored" },
    ],
  });
  assert.equal(q.choices.length, 3);
  assert.equal(q.choices[1].constraint, "EUR only");
  assert.equal(q.kicker, "Only you can decide");
  assert.equal(normalizeQuestion(null), null);
  assert.equal(normalizeQuestion({ title: "x", choices: [{ id: "a", label: "a" }] }), null);
});
