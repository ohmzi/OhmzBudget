# FlyBudget — Master Project Planning Document

Open-source local-first budgeting app. Alternative to YNAB. Modeled after Actual Budget.
Runs as a web app (local) and desktop app (Electron). No subscription fee. Bank sync deferred.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Database Schema](#database-schema)
4. [API Design](#api-design)
5. [State Management](#state-management)
6. [Navigation & Routing](#navigation--routing)
7. [Shared Components](#shared-components)
8. [Phase 1 — Backend Foundation](#phase-1--backend-foundation)
9. [Phase 2 — Accounts](#phase-2--accounts)
10. [Phase 3 — Budget View](#phase-3--budget-view)
11. [Phase 4 — Transactions](#phase-4--transactions)
12. [Phase 5 — Reports & Graphs](#phase-5--reports--graphs)
13. [Phase 6 — Payees & Auto-Categorization Rules](#phase-6--payees--auto-categorization-rules)
14. [Phase 7 — Reconciliation](#phase-7--reconciliation)
15. [Phase 8 — Desktop App (Electron)](#phase-8--desktop-app-electron)
16. [Phase 9 — Bank Sync (Deferred)](#phase-9--bank-sync-deferred)
17. [UI/UX Guidelines](#uiux-guidelines)
18. [Key Decisions Log](#key-decisions-log)
19. [Build Order Summary](#build-order-summary)

---

## Tech Stack

| Layer          | Choice                          | Notes                                                     |
| -------------- | ------------------------------- | --------------------------------------------------------- |
| Frontend       | React 19 + TypeScript + Vite    | Already scaffolded                                        |
| Styling        | Tailwind CSS v4                 | Already installed                                         |
| Routing        | React Router v7                 | Already installed                                         |
| Server state   | TanStack Query (React Query) v5 | Cache, refetch, loading/error states for API calls        |
| UI state       | Zustand                         | Lightweight global state: selected month, sidebar, modals |
| Backend        | Node.js + Express + TypeScript  | Server dir exists, needs setup                            |
| Database       | SQLite via `better-sqlite3`     | Local-first, single file, zero config                     |
| ORM/Migrations | Drizzle ORM + drizzle-kit       | Type-safe queries, schema migrations                      |
| Charts         | Recharts                        | React-native composable chart library                     |
| Desktop        | Electron (Phase 8)              | Wraps the web app                                         |
| Icons          | Lucide React                    | Consistent, clean icon set                                |
| Date handling  | date-fns                        | Lightweight, tree-shakeable                               |
| Form handling  | React Hook Form + Zod           | Validated forms with TypeScript inference                 |
| IDs            | nanoid                          | Short, URL-safe unique IDs                                |

---

## Project Structure

```
budgeting-project/
├── client/
│   └── src/
│       ├── pages/
│       │   ├── Budget.tsx              # Zero-based budget view
│       │   ├── Transactions.tsx        # All-accounts transaction list
│       │   ├── AccountTransactions.tsx # Single-account transaction list
│       │   ├── Reports.tsx             # Reports hub
│       │   ├── Payees.tsx
│       │   ├── Rules.tsx
│       │   └── Settings.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── SidebarAccountList.tsx
│       │   │   └── TopBar.tsx
│       │   ├── budget/
│       │   │   ├── BudgetTable.tsx
│       │   │   ├── BudgetGroupRow.tsx
│       │   │   ├── BudgetCategoryRow.tsx
│       │   │   ├── ToBeBudgetedBanner.tsx
│       │   │   └── MonthNavigator.tsx
│       │   ├── transactions/
│       │   │   ├── TransactionTable.tsx
│       │   │   ├── TransactionRow.tsx
│       │   │   ├── AddTransactionRow.tsx
│       │   │   ├── TransactionFilters.tsx
│       │   │   └── ImportModal.tsx
│       │   ├── accounts/
│       │   │   ├── AccountCard.tsx
│       │   │   ├── AddAccountModal.tsx
│       │   │   └── EditAccountModal.tsx
│       │   ├── reports/
│       │   │   ├── NetWorthChart.tsx
│       │   │   ├── SpendingByCategoryChart.tsx
│       │   │   ├── IncomeVsExpensesChart.tsx
│       │   │   ├── CashFlowChart.tsx
│       │   │   └── SpendingTrendsChart.tsx
│       │   └── ui/                     # Shared primitive components
│       │       ├── Modal.tsx
│       │       ├── ConfirmModal.tsx
│       │       ├── CurrencyInput.tsx
│       │       ├── DatePicker.tsx
│       │       ├── Dropdown.tsx
│       │       ├── SearchInput.tsx
│       │       ├── Badge.tsx
│       │       ├── EmptyState.tsx
│       │       ├── Skeleton.tsx
│       │       └── Toast.tsx
│       ├── hooks/
│       │   ├── useAccounts.ts          # TanStack Query hooks
│       │   ├── useBudget.ts
│       │   ├── useTransactions.ts
│       │   ├── useCategories.ts
│       │   ├── usePayees.ts
│       │   └── useReports.ts
│       ├── api/
│       │   ├── client.ts               # Base fetch wrapper
│       │   ├── accounts.ts
│       │   ├── transactions.ts
│       │   ├── budget.ts
│       │   ├── categories.ts
│       │   ├── payees.ts
│       │   └── reports.ts
│       ├── store/
│       │   └── appStore.ts             # Zustand store (UI state only)
│       ├── types/
│       │   └── index.ts                # All shared TypeScript types
│       └── utils/
│           ├── currency.ts             # Format cents → "$1,234.56"
│           ├── dates.ts                # Date helpers
│           └── csv.ts                  # CSV parse/export helpers
├── server/
│   └── src/
│       ├── db/
│       │   ├── schema.ts               # Drizzle schema definitions
│       │   ├── migrations/             # Auto-generated by drizzle-kit
│       │   └── index.ts                # DB connection singleton
│       ├── routes/
│       │   ├── accounts.ts
│       │   ├── transactions.ts
│       │   ├── budget.ts
│       │   ├── categories.ts
│       │   ├── payees.ts
│       │   ├── rules.ts
│       │   └── reports.ts
│       ├── services/
│       │   ├── budgetCalculations.ts   # Budget math logic
│       │   ├── importService.ts        # CSV/OFX parsing
│       │   └── rulesEngine.ts          # Auto-categorization
│       └── index.ts                    # Express entry point
├── electron/                           # Phase 8
│   ├── main.ts
│   └── preload.ts
└── PLANNING.md
```

---

## Database Schema

All IDs are nanoid strings. Amounts are stored as integer **cents** (no floats).
Dates stored as `TEXT` in `YYYY-MM-DD` format. Booleans as `INTEGER` (0/1).

### `accounts`

```sql
id             TEXT PRIMARY KEY
name           TEXT NOT NULL
type           TEXT NOT NULL  -- 'checking' | 'savings' | 'credit' | 'cash' | 'investment'
starting_balance INTEGER NOT NULL DEFAULT 0   -- cents
is_off_budget  INTEGER NOT NULL DEFAULT 0
sort_order     INTEGER NOT NULL DEFAULT 0
closed_at      TEXT    -- null = open, date = closed
created_at     TEXT NOT NULL DEFAULT (datetime('now'))
```

### `category_groups`

```sql
id             TEXT PRIMARY KEY
name           TEXT NOT NULL
is_income      INTEGER NOT NULL DEFAULT 0   -- 1 = income group
sort_order     INTEGER NOT NULL DEFAULT 0
created_at     TEXT NOT NULL DEFAULT (datetime('now'))
```

### `categories`

```sql
id             TEXT PRIMARY KEY
group_id       TEXT NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE
name           TEXT NOT NULL
sort_order     INTEGER NOT NULL DEFAULT 0
created_at     TEXT NOT NULL DEFAULT (datetime('now'))
```

### `payees`

```sql
id                   TEXT PRIMARY KEY
name                 TEXT NOT NULL
default_category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL
created_at           TEXT NOT NULL DEFAULT (datetime('now'))
```

### `transactions`

```sql
id                       TEXT PRIMARY KEY
account_id               TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
date                     TEXT NOT NULL   -- YYYY-MM-DD
amount                   INTEGER NOT NULL  -- cents; negative = money out
payee_id                 TEXT REFERENCES payees(id) ON DELETE SET NULL
payee_name               TEXT   -- raw string fallback when no payee record exists
category_id              TEXT REFERENCES categories(id) ON DELETE SET NULL
notes                    TEXT
cleared                  INTEGER NOT NULL DEFAULT 0
reconciled               INTEGER NOT NULL DEFAULT 0
transfer_transaction_id  TEXT REFERENCES transactions(id) ON DELETE SET NULL
is_parent                INTEGER NOT NULL DEFAULT 0  -- 1 if this is a split parent
parent_transaction_id    TEXT REFERENCES transactions(id) ON DELETE CASCADE
imported_id              TEXT   -- hash for deduplication on import
created_at               TEXT NOT NULL DEFAULT (datetime('now'))
```

### `budget_months`

```sql
id           TEXT PRIMARY KEY
month        TEXT NOT NULL   -- YYYY-MM
category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE
budgeted     INTEGER NOT NULL DEFAULT 0  -- cents
notes        TEXT
UNIQUE(month, category_id)
```

### `rules`

```sql
id          TEXT PRIMARY KEY
conditions  TEXT NOT NULL   -- JSON: [{field: 'payee_name', op: 'contains', value: 'Netflix'}]
actions     TEXT NOT NULL   -- JSON: [{field: 'category_id', value: '<id>'}, {field: 'payee_id', value: '<id>'}]
sort_order  INTEGER NOT NULL DEFAULT 0
created_at  TEXT NOT NULL DEFAULT (datetime('now'))
```

---

## API Design

Base URL: `http://localhost:3001/api`

### Accounts

| Method | Path            | Description                             |
| ------ | --------------- | --------------------------------------- |
| GET    | `/accounts`     | List all accounts with computed balance |
| POST   | `/accounts`     | Create account                          |
| PUT    | `/accounts/:id` | Update account                          |
| DELETE | `/accounts/:id` | Soft-delete (set closed_at)             |

### Categories

| Method | Path                   | Description                           |
| ------ | ---------------------- | ------------------------------------- |
| GET    | `/categories`          | List all groups + categories (nested) |
| POST   | `/categories`          | Create category                       |
| PUT    | `/categories/:id`      | Rename, reorder, move group           |
| DELETE | `/categories/:id`      | Delete (only if no transactions)      |
| POST   | `/category-groups`     | Create group                          |
| PUT    | `/category-groups/:id` | Rename, reorder                       |
| DELETE | `/category-groups/:id` | Delete group + children               |
| PUT    | `/categories/reorder`  | Bulk reorder (drag-and-drop)          |

### Budget

| Method | Path                         | Description                                                                     |
| ------ | ---------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/budget/:month`             | Get full budget for month (YYYY-MM): all categories with budgeted/spent/balance |
| PUT    | `/budget/:month/:categoryId` | Set budgeted amount for a category in a month                                   |
| GET    | `/budget/:month/summary`     | Month summary: income, total budgeted, to-be-budgeted                           |

### Transactions

| Method | Path                           | Description                                                          |
| ------ | ------------------------------ | -------------------------------------------------------------------- |
| GET    | `/transactions`                | List with filters: ?account_id=&month=&category_id=&search=&cleared= |
| POST   | `/transactions`                | Create transaction (also creates split children if provided)         |
| PUT    | `/transactions/:id`            | Update transaction                                                   |
| DELETE | `/transactions/:id`            | Delete transaction                                                   |
| POST   | `/transactions/import`         | Import from CSV/OFX (multipart form, returns preview + dedupe info)  |
| POST   | `/transactions/import/confirm` | Confirm import after preview                                         |
| POST   | `/transactions/transfer`       | Create a linked transfer (creates two transactions)                  |

### Payees

| Method | Path            | Description                           |
| ------ | --------------- | ------------------------------------- |
| GET    | `/payees`       | List all payees                       |
| POST   | `/payees`       | Create payee                          |
| PUT    | `/payees/:id`   | Update payee (name, default category) |
| DELETE | `/payees/:id`   | Delete payee                          |
| POST   | `/payees/merge` | Merge duplicate payees                |

### Rules

| Method | Path           | Description                                               |
| ------ | -------------- | --------------------------------------------------------- |
| GET    | `/rules`       | List all rules                                            |
| POST   | `/rules`       | Create rule                                               |
| PUT    | `/rules/:id`   | Update rule                                               |
| DELETE | `/rules/:id`   | Delete rule                                               |
| POST   | `/rules/apply` | Dry-run rules against existing uncategorized transactions |

### Reports

| Method | Path                            | Description                                           |
| ------ | ------------------------------- | ----------------------------------------------------- |
| GET    | `/reports/net-worth`            | Net worth by month: ?from=&to=                        |
| GET    | `/reports/spending-by-category` | Category totals: ?month=&from=&to=                    |
| GET    | `/reports/income-vs-expenses`   | Monthly income/expense totals: ?from=&to=             |
| GET    | `/reports/cash-flow`            | Monthly net cash flow: ?from=&to=                     |
| GET    | `/reports/spending-trends`      | Category spending over time: ?category_ids=&from=&to= |

---

## State Management

### TanStack Query (server state)

Every API resource gets its own query hook in `client/src/hooks/`. Examples:

```ts
useAccounts(); // GET /accounts — cached, auto-refetch
useBudget(month); // GET /budget/:month — re-fetches when month changes
useTransactions(filters); // GET /transactions?... — re-fetches on filter change
```

Mutations use `useMutation` with `queryClient.invalidateQueries` on success to keep cache fresh.

### Zustand (UI state)

```ts
// store/appStore.ts
{
  selectedMonth: string           // 'YYYY-MM' — current budget month
  sidebarCollapsed: boolean
  openModal: string | null        // which modal is open
  activeAccountId: string | null  // which account is selected in sidebar
  setSelectedMonth: (m: string) => void
  // ...
}
```

---

## Navigation & Routing

```
/                    → redirect to /budget
/budget              → BudgetPage
/transactions        → AllTransactionsPage  (all accounts)
/accounts/:id        → AccountTransactionsPage  (single account)
/reports             → ReportsPage (default: Net Worth)
/reports/net-worth
/reports/spending
/reports/income-expenses
/reports/cash-flow
/reports/trends
/payees              → PayeesPage
/rules               → RulesPage
/settings            → SettingsPage
```

**Sidebar layout:** Fixed left sidebar (~240px), main content fills remainder.
Sidebar sections:

1. Logo + app name
2. Primary nav: Budget, All Accounts, Reports
3. "Accounts" section header + "Add Account" button
   - List of on-budget accounts with live balance
   - List of off-budget accounts (collapsible)
4. Bottom: Payees, Rules, Settings

---

## Shared Components

These live in `client/src/components/ui/` and are used throughout.

### `Modal`

- Backdrop blur + centered card
- Props: `isOpen`, `onClose`, `title`, `children`, `size` ('sm' | 'md' | 'lg')
- ESC key closes, click backdrop closes

### `ConfirmModal`

- Extends Modal; adds `message`, `confirmLabel`, `onConfirm`, `danger` (red button)

### `CurrencyInput`

- Displays formatted value (`$1,234.56`) while editing shows raw number
- On blur: converts to cents, calls `onChange(cents)`
- Handles negative values (for credit cards, etc.)

### `DatePicker`

- Input + calendar popup
- Returns `YYYY-MM-DD` string
- Built with date-fns for formatting

### `Badge`

- Colored pill, Props: `variant` ('checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'positive' | 'negative')

### `EmptyState`

- Icon + heading + subtext + optional action button
- Used on empty transaction lists, no categories yet, etc.

### `Skeleton`

- Loading placeholder rows for tables

### `Toast`

- Success/error/info toasts, auto-dismiss after 3s
- Stack up to 3 at once

### `Dropdown`

- Accessible combobox for category selector, payee selector, etc.
- Supports search filtering within options

---

## Phase 1 — Backend Foundation

**Goal:** Express server running, SQLite DB initialized, all API routes stubbed.

### Setup tasks

- [ ] `cd server && npm init` + install dependencies:
  - `express`, `cors`, `better-sqlite3`, `drizzle-orm`, `nanoid`
  - Dev: `@types/express`, `@types/better-sqlite3`, `drizzle-kit`, `tsx`, `nodemon`
- [ ] `server/src/index.ts` — Express app, JSON middleware, CORS, mount routes, listen on port 3001
- [ ] `server/src/db/schema.ts` — Write all Drizzle table definitions (see Database Schema above)
- [ ] `server/src/db/index.ts` — Create and export DB singleton: `new Database('budget.db')`
- [ ] Run `drizzle-kit generate` + `drizzle-kit migrate` to create DB and tables
- [ ] Add seed script with default category groups:
  - "Income" group (is_income=1) with category "Paycheck"
  - "Housing" group with: Rent/Mortgage, Utilities, Internet
  - "Food" group with: Groceries, Restaurants
  - "Transport" group with: Gas, Insurance
  - "Personal" group with: Clothing, Health, Entertainment
  - "Savings" group with: Emergency Fund, Investments
- [ ] Vite dev proxy: add `server.proxy` in `client/vite.config.ts` → `/api` → `localhost:3001`
- [ ] Add `package.json` at root with `dev` script running client + server concurrently (use `concurrently` package)

### Acceptance criteria

- `npm run dev` from root starts both client (5173) and server (3001)
- `GET http://localhost:3001/api/accounts` returns `[]`
- DB file `budget.db` exists with all tables

---

## Phase 2 — Accounts

**Goal:** Users can create and manage financial accounts. Balances shown in sidebar.

### Backend

- [ ] `server/src/routes/accounts.ts`
  - `GET /accounts` — query all accounts; for each, compute balance:
    `balance = starting_balance + SUM(transactions.amount WHERE account_id = id AND reconciled != -1)`
  - `POST /accounts` — validate body with Zod, insert, return new account with balance
  - `PUT /accounts/:id` — update name, type, is_off_budget, sort_order
  - `DELETE /accounts/:id` — set `closed_at = datetime('now')`

### Frontend

- [ ] `useAccounts` hook — `useQuery(['accounts'], fetchAccounts)`
- [ ] `SidebarAccountList` — reads from `useAccounts`, shows each account with formatted balance
  - On-budget accounts grouped first
  - Off-budget accounts collapsible below separator
  - Click navigates to `/accounts/:id`
  - Green balance if positive, red if negative (credit cards)
  - "Add Account" button at bottom opens `AddAccountModal`
- [ ] `AddAccountModal`
  - Fields: Name (text), Type (dropdown), Starting Balance (CurrencyInput)
  - Note: starting balance is the balance as of today when setting up, not a transaction
  - On submit: `POST /api/accounts`, invalidate `['accounts']` query, close modal
- [ ] `EditAccountModal`
  - Same fields as Add + toggle for "Off Budget"
  - "Close Account" button (confirm dialog before soft-delete)
- [ ] `AccountsPage` (`/accounts` — overview of all accounts)
  - Card grid: each card shows account name, type badge, balance
  - Click card → navigate to that account's transactions
  - "Add Account" button in page header

### Account type rules

- **Checking / Savings / Cash:** Positive balance = money you have
- **Credit Card:** Balance shown as negative (what you owe). Treat as liability.
- **Investment:** Off-budget by default, tracked for net worth calculation

---

## Phase 3 — Budget View

**Goal:** The core feature. Zero-based envelope budgeting with monthly view.

### Budget math (important)

```
To Be Budgeted =
  Income received this month
  + Carried over from previous month
  - Total budgeted this month across all expense categories

Category Balance =
  Budgeted (this month)
  + Balance carried from prior month (if positive; negative reduces next month)
  - Spent this month

Spent = ABS(SUM of transactions in category this month where amount < 0)
```

### Backend

- [ ] `server/src/services/budgetCalculations.ts`
  - `getBudgetMonth(month: string)` — returns full budget data structure
  - For each category:
    - Look up `budget_months` row for this month (budgeted amount)
    - Compute spent from transactions
    - Compute carry-over from prior month's balance
    - Return `{ category, budgeted, spent, balance, carry_over }`
  - Income section: sum of all transactions in income categories this month
  - `To Be Budgeted` = income + carried_over_tbbudgeted - sum(budgeted expense categories)
- [ ] `GET /budget/:month` — calls service, returns full structured response
- [ ] `PUT /budget/:month/:categoryId` — upsert `budget_months` row

### Frontend

- [ ] `MonthNavigator` — prev/next arrows, displays "April 2026", clicking month label shows month picker
- [ ] `ToBeBudgetedBanner`
  - Large number at top: "To Be Budgeted: $X,XXX.XX"
  - Green background if positive, red if negative (over-budgeted), yellow if $0
  - Click opens breakdown tooltip (income, carried over, budgeted)
- [ ] `BudgetTable` — full budget view below banner
- [ ] `BudgetGroupRow`
  - Chevron toggle to collapse/expand group
  - Group name (editable on double-click)
  - Group totals: sum of budgeted | sum spent | sum balance
  - "+ Add Category" button appears on hover
  - Context menu: Rename, Delete Group
- [ ] `BudgetCategoryRow`
  - Category name (editable on double-click)
  - **Budgeted cell:** click → becomes `CurrencyInput`, Enter/Tab confirms, Esc cancels
    - Tab moves to next category's budgeted cell (keyboard flow)
  - Spent cell: formatted, click → opens filtered transaction list for that category/month
  - Balance cell: green if ≥ 0, red if < 0 (overspent)
  - Context menu: Move to Group, Delete Category
- [ ] Quick-budget buttons in group header context menu:
  - "Budget last month's spending" — fills each category with what was spent last month
  - "Budget average spending (3 months)"
  - "Clear all budgeted amounts"
- [ ] Add Category Group button at bottom of table
- [ ] Initial setup prompt if no categories exist yet (guides user to create first budget)

### Budget page layout

```
[MonthNavigator]
[ToBeBudgetedBanner]
─────────────────────────────────────────
  CATEGORY         BUDGETED  SPENT  BALANCE
─────────────────────────────────────────
▼ Income
    Paycheck        $4,000    $4,000   $4,000
▼ Housing
    Rent            $1,500    $1,500   $0
    Utilities       $150      $120     $30
▼ Food
    Groceries       $400      $380     $20
    Restaurants     $100      $145    -$45  ← red
─────────────────────────────────────────
+ Add Category Group
```

---

## Phase 4 — Transactions

**Goal:** Full transaction management. This is where users record and review their spending.

### Backend

- [ ] `server/src/routes/transactions.ts`
  - `GET /transactions` with query params:
    - `account_id` — filter to single account
    - `month` — YYYY-MM filter
    - `from` / `to` — date range
    - `category_id`
    - `search` — searches payee_name, notes
    - `cleared` — 0 | 1
    - `limit` / `offset` — pagination (default limit 200)
  - `POST /transactions`
    - Run rules engine on new transaction
    - If payee_id not provided but payee_name provided: find or create payee
    - If transfer: create linked twin transaction in other account
    - If split: create parent + child rows
  - `PUT /transactions/:id` — update, re-run rules if payee changed
  - `DELETE /transactions/:id` — if transfer, delete linked twin too
  - `POST /transactions/import` — parse CSV/OFX, return preview array with dedup flags
  - `POST /transactions/import/confirm` — insert confirmed rows

### Frontend — Transaction Table

- [ ] `TransactionTable` (shared by both `TransactionsPage` and `AccountTransactionsPage`)
  - Columns: Date | Payee | Category | Notes | Outflow | Inflow | Cleared
  - Outflow = negative amounts (expenses), Inflow = positive (income/deposits)
  - Sorted by date descending by default
  - Click column header to sort
  - Click row → expand inline edit form
  - Running balance column (optional, per-account only)
- [ ] `AddTransactionRow` — pinned at top of table
  - Inline form: Date (default today) | Payee (autocomplete) | Category (dropdown) | Notes | Amount | Cleared checkbox | Save button
  - Payee autocomplete searches `payees` table, shows "Add new payee" if not found
  - Category dropdown shows grouped categories
  - Amount: tabbing between Outflow and Inflow cells
  - Enter to save, Esc to cancel
- [ ] `TransactionFilters` — collapsible filter bar above table
  - Search input (debounced 300ms)
  - Date range picker (Month, Last 3 months, This year, Custom)
  - Category multi-select filter
  - Cleared status toggle
  - "X filters active" badge when filters are applied
- [ ] `TransactionRow` — read mode shows data; click → switches to edit mode inline
  - Cleared checkbox: click toggles cleared status immediately (optimistic update)
  - Delete: trash icon on hover, shows confirm dialog
- [ ] **Transfer flow:** dropdown in Category shows "Transfer to: [Account Name]" for each account; selecting creates linked transfer
- [ ] **Split transaction:** "Split" button in add/edit form adds sub-rows; parent amount must equal sum of splits
- [ ] `ImportModal`
  - Step 1: Upload CSV / OFX / QFX file
  - Step 2: Column mapping (for CSV): which column is Date, Payee, Amount, Notes
  - Step 3: Preview table with dedup warnings (rows that look like existing transactions)
  - Step 4: Confirm import; skips dupes

### Page headers

- `AccountTransactionsPage`: Account name, type badge, current balance, Reconcile button
- `AllTransactionsPage`: "All Transactions" header, total across all accounts

---

## Phase 5 — Reports & Graphs

**Goal:** Visual insights into spending and net worth over time.

### Backend — Report endpoints (in `routes/reports.ts`)

**`GET /reports/net-worth?from=YYYY-MM&to=YYYY-MM`**

- For each month in range, compute:
  - Assets = SUM of non-credit account balances
  - Liabilities = SUM of credit account balances (absolute)
  - Net Worth = Assets − Liabilities
- Returns array of `{ month, assets, liabilities, net_worth }`

**`GET /reports/spending-by-category?from=YYYY-MM&to=YYYY-MM`**

- SUM(transactions.amount) grouped by category_id, filtered to date range
- Returns `{ group_name, category_name, total_spent }[]` sorted by total_spent desc

**`GET /reports/income-vs-expenses?from=YYYY-MM&to=YYYY-MM`**

- Per month: income total (income categories), expense total (expense categories)
- Returns `{ month, income, expenses, net }[]`

**`GET /reports/cash-flow?from=YYYY-MM&to=YYYY-MM`**

- Same as income-vs-expenses net, focused on cash accounts only (exclude off-budget)

**`GET /reports/spending-trends?category_ids=a,b,c&from=YYYY-MM&to=YYYY-MM`**

- Per month per category: SUM(amount)
- Returns `{ month, category_id, category_name, total }[]`

### Frontend

- [ ] `ReportsPage` — left tab nav for report type, date range picker in header
- [ ] **Net Worth** (`NetWorthChart`)
  - Line chart: 3 lines — Assets (blue), Liabilities (red), Net Worth (green)
  - X axis = months, Y axis = dollars
  - Tooltip on hover shows exact values
  - Area fill under Net Worth line
- [ ] **Spending by Category** (`SpendingByCategoryChart`)
  - Horizontal bar chart (easier to read labels than pie)
  - Bars sorted by amount descending
  - Color-coded by category group
  - Click bar → drill down to transactions for that category in range
- [ ] **Income vs Expenses** (`IncomeVsExpensesChart`)
  - Grouped bar chart: 2 bars per month (income = green, expenses = red)
  - Net line overlaid
  - Hover tooltip
- [ ] **Cash Flow** (`CashFlowChart`)
  - Single bar per month: positive = green, negative = red
  - Baseline at zero
- [ ] **Spending Trends** (`SpendingTrendsChart`)
  - Multi-line chart: one line per selected category
  - Category selector (up to 5 categories for readability)
  - Legend with color per category

### Shared report UI

- Date range presets: "Last 3 Months", "Last 6 Months", "This Year", "Last Year", "Custom"
- "Export as CSV" button on each report
- Loading skeleton while data fetches

---

## Phase 6 — Payees & Auto-Categorization Rules

**Goal:** Reduce manual categorization. Smart defaults for recurring expenses.

### Backend

- [ ] Payee routes (CRUD — see API Design)
- [ ] `server/src/services/rulesEngine.ts`
  - `applyRules(transaction)` — evaluates each rule's conditions in sort_order
  - Condition operators: `contains`, `starts_with`, `ends_with`, `exact`, `regex`
  - Condition fields: `payee_name`, `amount`, `notes`
  - Action fields: `category_id`, `payee_id`, `notes`
  - First matching rule wins (stop on first match)

### Frontend

- [ ] `PayeesPage`
  - Table: Payee Name | Default Category | # Transactions | Actions
  - Click name → edit default category inline
  - "Merge" button: select 2+ payees → merge into one (updates all their transactions)
  - Payees auto-created when transactions are added with unrecognized payee names
- [ ] `RulesPage`
  - List of rules in priority order (drag-to-reorder)
  - Each rule: shows condition summary + action summary
  - "Add Rule" button → `AddRuleModal`
  - "Run Rules" button → applies rules to all uncategorized transactions (with preview)
- [ ] `AddRuleModal`
  - Condition builder: "+ Add Condition" adds condition row
    - Field dropdown (Payee Name, Amount, Notes)
    - Operator dropdown (contains, starts with, exactly, regex)
    - Value text input
  - Action builder: "+ Add Action"
    - Field (Category, Payee Name, Notes)
    - Value input / dropdown
  - "Test Rule" — shows preview of matching transactions

---

## Phase 7 — Reconciliation

**Goal:** Verify account balance matches bank statement. Lock past transactions.

### Workflow

1. User clicks "Reconcile" on an account
2. App shows current cleared balance
3. User enters their bank's statement ending balance
4. App shows which transactions are uncleared; user checks them off until totals match
5. User clicks "Finish Reconciliation" — all cleared transactions become reconciled (locked)

### Backend

- [ ] `PUT /accounts/:id/reconcile` — body: `{ statement_balance, transaction_ids }`
  - Sets `reconciled = 1` for given transaction IDs
  - Creates a reconciliation record (optional — for audit trail)
- [ ] Reconciled transactions cannot be edited or deleted (server enforces)

### Frontend

- [ ] `ReconcilePage` (accessed via button on `AccountTransactionsPage`)
  - Header: "Reconcile [Account Name]"
  - Step 1: "Enter your bank's ending balance" — CurrencyInput
  - Step 2: Split view — uncleared transactions on left, running cleared balance on right
    - Click transactions to mark cleared
    - Cleared balance updates live
    - "Difference" shows gap from statement balance (goal: $0.00)
  - "Finish" button enabled when difference = $0.00
  - "Create adjustment" button if difference can't be resolved (creates balancing transaction)

---

## Phase 8 — Desktop App (Electron)

**Goal:** Downloadable native app for Windows, Mac, and Linux.

### Architecture

- Electron main process: starts Express server as a child process, loads `localhost:3001` in a `BrowserWindow`
- In dev: loads Vite dev server URL
- In prod: serves built Vite bundle via Express static middleware

### Setup tasks

- [ ] `npm install --save-dev electron electron-builder`
- [ ] `electron/main.ts`
  - Creates `BrowserWindow` (1200×800, with frame)
  - Spawns server process
  - Opens DevTools in dev mode
  - Handles window close / app quit lifecycle
- [ ] `electron/preload.ts` — expose safe IPC bridge if needed (app version, open file dialog for import)
- [ ] DB file path: `app.getPath('userData') + '/budget.db'` — lives in OS user data dir, survives app updates
- [ ] `electron-builder` config in `package.json`:
  - Target: NSIS installer (Windows), DMG (Mac), AppImage (Linux)
  - App name, icon, description
- [ ] Build script: `npm run build:desktop` — builds client, bundles server, packages Electron
- [ ] App menu: File (Import, Export), Edit, View (zoom), Help (About)
- [ ] About dialog: version, GitHub link

---

## Phase 9 — Bank Sync (Deferred)

**Goal:** Pull transactions automatically from connected bank accounts.

### API options

- **Plaid** — most widely used, developer tier ~$0, production via pricing contact
- **Finicity (by Mastercard)** — personal plan available, ~$15/yr
- **SimpleFIN Bridge** — open-source self-hostable bridge, one-time donation (~$1.50)

### Implementation plan (when ready)

- [ ] Add `bank_connections` table: `id, account_id, provider, access_token (encrypted), cursor`
- [ ] "Connect Bank" flow: OAuth popup → receive access token → store encrypted
- [ ] "Sync" button on account: hits provider API → returns new transactions since last cursor
- [ ] Import new transactions (run rules engine, dedup by imported_id)
- [ ] Store encryption key in OS keychain (via `keytar` Electron package)
- [ ] Sync can be triggered manually or on app start

---

## UI/UX Guidelines

### Layout

- Fixed left sidebar ~240px wide
- Main content area fills rest, has its own scroll
- No horizontal scroll anywhere

### Color system

| Purpose                   | Color                           |
| ------------------------- | ------------------------------- |
| Positive balance / income | Green (`text-green-600`)        |
| Negative / overspent      | Red (`text-red-500`)            |
| Primary actions           | Blue (`bg-blue-600`)            |
| Neutral shell             | Gray (`bg-gray-50`, `bg-white`) |
| Warning / caution         | Yellow (`text-yellow-600`)      |

### Typography & density

- Transaction tables: compact rows (~36px height), many rows visible
- Budget table: slightly more spacious (~44px rows), needs room for editable cells
- Sans-serif system font stack (Tailwind default)

### Amounts

- Always display 2 decimal places: `$1,234.56`
- Negative amounts shown as `-$45.00` in red (not parentheses)
- Store as integer cents in DB — convert to/from on the boundary

### Dates

- Display: `Apr 15, 2026`
- Input: date picker, also accepts typed `4/15/2026` or `2026-04-15`
- Store: `YYYY-MM-DD` string

### Accessibility

- All interactive elements keyboard navigable
- Focus ring visible on all focusable elements
- Color not the only indicator (also use icons/text for red/green states)
- Modal focus trap

---

## Key Decisions Log

| Decision      | Choice                | Reason                                                                |
| ------------- | --------------------- | --------------------------------------------------------------------- |
| Storage       | SQLite local file     | Local-first, no server cost, no account needed, same as Actual Budget |
| Budget method | Zero-based / envelope | Most effective personal budgeting method                              |
| Amounts       | Integer cents         | Avoids all floating point precision errors                            |
| ORM           | Drizzle               | Type-safe, lightweight, great SQLite support                          |
| Charts        | Recharts              | React-native, no D3 knowledge needed, composable                      |
| Server state  | TanStack Query        | Handles cache invalidation, loading/error states automatically        |
| UI state      | Zustand               | Simple, no boilerplate, replaces Context for global UI state          |
| Auth          | None (Phase 1-8)      | Single-user local app, no accounts needed                             |
| Bank sync     | Deferred              | Adds significant complexity; app is useful without it                 |
| Bank sync API | Finicity / SimpleFIN  | ~$15/yr personal tier; SimpleFIN is free/open-source                  |
| Desktop       | Electron              | Largest ecosystem, simplest to wrap a web app                         |

---

## Build Order Summary

Build in this order — each phase depends on what came before:

```
Phase 1  Backend Foundation       ← Everything depends on this
Phase 2  Accounts                 ← Needed before transactions
Phase 4  Transactions             ← Needed before budget calculations
Phase 3  Budget View              ← Depends on transactions + accounts
Phase 6  Payees + Rules           ← Enhances transactions, low effort
Phase 5  Reports                  ← Depends on transaction history
Phase 7  Reconciliation           ← Polish, depends on transactions
Phase 8  Electron Desktop         ← Packaging, depends on working app
Phase 9  Bank Sync                ← Deferred, separate cost/effort
```

### Current status

- [x] Client scaffolded (React + Vite + Tailwind + React Router)
- [x] Server directory exists with tsconfig
- [ ] **Next: Phase 1 — Backend Foundation**
