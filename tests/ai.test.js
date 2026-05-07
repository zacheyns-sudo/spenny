import test from "node:test";
import assert from "node:assert/strict";

import { buildAiPayload, redactTransaction } from "../src/ai.js";

test("redacts transaction data before AI assist", () => {
  const redacted = redactTransaction({
    date: "2026-04-12",
    merchant: "NL91 ABNA 0417 1643 00 Netflix Card 7289",
    amount: -15.99,
    category: "Subscriptions",
  });

  assert.deepEqual(redacted, {
    month: "2026-04",
    merchant: "Netflix Card",
    amountBand: "10-25",
    direction: "outgoing",
    category: "Subscriptions",
  });
});

test("AI payload contains only approved redacted transactions and aggregates", () => {
  const payload = buildAiPayload({
    purpose: "summarize",
    transactions: [
      { date: "2026-04-01", merchant: "Albert Heijn 1234", amount: -41.2, category: "Groceries" },
      { date: "2026-04-02", merchant: "Salary NL99 BANK", amount: 2500, category: "Income" },
    ],
    habits: {
      totalFlexibleSpend: 41.2,
      categories: [{ category: "Groceries", total: 41.2, count: 1, share: 100 }],
    },
  });

  const serialized = JSON.stringify(payload);

  assert.equal(payload.purpose, "summarize");
  assert.equal(payload.transactions.length, 2);
  assert.match(serialized, /amountBand/);
  assert.doesNotMatch(serialized, /NL99/);
  assert.doesNotMatch(serialized, /1234/);
  assert.doesNotMatch(serialized, /2500/);
});
