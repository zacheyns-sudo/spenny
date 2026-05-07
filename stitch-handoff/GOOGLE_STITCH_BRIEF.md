# Google Stitch Brief: Redesign Spenny PWA UI

Use this brief to redesign the frontend/UI for **Spenny**, a private iPhone-first weekly spend helper. The backend/core logic already works well; preserve the behavior and data contracts below while replacing the current visual design.

## Product Intent

Spenny helps one person understand:

- How much monthly income they manually enter.
- Which recurring bills are detected from uploaded bank statements.
- How much money is left after bills.
- How much can be spent each full week, plus the final partial days of the month.
- Where flexible spending tends to go by category and merchant.

The app is **not** a bank, investment advisor, or public finance platform. It is a private local-first helper.

## Visual Direction

Create a premium iPhone finance app that feels more polished than the current implementation.

Design target:

- Premium banking aesthetic.
- Dark, confident app shell.
- Clean white or near-white financial surfaces.
- Strong hero number for weekly spend.
- Elegant transaction rows.
- Smooth, app-like navigation.
- Refined typography and spacing.
- No generic dashboard clutter.
- No marketing landing page.
- No overly playful budget-coach tone.

The attached inspiration had:

- Black banking shell.
- White transaction sheet.
- Large balance/amount typography.
- Rounded iPhone-native panels.
- Minimal transaction detail screens.
- Floating bottom navigation.

Improve on that rather than copying it exactly.

## Technical Context

This is currently a dependency-free static PWA:

- Entry: `index.html`
- Main UI: `src/app.js`
- Styling: `src/styles.css`
- Finance logic: `src/finance.js`
- Import parsing: `src/importers.js`
- AI redaction/request helpers: `src/ai.js`
- Local storage: `src/storage.js`
- PWA: `manifest.webmanifest`, `sw.js`, `assets/icon.svg`

The redesign should preserve the existing JavaScript modules and replace the UI layer/styling as needed.

Recommended approach:

- Keep `src/finance.js`, `src/importers.js`, `src/ai.js`, and `src/storage.js` intact.
- Redesign `src/app.js` render templates and `src/styles.css`.
- Keep the app local-first and installable as a PWA.

## Core Data Shape

The app state is stored locally in IndexedDB:

```js
{
  manualIncome: 2600,
  transactions: [
    {
      id: "batch-123-0",
      date: "2026-03-05",
      merchant: "Netflix",
      amount: -15.99,
      category: "Subscriptions",
      source: "csv",
      confidence: "high",
      importId: "batch-123"
    }
  ],
  dismissedBills: ["netflix"],
  importBatches: [
    {
      id: "batch-123",
      fileName: "statement.csv",
      count: 24,
      savedAt: "2026-05-07T17:00:00.000Z"
    }
  ],
  categoryRules: {},
  aiSettings: {
    enabled: false,
    apiKey: "",
    lastSummary: ""
  }
}
```

## Derived Data Available To UI

The current `derived()` function in `src/app.js` creates:

```js
{
  bills,
  plan,
  habits
}
```

Where:

```js
plan = {
  month: "2026-05",
  daysInMonth: 31,
  fullWeeks: 4,
  remainingDays: 3,
  monthlyIncome: 2600,
  monthlyBills: 16.16,
  monthlyFlexible: 2583.84,
  dailyAllowance: 83.35,
  weeklyAllowance: 583.45,
  finalPeriodAllowance: 250.05
}
```

```js
bills = [
  {
    merchantKey: "netflix",
    merchant: "Netflix",
    averageAmount: -16.16,
    cadence: "monthly",
    occurrences: 3,
    category: "Subscriptions",
    nextExpectedDay: 5
  }
]
```

```js
habits = {
  totalFlexibleSpend: 54.6,
  categories: [
    { category: "Groceries", total: 42.1, count: 1, share: 77 },
    { category: "Transport", total: 12.5, count: 1, share: 23 }
  ],
  merchants: [
    { merchant: "Albert Heijn", total: 42.1, count: 1, share: 77 },
    { merchant: "NS Reizigers", total: 12.5, count: 1, share: 23 }
  ]
}
```

## Required Screens

### 1. Home / Weekly Spend

Primary screen. Must include:

- Hero value: safe weekly spend.
- Manual monthly income input.
- Monthly bills total.
- Monthly flexible amount.
- Full-week allowance.
- Final partial-days allowance.
- Shortcut to import statement.
- Preview of recurring bills.
- Preview of spending habits.

Tone: clear and calming. The user should immediately know what they can spend this week after bills.

Important formula:

```txt
monthly income - recurring monthly bills = monthly flexible amount
monthly flexible amount / days in month = daily allowance
daily allowance * 7 = full-week allowance
daily allowance * remaining days = final partial-period allowance
```

### 2. Import Wizard

Simple two-step flow:

1. Upload CSV/PDF statement.
2. Review extracted transactions before saving.

Must include:

- File picker for `.csv` and `.pdf`.
- Clear privacy copy: files are parsed locally in the browser.
- Review list/table with editable date, merchant, amount, and category.
- Warnings for best-effort PDF parsing.
- Save import button.
- Optional sample import button can stay for demo/testing.

Categories:

```txt
Groceries, Transport, Subscriptions, Housing, Utilities, Dining, Shopping, Income, Uncategorized
```

### 3. Bills

Must include:

- Total recurring monthly bills.
- List of detected monthly bills.
- Merchant, category/cadence, approximate payment day, amount.
- Ability to dismiss a detected bill.

### 4. Spending Habits

Must include:

- Total flexible spend found.
- Category breakdown.
- Top merchants.
- Visual bars or compact chart, but keep it mobile-readable.

### 5. AI Assist

Must include:

- API key input.
- On/off state.
- Approval preview showing exactly what redacted payload would be sent.
- Button to approve and summarize.
- Last AI summary.

Privacy requirements:

- AI assist is optional.
- User provides their own API key.
- Raw statement files are never sent.
- IBANs, card numbers, account names, exact account balances, and full transaction history are not sent.
- The approval preview must remain visible before sending.

## Interaction Requirements

Keep these existing behaviors:

- Changing monthly income updates the weekly spend calculation.
- Importing transactions updates recurring bill detection.
- Saving an import returns the user to Home.
- Dismissing a bill removes it from calculated monthly bills.
- AI settings are stored locally.
- AI summary request is disabled until API key is configured and there are transactions.

## Sample Demo Data

Use this in mockups:

```js
manualIncome = 2600

transactions = [
  { date: "2026-01-05", merchant: "Netflix", amount: -15.99, category: "Subscriptions" },
  { date: "2026-02-05", merchant: "Netflix", amount: -15.99, category: "Subscriptions" },
  { date: "2026-03-06", merchant: "Netflix", amount: -16.49, category: "Subscriptions" },
  { date: "2026-03-08", merchant: "Albert Heijn", amount: -42.10, category: "Groceries" },
  { date: "2026-03-10", merchant: "NS Reizigers", amount: -12.50, category: "Transport" },
  { date: "2026-03-25", merchant: "Salary", amount: 2600, category: "Income" }
]
```

Expected derived highlights:

```txt
Monthly income: €2,600.00
Monthly recurring bills: about €16.16
Safe weekly spend: about €583.45
Final 3 days: about €250.05
Top habits: Groceries, Transport
Detected recurring bill: Netflix
```

## Copy Style

Use short labels:

- Safe weekly spend
- Monthly income
- Bills this month
- Flexible after bills
- Final days
- Import statement
- Review transactions
- Recurring bills
- Spending habits
- AI assist
- Approval preview

Avoid:

- Long explanations in the main UI.
- Financial advice language.
- “You should” coaching.
- Marketing copy.

## Suggested UI Structure

Use an iPhone-first layout:

- Top dark hero area with app name and weekly spend.
- White bottom sheet for content.
- Floating bottom nav with Home, Import, Habits, Bills.
- AI/settings accessible from top-right.
- Use compact cards only for repeated items or functional panels.
- Avoid card-inside-card layouts.
- Make all controls comfortable for touch.
- Ensure text never overlaps on 390px-wide screens.

## Existing Backend Hooks To Preserve

From `src/finance.js`:

```js
calculateWeeklyPlan({ monthlyIncome, recurringBills, month })
detectRecurringBills(transactions)
summarizeSpendingHabits(transactions, recurringBills)
formatEuro(value)
categorizeMerchant(merchant)
merchantKey(merchant)
```

From `src/importers.js`:

```js
parseStatementFile(file)
parseCsvStatement(text)
parsePdfTextStatement(text)
```

From `src/ai.js`:

```js
buildAiPayload({ purpose, transactions, habits })
requestAiAssist({ apiKey, payload })
```

From `src/storage.js`:

```js
loadState()
saveState(state)
```

## Acceptance Criteria For The Redesign

- Looks premium on iPhone.
- Home screen immediately communicates the weekly spend number.
- Import flow feels trustworthy and easy.
- Bills and habits are readable without feeling like a spreadsheet.
- AI assist privacy preview is clear and reassuring.
- UI keeps using the existing local backend logic.
- `npm test` should still pass after redesign.
- No backend/server/account system should be introduced.
