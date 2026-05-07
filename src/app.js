import { buildAiPayload, requestAiAssist } from "./ai.js";
import {
  calculateWeeklyPlan,
  currentMonthKey,
  detectRecurringBills,
  formatEuro,
  merchantKey,
  summarizeSpendingHabits,
} from "./finance.js";
import { parseStatementFile } from "./importers.js";
import { loadState, saveState } from "./storage.js";

const app = document.querySelector("#app");
const categories = ["Groceries", "Transport", "Subscriptions", "Housing", "Utilities", "Dining", "Shopping", "Income", "Uncategorized"];

let state = await loadState();
let activeView = "home";
let draftImport = { transactions: [], warnings: [], fileName: "" };
let aiPreview = null;
let busy = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();

function derived() {
  const bills = detectRecurringBills(state.transactions).filter((bill) => !state.dismissedBills.includes(bill.merchantKey));
  const plan = calculateWeeklyPlan({ monthlyIncome: state.manualIncome, recurringBills: bills, month: currentMonthKey() });
  const habits = summarizeSpendingHabits(state.transactions, bills);
  return { bills, plan, habits };
}

function render() {
  const data = derived();
  app.innerHTML = `
    <main class="phone-frame">
      <section class="top-surface">
        <div class="app-bar">
          <div class="brand-mark" aria-hidden="true"></div>
          <div>
            <p class="eyebrow">Spenny</p>
            <h1>${viewTitle(activeView)}</h1>
          </div>
          <button class="icon-button" data-view="ai" aria-label="AI settings">${iconSpark()}</button>
        </div>
        ${activeView === "home" ? renderHero(data) : ""}
      </section>
      <section class="content-surface">
        ${viewTemplate(activeView, data)}
      </section>
      ${renderNav()}
    </main>
  `;
  bindEvents();
}

function viewTitle(view) {
  return {
    home: "Weekly spend",
    import: "Import",
    habits: "Habits",
    bills: "Bills",
    ai: "AI assist",
  }[view];
}

function viewTemplate(view, data) {
  if (view === "import") return renderImport();
  if (view === "habits") return renderHabits(data);
  if (view === "bills") return renderBills(data);
  if (view === "ai") return renderAi(data);
  return renderHome(data);
}

function renderHero({ plan }) {
  const isShort = plan.monthlyFlexible < 0;
  return `
    <div class="hero">
      <p class="metric-label">${isShort ? "Monthly gap" : "Safe weekly spend"}</p>
      <div class="hero-number">${formatEuro(isShort ? plan.monthlyFlexible : plan.weeklyAllowance)}</div>
      <div class="hero-grid">
        <div>
          <span>Income</span>
          <strong>${formatEuro(plan.monthlyIncome)}</strong>
        </div>
        <div>
          <span>Bills</span>
          <strong>${formatEuro(plan.monthlyBills)}</strong>
        </div>
        <div>
          <span>Final ${plan.remainingDays} days</span>
          <strong>${formatEuro(plan.finalPeriodAllowance)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderHome({ bills, plan, habits }) {
  return `
    <div class="section-row">
      <label class="field-label" for="income">Monthly income</label>
      <div class="money-input">
        <span>€</span>
        <input id="income" inputmode="decimal" value="${state.manualIncome || ""}" placeholder="0.00" />
      </div>
    </div>
    <div class="insight-strip">
      <div>
        <span>${plan.fullWeeks} full weeks</span>
        <strong>${formatEuro(plan.weeklyAllowance)}</strong>
      </div>
      <div>
        <span>${plan.remainingDays} final days</span>
        <strong>${formatEuro(plan.finalPeriodAllowance)}</strong>
      </div>
    </div>
    <div class="action-grid">
      <button class="command" data-view="import">${iconUpload()} Import statement</button>
      <button class="command" data-view="bills">${iconRepeat()} Review bills</button>
    </div>
    <section class="panel">
      <div class="panel-heading">
        <h2>Recurring bills</h2>
        <button class="text-button" data-view="bills">View all</button>
      </div>
      ${bills.length ? bills.slice(0, 4).map(renderBillRow).join("") : emptyState("No recurring bills detected yet.")}
    </section>
    <section class="panel">
      <div class="panel-heading">
        <h2>Spending habits</h2>
        <button class="text-button" data-view="habits">Open</button>
      </div>
      ${habits.categories.length ? renderBars(habits.categories.slice(0, 4)) : emptyState("Import a statement to see flexible spending patterns.")}
    </section>
  `;
}

function renderImport() {
  return `
    <section class="panel import-panel">
      <p class="step-label">1. Upload</p>
      <label class="drop-zone">
        ${iconUpload()}
        <span>Choose CSV or PDF statement</span>
        <small>Files are parsed in this browser and reviewed before saving.</small>
        <input id="statement-file" type="file" accept=".csv,.pdf,text/csv,application/pdf" />
      </label>
      <button class="secondary-command" id="demo-import">Load sample statement</button>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="step-label">2. Review</p>
          <h2>${draftImport.fileName || "No file selected"}</h2>
        </div>
        <button class="primary-command" id="save-import" ${draftImport.transactions.length ? "" : "disabled"}>Save import</button>
      </div>
      ${draftImport.warnings.map((warning) => `<p class="warning">${escapeHtml(warning)}</p>`).join("")}
      ${draftImport.transactions.length ? renderReviewTable() : emptyState("Uploaded transactions will appear here for correction.")}
    </section>
  `;
}

function renderReviewTable() {
  return `
    <div class="review-list">
      ${draftImport.transactions
        .map(
          (transaction, index) => `
          <article class="review-item">
            <input data-import-field="date" data-index="${index}" value="${transaction.date}" aria-label="Transaction date" />
            <input data-import-field="merchant" data-index="${index}" value="${escapeHtml(transaction.merchant)}" aria-label="Merchant" />
            <input data-import-field="amount" data-index="${index}" inputmode="decimal" value="${transaction.amount}" aria-label="Amount" />
            <select data-import-field="category" data-index="${index}" aria-label="Category">
              ${categories.map((category) => `<option ${category === transaction.category ? "selected" : ""}>${category}</option>`).join("")}
            </select>
          </article>
        `,
        )
        .join("")}
    </div>
  `;
}

function renderHabits({ habits }) {
  return `
    <section class="panel">
      <p class="metric-label">Flexible spend found</p>
      <div class="large-amount">${formatEuro(habits.totalFlexibleSpend)}</div>
      ${habits.categories.length ? renderBars(habits.categories) : emptyState("Import a statement to start habit tracking.")}
    </section>
    <section class="panel">
      <div class="panel-heading"><h2>Top merchants</h2></div>
      ${habits.merchants.length ? habits.merchants.map((item) => renderListRow(item.merchant, `${formatEuro(item.total)} · ${item.count}x`)).join("") : emptyState("No merchants yet.")}
    </section>
  `;
}

function renderBills({ bills, plan }) {
  return `
    <section class="panel">
      <p class="metric-label">Monthly recurring bills</p>
      <div class="large-amount">${formatEuro(plan.monthlyBills)}</div>
      ${bills.length ? bills.map(renderBillRow).join("") : emptyState("No recurring bills detected. Import at least three months for stronger detection.")}
    </section>
  `;
}

function renderAi({ habits }) {
  const configured = Boolean(state.aiSettings.apiKey);
  const enabled = state.aiSettings.enabled && configured;
  aiPreview = buildAiPayload({
    purpose: "summarize",
    transactions: state.transactions.filter((transaction) => transaction.amount < 0).slice(-12),
    habits,
  });
  return `
    <section class="panel">
      <div class="status-row">
        <div>
          <p class="metric-label">AI assist</p>
          <h2>${enabled ? "Configured" : "Off"}</h2>
        </div>
        <label class="switch">
          <input id="ai-enabled" type="checkbox" ${enabled ? "checked" : ""} ${configured ? "" : "disabled"} />
          <span></span>
        </label>
      </div>
      <label class="field-label" for="api-key">OpenAI API key</label>
      <input id="api-key" class="text-input" type="password" value="${escapeHtml(state.aiSettings.apiKey)}" placeholder="sk-..." autocomplete="off" />
      <p class="privacy-note">Only the preview below can be sent. Raw files, IBANs, card numbers, account names, and exact transaction amounts are excluded.</p>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <h2>Approval preview</h2>
        <button class="primary-command" id="ask-ai" ${enabled && state.transactions.length ? "" : "disabled"}>${busy ? "Asking..." : "Approve & summarize"}</button>
      </div>
      <pre class="payload-preview">${escapeHtml(JSON.stringify(aiPreview, null, 2))}</pre>
    </section>
    <section class="panel">
      <div class="panel-heading"><h2>Last AI summary</h2></div>
      <p class="summary-text">${escapeHtml(state.aiSettings.lastSummary || "No AI summary yet.")}</p>
    </section>
  `;
}

function renderBars(items) {
  return `
    <div class="bar-stack">
      ${items
        .map(
          (item) => `
          <div class="bar-row">
            <div class="bar-meta">
              <span>${escapeHtml(item.category || item.merchant)}</span>
              <strong>${formatEuro(item.total)}</strong>
            </div>
            <div class="bar-track"><div style="width:${Math.min(100, item.share || 0)}%"></div></div>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
}

function renderBillRow(bill) {
  return `
    <article class="list-row">
      <div class="merchant-dot">${escapeHtml(bill.merchant.charAt(0))}</div>
      <div>
        <strong>${escapeHtml(bill.merchant)}</strong>
        <span>${bill.cadence} · around day ${bill.nextExpectedDay}</span>
      </div>
      <div class="row-amount">${formatEuro(Math.abs(bill.averageAmount))}</div>
      <button class="mini-button" data-dismiss-bill="${bill.merchantKey}" aria-label="Dismiss ${escapeHtml(bill.merchant)}">×</button>
    </article>
  `;
}

function renderListRow(title, detail) {
  return `
    <article class="list-row">
      <div class="merchant-dot">${escapeHtml(title.charAt(0))}</div>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    </article>
  `;
}

function renderNav() {
  const views = [
    ["home", iconHome(), "Home"],
    ["import", iconUpload(), "Import"],
    ["habits", iconGrid(), "Habits"],
    ["bills", iconRepeat(), "Bills"],
  ];
  return `
    <nav class="bottom-nav" aria-label="Primary">
      ${views
        .map(
          ([view, icon, label]) => `
          <button class="${activeView === view ? "active" : ""}" data-view="${view}" aria-label="${label}">
            ${icon}<span>${label}</span>
          </button>
        `,
        )
        .join("")}
    </nav>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      render();
    });
  });

  app.querySelector("#income")?.addEventListener("change", async (event) => {
    state.manualIncome = Number.parseFloat(event.target.value.replace(",", ".")) || 0;
    await persist();
  });

  app.querySelector("#statement-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    draftImport = { ...(await parseStatementFile(file)), fileName: file.name };
    render();
  });

  app.querySelector("#demo-import")?.addEventListener("click", () => {
    const sample = [
      "Date,Description,Debit,Credit,Balance",
      "05/01/2026,Netflix,15.99,,1200",
      "05/02/2026,Netflix,15.99,,1184",
      "06/03/2026,Netflix,16.49,,1168",
      "08/03/2026,Albert Heijn,42.10,,1125",
      "10/03/2026,NS Reizigers,12.50,,1112",
      "25/03/2026,Salary,,2600,3712",
    ].join("\n");
    import("./importers.js").then(({ parseCsvStatement }) => {
      draftImport = { ...parseCsvStatement(sample), fileName: "sample-statement.csv" };
      render();
    });
  });

  app.querySelectorAll("[data-import-field]").forEach((field) => {
    field.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      const key = event.target.dataset.importField;
      const value = key === "amount" ? Number.parseFloat(event.target.value.replace(",", ".")) || 0 : event.target.value;
      draftImport.transactions[index][key] = value;
    });
  });

  app.querySelector("#save-import")?.addEventListener("click", async () => {
    const importId = `batch-${Date.now()}`;
    const transactions = draftImport.transactions.map((transaction, index) => ({
      ...transaction,
      id: `${importId}-${index}`,
      importId,
    }));
    state.transactions = [...state.transactions, ...transactions];
    state.importBatches = [...state.importBatches, { id: importId, fileName: draftImport.fileName, count: transactions.length, savedAt: new Date().toISOString() }];
    draftImport = { transactions: [], warnings: [], fileName: "" };
    activeView = "home";
    await persist();
  });

  app.querySelectorAll("[data-dismiss-bill]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.dismissedBills = [...new Set([...state.dismissedBills, button.dataset.dismissBill])];
      await persist();
    });
  });

  app.querySelector("#api-key")?.addEventListener("change", async (event) => {
    state.aiSettings.apiKey = event.target.value.trim();
    state.aiSettings.enabled = Boolean(state.aiSettings.apiKey);
    await persist();
  });

  app.querySelector("#ai-enabled")?.addEventListener("change", async (event) => {
    state.aiSettings.enabled = event.target.checked;
    await persist();
  });

  app.querySelector("#ask-ai")?.addEventListener("click", async () => {
    busy = true;
    render();
    try {
      state.aiSettings.lastSummary = await requestAiAssist({ apiKey: state.aiSettings.apiKey, payload: aiPreview });
    } catch (error) {
      state.aiSettings.lastSummary = error.message;
    } finally {
      busy = false;
      await persist();
    }
  });
}

async function persist() {
  await saveState(state);
  render();
}

function emptyState(text) {
  return `<p class="empty-state">${escapeHtml(text)}</p>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function iconHome() {
  return `<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z"/></svg>`;
}

function iconUpload() {
  return `<svg viewBox="0 0 24 24"><path d="M12 3 7 8h3v7h4V8h3l-5-5Z"/><path d="M5 19h14v2H5z"/></svg>`;
}

function iconGrid() {
  return `<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>`;
}

function iconRepeat() {
  return `<svg viewBox="0 0 24 24"><path d="M7 7h9l-2-2 1.4-1.4L20 8l-4.6 4.4L14 11l2-2H7a3 3 0 0 0 0 6h1v2H7A5 5 0 0 1 7 7Zm10 10H8l2 2-1.4 1.4L4 16l4.6-4.4L10 13l-2 2h9a3 3 0 0 0 0-6h-1V7h1a5 5 0 0 1 0 10Z"/></svg>`;
}

function iconSpark() {
  return `<svg viewBox="0 0 24 24"><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Zm6 13 .9 3.1L22 19l-3.1.9L18 23l-.9-3.1L14 19l3.1-.9L18 15Z"/></svg>`;
}
