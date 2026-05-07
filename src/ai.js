import { roundMoney } from "./finance.js";

const AMOUNT_BANDS = [
  [0, 10, "0-10"],
  [10, 25, "10-25"],
  [25, 50, "25-50"],
  [50, 100, "50-100"],
  [100, 250, "100-250"],
  [250, 500, "250-500"],
  [500, Infinity, "500+"],
];

export function redactTransaction(transaction) {
  const amount = Number(transaction.amount || 0);
  return {
    month: String(transaction.date || "").slice(0, 7),
    merchant: redactMerchant(transaction.merchant),
    amountBand: amountBand(amount),
    direction: amount < 0 ? "outgoing" : "incoming",
    category: transaction.category || "Uncategorized",
  };
}

export function buildAiPayload({ purpose, transactions = [], habits = {} }) {
  return {
    purpose,
    locale: "nl-NL",
    currency: "EUR",
    safety: "No raw statement files, account identifiers, exact account balances, or full transaction history.",
    transactions: transactions.map(redactTransaction),
    aggregates: {
      totalFlexibleSpend: roundMoney(habits.totalFlexibleSpend || 0),
      categories: (habits.categories || []).map((item) => ({
        category: item.category,
        totalBand: amountBand(item.total),
        count: item.count,
        share: item.share,
      })),
    },
  };
}

export async function requestAiAssist({ apiKey, payload }) {
  if (!apiKey) throw new Error("Add your API key in Settings before using AI assist.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarize personal spending data without giving financial, legal, tax, investment, or credit advice. Be concise and practical.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error("AI assist request failed. Check your key and connection.");
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "No summary returned.";
}

function redactMerchant(value = "") {
  return String(value)
    .replace(/\b[A-Z]{2}\d{2}\s?[A-Z]{4}(?:\s?\d{2,4}){2,5}\b/gi, "")
    .replace(/\b[A-Z]{2}\d{2}\s?[A-Z]{2,6}\b/gi, "")
    .replace(/\b\d{3,}\b/g, "")
    .replace(/\b(iban|sepa|ideal|pas|betaling|incasso)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function amountBand(value) {
  const amount = Math.abs(Number(value || 0));
  return AMOUNT_BANDS.find(([min, max]) => amount >= min && amount < max)?.[2] ?? "unknown";
}
