import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateWeeklyPlan,
  categorizeMerchant,
  detectRecurringBills,
  summarizeSpendingHabits,
} from "../src/finance.js";

test("calculates weekly allowance with full weeks and a final partial period", () => {
  const plan = calculateWeeklyPlan({
    monthlyIncome: 2600,
    recurringBills: [
      { merchant: "Rent", amount: -1200 },
      { merchant: "Netflix", amount: -15.99 },
    ],
    month: "2026-05",
  });

  assert.equal(plan.daysInMonth, 31);
  assert.equal(plan.fullWeeks, 4);
  assert.equal(plan.remainingDays, 3);
  assert.equal(plan.monthlyFlexible, 1384.01);
  assert.equal(plan.dailyAllowance, 44.65);
  assert.equal(plan.weeklyAllowance, 312.52);
  assert.equal(plan.finalPeriodAllowance, 133.94);
});

test("detects recurring monthly bills from repeated outgoing payments", () => {
  const bills = detectRecurringBills([
    { id: "1", date: "2026-01-05", merchant: "Netflix", amount: -15.99, category: "Entertainment" },
    { id: "2", date: "2026-02-05", merchant: "NETFLIX.COM", amount: -15.99, category: "Entertainment" },
    { id: "3", date: "2026-03-06", merchant: "Netflix", amount: -16.49, category: "Entertainment" },
    { id: "4", date: "2026-01-08", merchant: "Albert Heijn", amount: -34.22, category: "Groceries" },
    { id: "5", date: "2026-01-20", merchant: "Albert Heijn", amount: -19.71, category: "Groceries" },
  ]);

  assert.equal(bills.length, 1);
  assert.equal(bills[0].merchant, "Netflix");
  assert.equal(bills[0].cadence, "monthly");
  assert.equal(bills[0].averageAmount, -16.16);
});

test("categorizes known Netherlands merchants and spending habits", () => {
  assert.equal(categorizeMerchant("Albert Heijn Amsterdam"), "Groceries");
  assert.equal(categorizeMerchant("NS Reizigers"), "Transport");
  assert.equal(categorizeMerchant("Spotify"), "Subscriptions");
  assert.equal(categorizeMerchant("Mystery Shop"), "Uncategorized");
});

test("summarizes flexible spending habits excluding recurring bills and income", () => {
  const habits = summarizeSpendingHabits(
    [
      { merchant: "Albert Heijn", amount: -50, category: "Groceries" },
      { merchant: "Jumbo", amount: -25, category: "Groceries" },
      { merchant: "NS", amount: -15, category: "Transport" },
      { merchant: "Salary", amount: 2500, category: "Income" },
      { merchant: "Netflix", amount: -15.99, category: "Subscriptions" },
    ],
    [{ merchantKey: "netflix", merchant: "Netflix" }],
  );

  assert.deepEqual(habits.categories.slice(0, 2), [
    { category: "Groceries", total: 75, count: 2, share: 83 },
    { category: "Transport", total: 15, count: 1, share: 17 },
  ]);
  assert.equal(habits.totalFlexibleSpend, 90);
});
