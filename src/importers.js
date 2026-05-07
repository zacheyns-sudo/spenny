import { categorizeMerchant, displayMerchant, roundMoney } from "./finance.js";

const DATE_HEADERS = ["date", "datum", "booking date", "transaction date", "boekingsdatum"];
const MERCHANT_HEADERS = ["description", "omschrijving", "name", "merchant", "counterparty", "tegenpartij", "details"];
const AMOUNT_HEADERS = ["amount", "bedrag", "transaction amount", "mutatie"];
const DEBIT_HEADERS = ["debit", "af", "withdrawal", "money out", "debet"];
const CREDIT_HEADERS = ["credit", "bij", "deposit", "money in", "credit"];

export function parseCsvStatement(text) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => String(cell).trim()));
  if (rows.length < 2) {
    return { transactions: [], warnings: ["No transaction rows were found."] };
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  const indices = {
    date: findHeader(headers, DATE_HEADERS),
    merchant: findHeader(headers, MERCHANT_HEADERS),
    amount: findHeader(headers, AMOUNT_HEADERS),
    debit: findHeader(headers, DEBIT_HEADERS),
    credit: findHeader(headers, CREDIT_HEADERS),
  };

  const warnings = [];
  if (indices.date < 0) warnings.push("Date column was not detected.");
  if (indices.merchant < 0) warnings.push("Description or merchant column was not detected.");
  if (indices.amount < 0 && indices.debit < 0 && indices.credit < 0) warnings.push("Amount columns were not detected.");

  const transactions = rows.slice(1).flatMap((row, index) => {
    const date = parseDate(row[indices.date]);
    const merchant = row[indices.merchant] || "Unknown merchant";
    const amount = parseAmountFromRow(row, indices);
    if (!date || amount === null) return [];
    return [buildTransaction({ id: `import-${index}`, date, merchant, amount, source: "csv", confidence: "high" })];
  });

  return { transactions, warnings };
}

export function parsePdfTextStatement(text) {
  const warnings = ["PDF import is best-effort. Review every extracted transaction before saving."];
  const pattern = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s+(.+?)\s+(-?\d{1,6}(?:[.,]\d{2}))/g;
  const transactions = [...String(text).matchAll(pattern)].flatMap((match, index) => {
      const date = parseDate(match[1]);
      const merchant = match[2].trim();
      const amount = parseMoney(match[3]);
      if (!date || amount === null) return [];
      return [buildTransaction({ id: `pdf-${index}`, date, merchant, amount, source: "pdf", confidence: "review" })];
    });

  if (transactions.length === 0) warnings.push("No transactions were found in the PDF text.");
  return { transactions, warnings };
}

export async function parseStatementFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return parseCsvStatement(await file.text());
  }
  if (name.endsWith(".pdf")) {
    const text = await extractBestEffortPdfText(file);
    return parsePdfTextStatement(text);
  }
  return { transactions: [], warnings: ["Use a CSV or PDF statement file."] };
}

async function extractBestEffortPdfText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return binary
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/[()<>]/g, " ")
    .replace(/\s+/g, " ");
}

function buildTransaction({ id, date, merchant, amount, source, confidence }) {
  const cleanMerchant = displayMerchant(merchant);
  return {
    id,
    date,
    merchant: cleanMerchant,
    amount: roundMoney(amount),
    category: amount > 0 ? "Income" : categorizeMerchant(cleanMerchant),
    source,
    confidence,
  };
}

function parseCsvRows(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  rows.push(row);
  return rows;
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function findHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function parseAmountFromRow(row, indices) {
  if (indices.amount >= 0) return parseMoney(row[indices.amount]);
  const debit = indices.debit >= 0 ? parseMoney(row[indices.debit]) : null;
  const credit = indices.credit >= 0 ? parseMoney(row[indices.credit]) : null;
  if (credit !== null && credit !== 0) return Math.abs(credit);
  if (debit !== null && debit !== 0) return -Math.abs(debit);
  return null;
}

function parseMoney(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const negative = raw.includes("-") || /^\(.+\)$/.test(raw);
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number.parseFloat(normalized);
  if (Number.isNaN(amount)) return null;
  return roundMoney(negative ? -Math.abs(amount) : amount);
}

function parseDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const local = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!local) return "";
  const year = local[3].length === 2 ? `20${local[3]}` : local[3];
  return `${year}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
}
