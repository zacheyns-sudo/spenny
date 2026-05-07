import test from "node:test";
import assert from "node:assert/strict";

import { parseCsvStatement, parsePdfTextStatement } from "../src/importers.js";

test("parses CSV statements with date, description, debit and credit columns", () => {
  const csv = [
    "Date,Description,Debit,Credit,Balance",
    "05/01/2026,Netflix,15.99,,1200.00",
    "06/01/2026,Salary,,2500,3700.00",
  ].join("\n");

  const result = parseCsvStatement(csv);

  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.transactions[0], {
    id: "import-0",
    date: "2026-01-05",
    merchant: "Netflix",
    amount: -15.99,
    category: "Subscriptions",
    source: "csv",
    confidence: "high",
  });
  assert.equal(result.transactions[1].amount, 2500);
  assert.equal(result.warnings.length, 0);
});

test("parses CSV statements with signed amount column", () => {
  const csv = [
    "booking date,name,amount",
    "2026-02-04,NS Reizigers,-12.50",
    "2026-02-06,Freelance Client,900.00",
  ].join("\n");

  const result = parseCsvStatement(csv);

  assert.equal(result.transactions[0].date, "2026-02-04");
  assert.equal(result.transactions[0].category, "Transport");
  assert.equal(result.transactions[1].amount, 900);
});

test("parses semicolon CSV statements with European decimal commas", () => {
  const csv = [
    "Datum;Omschrijving;Bedrag",
    "04-04-2026;Jumbo;-28,45",
    "05-04-2026;KPN;-54,00",
  ].join("\n");

  const result = parseCsvStatement(csv);

  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].amount, -28.45);
  assert.equal(result.transactions[0].category, "Groceries");
  assert.equal(result.transactions[1].category, "Utilities");
});

test("extracts transactions from simple PDF text exports", () => {
  const text = [
    "Statement",
    "05-03-2026 Netflix -15,99",
    "06-03-2026 Albert Heijn -42,10",
  ].join("\n");

  const result = parsePdfTextStatement(text);

  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].source, "pdf");
  assert.equal(result.transactions[0].date, "2026-03-05");
  assert.equal(result.transactions[1].merchant, "Albert Heijn");
  assert.equal(result.transactions[1].amount, -42.1);
  assert.ok(result.warnings.some((warning) => warning.includes("Review")));
});
