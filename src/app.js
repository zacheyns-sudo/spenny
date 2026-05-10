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

// ── Categories ────────────────────────────────────────────

const CATEGORY_GROUPS = {
  Essentials: ["Fixed Bills", "Groceries", "Transport"],
  Lifestyle: ["Eating Out", "Going Out", "Shopping", "Fitness", "Travel"],
  Growth: ["Education", "Savings"],
  "Financial Health": ["Transfers", "Miscellaneous"],
};

const GROUP_COLORS = {
  Essentials: "#6366f1",
  Lifestyle: "#818cf8",
  Growth: "#6ee7b7",
  "Financial Health": "#6b7280",
};

const ALL_CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

// ── App state ─────────────────────────────────────────────

const app = document.querySelector("#app");
let state = await loadState();
let activeView = "home";
let showAddBill = false;
let addBillDraft = { name: "", amount: "", frequency: "monthly", paymentDay: "", category: "Fixed Bills" };
let showQuickAdd = false;
let quickAddDraft = { merchant: "", amount: "", category: "Eating Out", date: todayDate() };
let draftImport = { transactions: [], warnings: [], fileName: "" };
let aiPreview = null;
let busy = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();

// ── Helpers ───────────────────────────────────────────────

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function categoryGroup(category) {
  for (const [group, cats] of Object.entries(CATEGORY_GROUPS)) {
    if (cats.includes(category)) return group;
  }
  return "Financial Health";
}

function manualBillsToRecurring(bills = []) {
  return bills.map((bill) => {
    let monthly = Math.abs(Number(bill.amount) || 0);
    if (bill.frequency === "weekly") monthly *= 365 / 12 / 7;
    if (bill.frequency === "yearly") monthly /= 12;
    return {
      merchantKey: bill.id,
      merchant: bill.name,
      averageAmount: -monthly,
      cadence: bill.frequency || "monthly",
      occurrences: 1,
      category: bill.category,
      nextExpectedDay: Number(bill.paymentDay) || 1,
    };
  });
}

function computeWeekDelta(transactions) {
  const now = new Date();
  const dayMs = 86_400_000;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const lastWeekStart = new Date(weekStart.getTime() - 7 * dayMs);

  let thisWeek = 0;
  let lastWeek = 0;
  for (const t of transactions) {
    if (Number(t.amount) >= 0) continue;
    const d = new Date(t.date);
    const abs = Math.abs(Number(t.amount));
    if (d >= weekStart) thisWeek += abs;
    else if (d >= lastWeekStart && d < weekStart) lastWeek += abs;
  }
  return { thisWeek, lastWeek, delta: thisWeek - lastWeek };
}

function derived() {
  const manualAsRecurring = manualBillsToRecurring(state.manualBills);
  const manualNames = new Set(state.manualBills.map((b) => b.name.toLowerCase()));
  const detectedAll = detectRecurringBills(state.transactions);
  const detectedBills = detectedAll.filter(
    (b) => !state.dismissedBills.includes(b.merchantKey) && !manualNames.has(b.merchant.toLowerCase()),
  );

  const plan = calculateWeeklyPlan({
    monthlyIncome: state.manualIncome,
    recurringBills: [...manualAsRecurring, ...detectedBills],
    month: currentMonthKey(),
  });

  const habits = summarizeSpendingHabits(state.transactions, [...manualAsRecurring, ...detectedBills]);
  const week = computeWeekDelta(state.transactions);

  return { detectedBills, plan, habits, week };
}

// ── Render ────────────────────────────────────────────────

function render() {
  const data = derived();
  app.innerHTML = `
    <main class="phone-frame">
      <section class="top-surface">
        ${renderAppBar()}
        ${activeView === "home" ? renderHero(data) : `<div class="view-title">${viewLabel(activeView)}</div>`}
      </section>
      <section class="content-surface">
        ${renderView(activeView, data)}
      </section>
      ${renderNav()}
    </main>
  `;
  bindEvents();
}

function viewLabel(view) {
  return { bills: "Bills", spending: "Spending", import: "Import", ai: "AI Assist" }[view] ?? "";
}

function renderAppBar() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `
    <div class="app-bar">
      <div class="app-bar-left">
        <div class="avatar">S</div>
        <span class="greeting">${greeting}</span>
      </div>
      <button class="ai-button" data-view="ai">${iconSpark()}<span>AI assist</span></button>
    </div>
  `;
}

function renderHero({ plan, week }) {
  const isShort = plan.monthlyFlexible < 0;
  const value = isShort ? plan.monthlyFlexible : plan.weeklyAllowance;
  const label = isShort ? "Monthly gap" : "Safe weekly spend";

  let deltaHtml = `<div class="hero-sub">${plan.fullWeeks} full weeks · final ${plan.remainingDays} days ${formatEuro(plan.finalPeriodAllowance)}</div>`;
  if (state.transactions.length > 0 && Math.abs(week.delta) > 0.5) {
    const cls = week.delta > 0 ? "delta-up" : "delta-down";
    const arrow = week.delta > 0 ? "↑" : "↓";
    deltaHtml = `<div class="hero-sub ${cls}">${arrow} ${formatEuro(Math.abs(week.delta))} vs last week</div>`;
  }

  return `
    <div>
      <div class="hero-label">${label}</div>
      <div class="hero-number">${formatEuro(value)}</div>
      ${deltaHtml}
      <div class="metric-strip">
        <div class="metric-card">
          <div class="mc-label">Income</div>
          <div class="mc-value">${formatEuro(plan.monthlyIncome)}</div>
        </div>
        <div class="metric-card hl">
          <div class="mc-label">Flexible</div>
          <div class="mc-value">${formatEuro(plan.monthlyFlexible)}</div>
        </div>
        <div class="metric-card">
          <div class="mc-label">Bills</div>
          <div class="mc-value">${formatEuro(plan.monthlyBills)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderView(view, data) {
  if (view === "bills") return renderBills(data);
  if (view === "spending") return renderSpending(data);
  if (view === "import") return renderImport();
  if (view === "ai") return renderAi(data);
  return renderHome(data);
}

// ── Home ──────────────────────────────────────────────────

function renderHome({ habits, detectedBills }) {
  const previewBills = state.manualBills.slice(0, 3);
  const previewCats = habits.categories.slice(0, 2);
  const hasBills = previewBills.length > 0 || detectedBills.length > 0;

  return `
    <div class="panel">
      <div class="panel-header"><span class="panel-label">Monthly income</span></div>
      <div class="income-row">
        <span class="income-prefix">€</span>
        <input class="income-input" id="income" inputmode="decimal"
          value="${state.manualIncome || ""}" placeholder="0" />
      </div>
    </div>

    <div class="action-grid">
      <button class="action-btn primary" data-view="bills">${iconPlus()} Add bill</button>
      <button class="action-btn" id="home-quick-add">${iconPen()} Log expense</button>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-label">Recurring bills</span>
        ${hasBills ? `<button class="panel-action" data-view="bills">View all</button>` : ""}
      </div>
      ${previewBills.length
        ? previewBills.map((b) => renderManualBillRow(b, false)).join("")
        : detectedBills.length
          ? detectedBills.slice(0, 3).map(renderDetectedBillRow).join("")
          : emptyState("Add your first recurring bill to calculate your weekly budget.")}
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-label">Spending habits</span>
        ${previewCats.length ? `<button class="panel-action" data-view="spending">See all</button>` : ""}
      </div>
      ${previewCats.length
        ? renderSimpleBars(previewCats)
        : emptyState("Log expenses to start tracking where your money goes.")}
    </div>
  `;
}

// ── Bills ─────────────────────────────────────────────────

function renderBills({ detectedBills, plan }) {
  return `
    <div class="panel">
      <div class="panel-header"><span class="panel-label">Monthly total</span></div>
      <div class="bills-total">${formatEuro(plan.monthlyBills)}</div>
      <div class="bills-total-sub">${state.manualBills.length} manual · ${detectedBills.length} detected</div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-label">Your bills</span>
        <button class="panel-action" id="toggle-add-bill">${showAddBill ? "Cancel" : "+ Add"}</button>
      </div>
      ${showAddBill ? renderAddBillForm() : ""}
      ${state.manualBills.length
        ? state.manualBills.map((b) => renderManualBillRow(b, true)).join("")
        : !showAddBill ? emptyState("No bills added yet. Tap + Add to get started.") : ""}
    </div>

    ${detectedBills.length ? `
    <div class="panel">
      <div class="panel-header"><span class="panel-label">Detected from import</span></div>
      ${detectedBills.map(renderDetectedBillRow).join("")}
    </div>
    ` : ""}
  `;
}

function renderManualBillRow(bill, deletable) {
  const suffix = bill.frequency === "weekly" ? "/wk" : bill.frequency === "yearly" ? "/yr" : "/mo";
  return `
    <article class="bill-row">
      <div class="bill-dot">${escapeHtml(bill.name.charAt(0).toUpperCase())}</div>
      <div class="bill-info">
        <div class="bill-name">${escapeHtml(bill.name)}</div>
        <div class="bill-meta">${escapeHtml(bill.category)} · day ${bill.paymentDay || "—"}</div>
      </div>
      <div class="bill-amount">${formatEuro(bill.amount)}${suffix}</div>
      ${deletable ? `<button class="icon-btn" data-delete-bill="${escapeHtml(bill.id)}" aria-label="Delete ${escapeHtml(bill.name)}">×</button>` : ""}
    </article>
  `;
}

function renderDetectedBillRow(bill) {
  return `
    <article class="bill-row">
      <div class="bill-dot dim">${escapeHtml(bill.merchant.charAt(0))}</div>
      <div class="bill-info">
        <div class="bill-name">${escapeHtml(bill.merchant)}</div>
        <div class="bill-meta">${bill.cadence} · around day ${bill.nextExpectedDay}</div>
      </div>
      <div class="bill-amount">${formatEuro(Math.abs(bill.averageAmount))}/mo</div>
      <button class="icon-btn" data-dismiss-bill="${escapeHtml(bill.merchantKey)}" aria-label="Dismiss ${escapeHtml(bill.merchant)}">×</button>
    </article>
  `;
}

function renderAddBillForm() {
  const freqOptions = ["monthly", "weekly", "yearly"].map(
    (f) => `<option value="${f}" ${addBillDraft.frequency === f ? "selected" : ""}>${f.charAt(0).toUpperCase() + f.slice(1)}</option>`,
  );
  const catOptions = ALL_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}" ${addBillDraft.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`,
  );
  return `
    <div class="add-form">
      <div class="form-field full">
        <label class="form-label">Bill name</label>
        <input class="form-input" id="bill-name" placeholder="Netflix, Rent, Gym…" value="${escapeHtml(addBillDraft.name)}" />
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Amount (€)</label>
          <input class="form-input" id="bill-amount" inputmode="decimal" placeholder="0.00" value="${escapeHtml(String(addBillDraft.amount))}" />
        </div>
        <div class="form-field">
          <label class="form-label">Frequency</label>
          <select class="form-select" id="bill-frequency">${freqOptions.join("")}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Payment day</label>
          <input class="form-input" id="bill-day" inputmode="numeric" placeholder="1 – 31" value="${escapeHtml(String(addBillDraft.paymentDay))}" />
        </div>
        <div class="form-field">
          <label class="form-label">Category</label>
          <select class="form-select" id="bill-category">${catOptions.join("")}</select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-ghost" id="cancel-add-bill">Cancel</button>
        <button class="btn-primary" id="save-add-bill">Save bill</button>
      </div>
    </div>
  `;
}

// ── Spending ──────────────────────────────────────────────

function renderSpending({ habits, week }) {
  const grand = habits.totalFlexibleSpend;

  const groupTotals = Object.fromEntries(Object.keys(CATEGORY_GROUPS).map((g) => [g, { total: 0, count: 0 }]));
  const catsByGroup = Object.fromEntries(Object.keys(CATEGORY_GROUPS).map((g) => [g, []]));

  for (const cat of habits.categories) {
    const g = categoryGroup(cat.category);
    groupTotals[g].total += cat.total;
    groupTotals[g].count += cat.count;
    catsByGroup[g].push(cat);
  }

  return `
    <div class="week-hero">
      <div>
        <div class="hero-label" style="margin-bottom:5px">This week</div>
        <div class="week-number">${formatEuro(week.thisWeek)}</div>
        ${week.lastWeek > 0.5
          ? `<div class="hero-sub ${week.delta > 0 ? "delta-up" : "delta-down"}">${week.delta > 0 ? "↑" : "↓"} ${formatEuro(Math.abs(week.delta))} vs last week</div>`
          : `<div class="hero-sub">No prior week to compare</div>`}
      </div>
      <button class="action-btn primary sm" id="show-quick-add">${iconPlus()} Add</button>
    </div>

    ${showQuickAdd ? renderQuickAddForm() : ""}

    ${grand > 0 ? `
      <div class="group-grid">
        ${Object.entries(CATEGORY_GROUPS).map(([group]) => {
          const gt = groupTotals[group];
          const pct = grand > 0 ? Math.round((gt.total / grand) * 100) : 0;
          const isGrowth = group === "Growth";
          const valueColor = isGrowth && gt.total > 0 ? "var(--growth)" : "var(--text-1)";
          const savingsRate = isGrowth && state.manualIncome > 0
            ? ` · ${Math.round((gt.total / state.manualIncome) * 100)}% saved`
            : "";
          return `
            <div class="group-card">
              <div class="gc-label">${group.toUpperCase()}</div>
              <div class="gc-value" style="color:${valueColor}">${formatEuro(gt.total)}</div>
              <div class="gc-bar-track">
                <div class="gc-bar-fill" style="width:${pct}%;background:${GROUP_COLORS[group]}"></div>
              </div>
              <div class="gc-pct">${pct}%${savingsRate}</div>
            </div>
          `;
        }).join("")}
      </div>

      <div class="breakdown-heading">Breakdown</div>

      ${Object.entries(CATEGORY_GROUPS).map(([group]) => {
        const cats = catsByGroup[group].filter((c) => c.total > 0);
        if (!cats.length) return "";
        return `
          <div class="bar-group">
            <div class="bar-group-label" style="color:${GROUP_COLORS[group]}">${group}</div>
            ${cats.map((cat) => `
              <div class="bar-row">
                <div class="bar-meta">
                  <span>${escapeHtml(cat.category)}</span>
                  <small>${formatEuro(cat.total)} · ${cat.count}×</small>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${Math.min(100, cat.share || 0)}%;background:${GROUP_COLORS[group]}"></div>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }).join("")}
    ` : emptyState("Log your first expense to start tracking spending habits.")}
  `;
}

function renderQuickAddForm() {
  const catOptions = ALL_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}" ${quickAddDraft.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`,
  );
  return `
    <div class="add-form" style="margin-bottom:14px">
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Where / what</label>
          <input class="form-input" id="qa-merchant" placeholder="Coffee, Groceries…" value="${escapeHtml(quickAddDraft.merchant)}" />
        </div>
        <div class="form-field">
          <label class="form-label">Amount (€)</label>
          <input class="form-input" id="qa-amount" inputmode="decimal" placeholder="0.00" value="${escapeHtml(String(quickAddDraft.amount))}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Category</label>
          <select class="form-select" id="qa-category">${catOptions.join("")}</select>
        </div>
        <div class="form-field">
          <label class="form-label">Date</label>
          <input class="form-input" id="qa-date" type="date" value="${escapeHtml(quickAddDraft.date)}" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-ghost" id="cancel-quick-add">Cancel</button>
        <button class="btn-primary" id="save-quick-add">Save</button>
      </div>
    </div>
  `;
}

function renderSimpleBars(categories) {
  return categories.map((cat) => `
    <div class="bar-row">
      <div class="bar-meta">
        <span>${escapeHtml(cat.category)}</span>
        <small>${formatEuro(cat.total)} · ${cat.count}×</small>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.min(100, cat.share || 0)}%;background:${GROUP_COLORS[categoryGroup(cat.category)] || "var(--accent)"}"></div>
      </div>
    </div>
  `).join("");
}

// ── Import ────────────────────────────────────────────────

function renderImport() {
  return `
    <div class="panel">
      <div class="panel-header"><span class="panel-label">Import statement</span></div>
      <p style="font-size:12px;color:var(--text-3);margin-bottom:12px">Files are parsed locally in your browser. Nothing leaves your device.</p>
      <label class="drop-zone">
        ${iconUpload()}
        <span>Choose CSV or PDF</span>
        <small>Statement import for bulk transaction review</small>
        <input id="statement-file" type="file" accept=".csv,.pdf,text/csv,application/pdf" style="display:none" />
      </label>
      <div class="privacy-badge">${iconShield()} Local-first — your data stays on this device</div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-label">Review transactions</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">${draftImport.fileName || "No file selected"}</div>
        </div>
        <button class="btn-primary" id="save-import" ${draftImport.transactions.length ? "" : "disabled"} style="padding:8px 14px;font-size:12px">Save</button>
      </div>
      ${draftImport.warnings.map((w) => `<div class="warning-banner">${escapeHtml(w)}</div>`).join("")}
      ${draftImport.transactions.length ? renderReviewTable() : emptyState("Upload a statement to review transactions before saving.")}
    </div>
  `;
}

function renderReviewTable() {
  return `
    <div class="review-table">
      ${draftImport.transactions.map((t, i) => {
        const catOptions = ALL_CATEGORIES.map(
          (c) => `<option ${c === t.category ? "selected" : ""}>${escapeHtml(c)}</option>`,
        );
        return `
          <div class="review-row">
            <input data-import-field="date" data-index="${i}" value="${escapeHtml(t.date)}" aria-label="Date" />
            <input data-import-field="merchant" data-index="${i}" value="${escapeHtml(t.merchant)}" aria-label="Merchant" />
            <input data-import-field="amount" data-index="${i}" inputmode="decimal" value="${t.amount}" aria-label="Amount" />
            <select data-import-field="category" data-index="${i}" aria-label="Category">${catOptions.join("")}</select>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ── AI ────────────────────────────────────────────────────

function renderAi({ habits }) {
  const configured = Boolean(state.aiSettings.apiKey);
  const enabled = state.aiSettings.enabled && configured;
  aiPreview = buildAiPayload({
    purpose: "summarize",
    transactions: state.transactions.filter((t) => t.amount < 0).slice(-12),
    habits,
  });

  return `
    <div class="panel">
      <div class="ai-toggle-row">
        <div>
          <div class="panel-label">AI assist</div>
          <div style="font-size:13px;color:var(--text-2);margin-top:4px">${enabled ? "Active" : configured ? "Paused" : "Not configured"}</div>
        </div>
        <label class="switch">
          <input id="ai-enabled" type="checkbox" ${enabled ? "checked" : ""} ${configured ? "" : "disabled"} />
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="form-field" style="margin-bottom:12px">
        <label class="form-label">OpenAI API key</label>
        <input id="api-key" class="form-input" type="password" value="${escapeHtml(state.aiSettings.apiKey)}" placeholder="sk-…" autocomplete="off" />
      </div>
      <div class="privacy-badge">${iconShield()} Only the redacted preview below is ever sent</div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-label">Approval preview</span>
        <button class="btn-primary" id="ask-ai" ${enabled && state.transactions.length ? "" : "disabled"} style="padding:7px 13px;font-size:12px">${busy ? "Asking…" : "Send"}</button>
      </div>
      <pre class="payload-preview">${escapeHtml(JSON.stringify(aiPreview, null, 2))}</pre>
    </div>

    <div class="panel">
      <div class="panel-label" style="margin-bottom:10px">Last summary</div>
      <p style="font-size:13px;color:var(--text-2);line-height:1.6">${escapeHtml(state.aiSettings.lastSummary || "No AI summary yet.")}</p>
    </div>
  `;
}

// ── Nav ───────────────────────────────────────────────────

function renderNav() {
  const tabs = [
    ["home", iconHome(), "Home"],
    ["bills", iconRepeat(), "Bills"],
    ["spending", iconGrid(), "Spending"],
    ["import", iconUpload(), "Import"],
  ];
  return `
    <nav class="bottom-nav" aria-label="Primary">
      ${tabs.map(([view, icon, label]) => `
        <button class="nav-btn ${activeView === view ? "active" : ""}" data-view="${view}" aria-label="${label}">
          ${icon}<span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

// ── Events ────────────────────────────────────────────────

function bindEvents() {
  app.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeView = btn.dataset.view;
      showAddBill = false;
      showQuickAdd = false;
      render();
    });
  });

  app.querySelector("#income")?.addEventListener("change", async (e) => {
    state.manualIncome = Number.parseFloat(e.target.value.replace(",", ".")) || 0;
    await persist();
  });

  app.querySelector("#home-quick-add")?.addEventListener("click", () => {
    activeView = "spending";
    showQuickAdd = true;
    render();
  });

  app.querySelector("#toggle-add-bill")?.addEventListener("click", () => {
    showAddBill = !showAddBill;
    render();
  });

  app.querySelector("#bill-name")?.addEventListener("input", (e) => { addBillDraft.name = e.target.value; });
  app.querySelector("#bill-amount")?.addEventListener("input", (e) => { addBillDraft.amount = e.target.value; });
  app.querySelector("#bill-frequency")?.addEventListener("change", (e) => { addBillDraft.frequency = e.target.value; });
  app.querySelector("#bill-day")?.addEventListener("input", (e) => { addBillDraft.paymentDay = e.target.value; });
  app.querySelector("#bill-category")?.addEventListener("change", (e) => { addBillDraft.category = e.target.value; });

  app.querySelector("#save-add-bill")?.addEventListener("click", async () => {
    const name = addBillDraft.name.trim();
    const amount = Number.parseFloat(String(addBillDraft.amount).replace(",", ".")) || 0;
    if (!name || amount <= 0) return;
    state.manualBills = [
      ...state.manualBills,
      {
        id: `bill-${Date.now()}`,
        name,
        amount,
        frequency: addBillDraft.frequency,
        paymentDay: Number(addBillDraft.paymentDay) || 1,
        category: addBillDraft.category,
      },
    ];
    addBillDraft = { name: "", amount: "", frequency: "monthly", paymentDay: "", category: "Fixed Bills" };
    showAddBill = false;
    await persist();
  });

  app.querySelector("#cancel-add-bill")?.addEventListener("click", () => {
    showAddBill = false;
    addBillDraft = { name: "", amount: "", frequency: "monthly", paymentDay: "", category: "Fixed Bills" };
    render();
  });

  app.querySelectorAll("[data-delete-bill]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.manualBills = state.manualBills.filter((b) => b.id !== btn.dataset.deleteBill);
      await persist();
    });
  });

  app.querySelectorAll("[data-dismiss-bill]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.dismissedBills = [...new Set([...state.dismissedBills, btn.dataset.dismissBill])];
      await persist();
    });
  });

  app.querySelector("#show-quick-add")?.addEventListener("click", () => {
    showQuickAdd = !showQuickAdd;
    render();
  });

  app.querySelector("#qa-merchant")?.addEventListener("input", (e) => { quickAddDraft.merchant = e.target.value; });
  app.querySelector("#qa-amount")?.addEventListener("input", (e) => { quickAddDraft.amount = e.target.value; });
  app.querySelector("#qa-category")?.addEventListener("change", (e) => { quickAddDraft.category = e.target.value; });
  app.querySelector("#qa-date")?.addEventListener("change", (e) => { quickAddDraft.date = e.target.value; });

  app.querySelector("#save-quick-add")?.addEventListener("click", async () => {
    const merchant = quickAddDraft.merchant.trim();
    const amount = Number.parseFloat(String(quickAddDraft.amount).replace(",", ".")) || 0;
    if (!merchant || amount <= 0) return;
    state.transactions = [
      ...state.transactions,
      {
        id: `manual-${Date.now()}`,
        date: quickAddDraft.date || todayDate(),
        merchant,
        amount: -Math.abs(amount),
        category: quickAddDraft.category,
        source: "manual",
        confidence: "high",
        importId: "manual",
      },
    ];
    quickAddDraft = { merchant: "", amount: "", category: "Eating Out", date: todayDate() };
    showQuickAdd = false;
    await persist();
  });

  app.querySelector("#cancel-quick-add")?.addEventListener("click", () => {
    showQuickAdd = false;
    quickAddDraft = { merchant: "", amount: "", category: "Eating Out", date: todayDate() };
    render();
  });

  app.querySelector("#statement-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    draftImport = { ...(await parseStatementFile(file)), fileName: file.name };
    render();
  });

  app.querySelectorAll("[data-import-field]").forEach((field) => {
    field.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.index);
      const key = e.target.dataset.importField;
      draftImport.transactions[idx][key] =
        key === "amount" ? Number.parseFloat(e.target.value.replace(",", ".")) || 0 : e.target.value;
    });
  });

  app.querySelector("#save-import")?.addEventListener("click", async () => {
    const importId = `batch-${Date.now()}`;
    const transactions = draftImport.transactions.map((t, i) => ({ ...t, id: `${importId}-${i}`, importId }));
    state.transactions = [...state.transactions, ...transactions];
    state.importBatches = [
      ...state.importBatches,
      { id: importId, fileName: draftImport.fileName, count: transactions.length, savedAt: new Date().toISOString() },
    ];
    draftImport = { transactions: [], warnings: [], fileName: "" };
    activeView = "home";
    await persist();
  });

  app.querySelector("#api-key")?.addEventListener("change", async (e) => {
    state.aiSettings.apiKey = e.target.value.trim();
    state.aiSettings.enabled = Boolean(state.aiSettings.apiKey);
    await persist();
  });

  app.querySelector("#ai-enabled")?.addEventListener("change", async (e) => {
    state.aiSettings.enabled = e.target.checked;
    await persist();
  });

  app.querySelector("#ask-ai")?.addEventListener("click", async () => {
    busy = true;
    render();
    try {
      state.aiSettings.lastSummary = await requestAiAssist({ apiKey: state.aiSettings.apiKey, payload: aiPreview });
    } catch (err) {
      state.aiSettings.lastSummary = err.message;
    } finally {
      busy = false;
      await persist();
    }
  });
}

// ── Utilities ─────────────────────────────────────────────

async function persist() {
  await saveState(state);
  render();
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Icons ─────────────────────────────────────────────────

function iconHome() {
  return `<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z"/></svg>`;
}

function iconRepeat() {
  return `<svg viewBox="0 0 24 24"><path d="M7 7h9l-2-2 1.4-1.4L20 8l-4.6 4.4L14 11l2-2H7a3 3 0 0 0 0 6h1v2H7A5 5 0 0 1 7 7Zm10 10H8l2 2-1.4 1.4L4 16l4.6-4.4L10 13l-2 2h9a3 3 0 0 0 0-6h-1V7h1a5 5 0 0 1 0 10Z"/></svg>`;
}

function iconGrid() {
  return `<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>`;
}

function iconUpload() {
  return `<svg viewBox="0 0 24 24"><path d="M12 3 7 8h3v7h4V8h3l-5-5Z"/><path d="M5 19h14v2H5z"/></svg>`;
}

function iconSpark() {
  return `<svg viewBox="0 0 24 24"><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Zm6 13 .9 3.1L22 19l-3.1.9L18 23l-.9-3.1L14 19l3.1-.9L18 15Z"/></svg>`;
}

function iconPlus() {
  return `<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>`;
}

function iconPen() {
  return `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>`;
}

function iconShield() {
  return `<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3Zm-2 11-2-2 1.4-1.4L10 10.2l4.6-4.6L16 7l-6 6Z"/></svg>`;
}
