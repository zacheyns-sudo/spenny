const CATEGORY_RULES = [
  { category: "Groceries", patterns: ["albert heijn", "ah ", "jumbo", "lidl", "aldi", "dirk", "plus "] },
  { category: "Transport", patterns: ["ns reizigers", "ns ", "ov-chip", "uber", "bolt", "9292", "gvb"] },
  { category: "Subscriptions", patterns: ["netflix", "spotify", "apple.com/bill", "adobe", "youtube", "icloud"] },
  { category: "Housing", patterns: ["rent", "huur", "mortgage", "hypotheek"] },
  { category: "Utilities", patterns: ["vattenfall", "eneco", "essent", "ziggo", "kpn", "odido", "waternet"] },
  { category: "Dining", patterns: ["thuisbezorgd", "restaurant", "cafe", "coffee", "starbucks"] },
  { category: "Shopping", patterns: ["bol.com", "amazon", "zalando", "h&m", "ikea"] },
  { category: "Income", patterns: ["salary", "salaris", "payroll", "freelance client"] },
];

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizeMerchantName(value = "") {
  return String(value)
    .replace(/\b(iban|sepa|ideal|card|pas|betaling|incasso)\b/gi, " ")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7,}\b/gi, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\.(com|nl|eu)\b/gi, " ")
    .replace(/[^a-z0-9&+\-\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function merchantKey(value = "") {
  return normalizeMerchantName(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function displayMerchant(value = "") {
  const cleaned = normalizeMerchantName(value);
  if (!cleaned) return "Unknown merchant";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["ns", "kpn", "h&m"].includes(lower)) return word.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function categorizeMerchant(merchant = "") {
  const key = ` ${merchantKey(merchant)} `;
  const match = CATEGORY_RULES.find((rule) =>
    rule.patterns.some((pattern) => key.includes(` ${pattern.trim()} `) || key.includes(pattern.trim())),
  );
  return match?.category ?? "Uncategorized";
}

export function calculateWeeklyPlan({ monthlyIncome = 0, recurringBills = [], month = currentMonthKey() }) {
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const fullWeeks = Math.floor(daysInMonth / 7);
  const remainingDays = daysInMonth % 7;
  const monthlyBills = roundMoney(
    recurringBills.reduce((sum, bill) => sum + Math.abs(Number(bill.averageAmount ?? bill.amount ?? 0)), 0),
  );
  const monthlyFlexible = roundMoney(Number(monthlyIncome || 0) - monthlyBills);
  const dailyRaw = monthlyFlexible / daysInMonth;

  return {
    month,
    daysInMonth,
    fullWeeks,
    remainingDays,
    monthlyIncome: roundMoney(monthlyIncome),
    monthlyBills,
    monthlyFlexible,
    dailyAllowance: roundMoney(dailyRaw),
    weeklyAllowance: roundMoney(dailyRaw * 7),
    finalPeriodAllowance: roundMoney(dailyRaw * remainingDays),
  };
}

export function detectRecurringBills(transactions = []) {
  const outgoing = transactions
    .filter((transaction) => Number(transaction.amount) < 0 && transaction.date)
    .map((transaction) => ({
      ...transaction,
      merchantKey: merchantKey(transaction.merchant),
      monthKey: transaction.date.slice(0, 7),
      day: Number(transaction.date.slice(8, 10)),
    }))
    .filter((transaction) => transaction.merchantKey);

  const groups = new Map();
  for (const transaction of outgoing) {
    const existing = groups.get(transaction.merchantKey) ?? [];
    existing.push(transaction);
    groups.set(transaction.merchantKey, existing);
  }

  return [...groups.entries()]
    .map(([key, group]) => recurringBillFromGroup(key, group))
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.averageAmount) - Math.abs(a.averageAmount));
}

function recurringBillFromGroup(key, group) {
  const uniqueMonths = new Set(group.map((item) => item.monthKey));
  if (uniqueMonths.size < 3) return null;

  const amounts = group.map((item) => Math.abs(Number(item.amount)));
  const averageAbs = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const stableAmount = amounts.every((amount) => Math.abs(amount - averageAbs) <= Math.max(2, averageAbs * 0.15));
  const averageDay = group.reduce((sum, item) => sum + item.day, 0) / group.length;
  const stableDate = group.every((item) => Math.abs(item.day - averageDay) <= 4);

  if (!stableAmount || !stableDate) return null;

  return {
    merchantKey: key,
    merchant: displayMerchant(group[0].merchant),
    averageAmount: roundMoney(-averageAbs),
    cadence: "monthly",
    occurrences: group.length,
    category: group[0].category || categorizeMerchant(group[0].merchant),
    nextExpectedDay: Math.round(averageDay),
  };
}

export function summarizeSpendingHabits(transactions = [], recurringBills = []) {
  const recurringKeys = new Set(recurringBills.map((bill) => bill.merchantKey || merchantKey(bill.merchant)));
  const flexible = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    const key = merchantKey(transaction.merchant);
    return !recurringKeys.has(key);
  });
  const totalFlexibleSpend = roundMoney(flexible.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0));
  const categories = new Map();
  const merchants = new Map();

  for (const transaction of flexible) {
    const category = transaction.category || categorizeMerchant(transaction.merchant);
    const categoryEntry = categories.get(category) ?? { category, total: 0, count: 0 };
    categoryEntry.total += Math.abs(Number(transaction.amount));
    categoryEntry.count += 1;
    categories.set(category, categoryEntry);

    const key = merchantKey(transaction.merchant);
    const merchantEntry = merchants.get(key) ?? { merchant: displayMerchant(transaction.merchant), total: 0, count: 0 };
    merchantEntry.total += Math.abs(Number(transaction.amount));
    merchantEntry.count += 1;
    merchants.set(key, merchantEntry);
  }

  return {
    totalFlexibleSpend,
    categories: rankedWithShare([...categories.values()], totalFlexibleSpend),
    merchants: rankedWithShare([...merchants.values()], totalFlexibleSpend).slice(0, 8),
  };
}

function rankedWithShare(items, total) {
  return items
    .map((item) => ({
      ...item,
      total: roundMoney(item.total),
      share: total > 0 ? Math.round((item.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatEuro(value) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
