# OhmzBudget — Design Spec

- **Date:** 2026-10-10
- **Status:** Design approved section-by-section in brainstorming; this document is the review artifact. No implementation begins until the implementation plan (writing-plans) is approved.
- **Repo:** `ohmzi/FlyBudget` → to be renamed `ohmzi/OhmzBudget` at M0 (with owner's go). Local: `~/StudioProjects/OhmzBudget` (full 277-commit history; `upstream` remote → `dtymoszenko/FlyBudget`, pinned base v0.1.1 / b0dcef9).

## 1. Goal & context

One self-hosted, mobile-first household finance + document system with a single login: a rebranded **FlyBudget** as the budgeting app and hub, **paperless-ngx** (unmodified) as the headless OCR/archive engine, and a new in-app module set for receipts, statement import and reconciliation. This replaces the retired `trip-reconciler` + Firefly III + Receipt Wrangler stack.

**Reality findings that shaped this spec** (verified by two research workflows, 14 agents):

- `ohmzi/FlyBudget` is a pristine fork of **dtymoszenko/FlyBudget** — a TypeScript app (React 19 + Vite client; Express 5 + better-sqlite3 + Drizzle server; Electron shell), single-user, single `budget.db`, AGPL-3.0-only, v0.1.1, upstream very active. It is **not** Firefly III lineage; the original plan's Firefly vocabulary (`external_id`, journal types, OAuth2/PAT) does not exist in it.
- `ohmzi/data-importer` is a pristine fork of **firefly-iii/data-importer** (PHP ≥8.5/Laravel; CSV + CAMT.052/.053 only — no OFX/QIF) and converts into **Firefly III API calls**; it cannot feed FlyBudget. **Decision: reference-only — no code is copied** (its role taxonomy and duplicate-detection semantics are design inspiration only; copying code would extend its AGPL).
- `ohmzi/paperless-ngx` is a pristine fork (dev, v3.2.1 line). **Decision: run upstream paperless-ngx unmodified (pinned v3.3.0) as a separate service** — GPL-3.0 stays contained (separate program over HTTP).

## 2. Locked decisions

| # | Decision |
|---|----------|
| D1 | Rename the FlyBudget repo in place → OhmzBudget (keep history, attribution, license). GitHub rename at M0. |
| D2 | Fresh start — no data migration from any prior system. |
| D3 | Household access: **separate logins, shared household budget** (admin/member roles; no per-user data partitioning in v1). |
| D4 | Access anywhere via the existing cloudflared private tunnel; loopback binds (ufw is default-deny; published Docker ports bypass ufw). |
| D5 | Dropzone intake: PDF bills/receipts, phone photos (JPG/HEIC/PNG), CSV/OFX bank exports, PDF bank statements. |
| D6 | No Firefly III anywhere. `trip-reconciler` deleted (source archived privately at `ohmzi/trip-reconciler`). |
| D7 | Composition: **"One App"** — everything new lives inside the rebranded fork; paperless is the only sidecar. |
| D8 | v1 never auto-writes money: statement rows create transactions only via the reviewed import flow; reconciliation only links documents; the matcher never edits amounts. |
| D9 | New code isolated under `server/src/modules/{documents,imports,reconcile}` + `client/src/features/*`; upstream files touched minimally; rebase cadence against upstream main. |

## 3. Architecture & topology

```
[Internet] → cloudflared tunnel → budget.example.com
                                        │
                       127.0.0.1:7300   ▼
              ┌─────────────────────────────────────┐
              │  ohmzbudget (Express+React, SQLite)  │   net: ohmzbudget_default 10.88.0.0/24
              └──────┬───────────────┬───────────────┘
                     │ HTTP (internalFetch, service token)
                     ▼
              ┌──────────────────────────┐   net: ohmzbudget_default (+ internal)
              │ paperless-webserver :8000│   loopback admin 127.0.0.1:7301
              └───┬──────────────────────┘
                  │ net: ohmzbudget_internal 10.89.0.0/24
              ┌───▼───────────┐   ┌──────────────┐
              │ paperless-db  │   │ paperless-   │
              │ (postgres:18) │   │ valkey (9)   │
              └───────────────┘   └──────────────┘
```

- **Single compose project** at repo `deploy/` (house conventions: top-level `name:`, `restart: unless-stopped`, hardened containers — `read_only` where possible, `cap_drop: [ALL]`, `no-new-privileges`, healthchecks, secrets as uid-1000 chmod-400 files). Subnets pinned via `docker-compose.override.yml` (Docker default address pools on this host are exhausted — unpinned networks fail outright). Both subnets verified free vs LAN/libvirt/tailscale.
- **Ports:** `127.0.0.1:7300` → ohmzbudget (3001 in-container); `127.0.0.1:7301` → paperless webserver (8000 in-container, admin only). Nothing LAN- or internet-bound directly; ingress is the cloudflared tunnel route `budget.example.com → http://localhost:7300` (dashboard step, owner).
- **Paperless sidecar:** image `ghcr.io/paperless-ngx/paperless-ngx:3.3.0` (API version 10), postgres:18 + valkey:9, `PAPERLESS_SECRET_KEY` required (v3), `PAPERLESS_DBENGINE=postgresql`, consumer folder-watch can stay on (harmless) or disabled; Tika/Gotenberg sidecars **off** (PDF/image intake only). Dedicated non-superuser Paperless service account `ohmzbudget` owning its documents; its DRF token stored server-side only.
- **Three auth domains:** (1) humans → OhmzBudget users (scrypt; sessions per device); (2) services → new **scoped service tokens** (hashed at rest; `Authorization: Bearer`; scopes e.g. `ingest`, `documents`) accepted only on `/api/ingest/*` and `/api/service/*`; (3) OhmzBudget → paperless → `Authorization: Token <t>` (cached; on 401 treat as rotation, surface a settings warning).

### Verified code seams (evidence for the plan)

| Fact | Location (v0.1.1) | Consequence |
|---|---|---|
| Import seam: `importRowSchema = {date, amount(cents, signed), payeeName, notes, importedId}`, max 100k rows; `preview` + `confirm`; dedupe on `(accountId, importedId)`; rules engine runs on confirm | `server/src/routes/transactions.ts:59-66, ~342-386` | Statement imports ride this; no new write path needed |
| No header/token auth; `requireSession` cookie-only; `apiTokenGuard` is Electron-only | `server/src/routes/auth.ts:194-202`, `server/src/middleware/security.ts:101-113` | M1 must add service-token middleware |
| `originGuard` rejects only requests carrying `Origin`/cross-site `Sec-Fetch-Site` — headerless server-to-server passes | `server/src/middleware/security.ts:59-77` | Container→app calls work once hostGuard allows |
| `hostGuard` requires `ALLOWED_HOSTS` entries in server mode | `security.ts:38-44` | Add `ohmzbudget` container hostname |
| `safeFetch` is https-only + refuses loopback/RFC1918 | `server/src/services/safeFetch.ts` | Needs separate `internalFetch` for paperless (http, private) |
| Client CSP is self-only | helmet config | All document views via server proxy routes |
| Backups: `BACKUP_TABLES = Object.keys(TABLES)` over a 14-table map; format marker `flybudget-backup` v2 | `server/src/services/backupService.ts:23-54` | New tables must be added to `TABLES` or backups silently skip them |
| Session cookies `flybudget_session/_device/_token`; IndexedDB `flybudget-offline`; outbox lock; SW cache | `server/src/auth/sessions.ts`, `client/src/offline/*` | Rename all at M0 (fresh start → free) |
| AGPL §13 source link + URL constants | `client/src/utils/project.ts` | Repoint to fork at M0 |
| Publish identity | `.github/workflows/docker.yml` (`IMAGE`), `docker-compose.yml`, `electron-builder.json` | Rename at M0; image → `ghcr.io/ohmzi/ohmzbudget` |
| Rules engine runs on every insert (caller-set category/notes are lock-protected) | `server/src/services/rulesEngine.ts` | Imported rows get categorized by payee rules — by design |
| Schedule matcher (reusable scoring/dismissal patterns) | `server/src/services/matchingEngine.ts` | Model the receipt matcher on it |
| Paperless upload: `POST /api/documents/post_document/`, multipart field **`document`** → bare task UUID; poll `GET /api/tasks/?task_id=` | paperless v3.3.0 | Bridge contract; pre-hash files (v3 accepts duplicates by default) |
| Paperless webhook = workflow action (`WorkflowActionWebhook`), custom headers supported; internal HTTP targets allowed by default | paperless models/settings | Ingest route auth via service token in a header |
| **Unverified:** whether workflow CONSUMPTION triggers fire for API uploads | — | M2 verifies; polling is the guaranteed path either way |

**Upstream conventions this design honors** (from the repo's CLAUDE.md/AGENTS.md): new capabilities come as pure-logic + DB-service pairs (like `rulesEngine.ts`/`ruleService.ts`) so logic re-runs anywhere; writes route through shared service functions; schema changes are add-only; and the new routes mount in `server/src/index.ts` **only** — the in-browser demo worker (`server/src/browser/app.ts`) must not load Node-dependent document code, and client features gate behind `IS_DEMO` (`NotInDemo`) so the `--mode demo` build and its e2e suite stay green.

## 4. Data model

All new tables in `budget.db` via drizzle migration; **every table registered in `TABLES`/`BACKUP_TABLES`**.

- **`users`** — `id, username UNIQUE, password_hash (scrypt, existing code), role ('admin'|'member'), created_at, last_login_at`. First boot: create admin from the existing single password; subsequent logins per user.
- **`sessions`** — add `user_id` FK (existing per-device session table).
- **`service_tokens`** — `id, name, token_hash (sha256), scopes JSON, created_at, last_used_at, revoked_at`.
- **`document_links`** (the spine) — `id, paperless_document_id (NULL until task completes), transaction_id FK NULL (ON DELETE SET NULL), source ('receipt'|'bill'|'statement'|'other'), status, confidence REAL NULL, title, staged_path NULL (held uploads), created_by user_id, created_at, updated_at`.
  - status: `queued` (held locally, paperless unreachable) → `processing` (task running) → `unlinked` → `suggested` | `pending_review` → `linked` (user tapped) → `verified` (user confirmed later) | `dismissed` | `failed`.
  - ids for rows that mirror an external object (a paperless document) derive deterministically (hash of the document id), honoring the repo's deterministic-ids rule.
- **`statement_imports`** — `id, filename, sha256, format ('csv'|'ofx'|'pdf'), account_id FK, row_count, status ('previewed'|'imported'|'failed'), created_by, created_at, finished_at`.
- **`csv_profiles`** — `id, account_id FK, name, delimiter, date_format, mapping JSON (column index → role)`. Saved so a bank's CSV maps itself next time.
- **Idempotency:** receipt-origin rows `importedId = "paperless:<docID>"`; statement rows `"stmt:<statementImportId>:<rowIndex>"`. Both flow through the existing `(accountId, importedId)` dedupe — replays are safe.
- All writes go through the app API (single-writer SQLite, WAL). The reconciliation worker runs in-process and writes only `document_links` state.

## 5. Flows

**5.1 Upload & classification** — `POST /api/documents` (multipart). sha256 first: duplicate against `document_links`/paperless checksums → warn, don't silently re-add. Routing: CSV/OFX → statement pipeline (5.2); images/PDFs → document pipeline with a receipt-vs-statement heuristic + one-tap override in the dropzone (PDF detection is honestly a heuristic; CSV/OFX/images are unambiguous). Document pipeline: `post_document` (field `document`, title, `created`, tags: source + uploader) → `document_links` row `processing` → task poll (1–2 s backoff, generous timeout) or webhook, whichever lands first.

**5.2 Statement import** — CSV: role-mapping UI + `csv_profiles`; OFX: standard parser; PDF: text extraction, and for scanned PDFs — send through paperless OCR first, fetch its extracted text; per-bank versioned templates (bank detected by header patterns). Unknown bank → statement archived as a document + `needs template` state; **never a silent guess**. All formats → normalized rows → existing `preview` → user confirms → `confirm` (rules categorize; dedupe by importedId). `statement_imports` records provenance.

**5.3 Reconciliation (receipt ↔ transaction)** — in-process worker (interval ~10 min + on webhook/upload): candidates = unlinked documents × transactions within ±3 days (configurable); score = exact cents → date proximity → normalized-payee fuzzy. Unique high-confidence → `suggested`; ambiguous → `pending_review` (tap-to-resolve screen: receipt thumb + amount/date context vs candidate rows); user taps → `linked`; dismiss → `dismissed` (remembered, never re-suggested). v1 links documents only — it never creates or edits transactions (D8).

**5.4 Document serving** — `GET /api/documents/:id/file?kind=preview|thumb|original` proxies to paperless with Range passthrough (PDF viewer works); browser never talks to paperless.

**5.5 Events & fallbacks** — paperless workflow webhook → `POST /api/ingest/paperless` (service-token header; metadata only) → update link, kick matcher. Polling remains the guaranteed path (webhook delivery semantics not yet verified for API uploads — M2 confirms; dedupe by document id regardless).

**5.6 Error handling** — paperless unreachable at upload: file held at `staged_path` as `queued`, retried with backoff (never lost). Task failure: real error + retry surfaced on the card. Parse failure: statement archived + explicit `needs template` state (the CSV mapper is the fix path). Token rotation: 401 from paperless → surfaced in settings, no silent retry loop. All state transitions are visible in the UI; nothing fails silently.

## 6. Rebrand & release mechanics

- **Sweep:** audited ~132-file checklist (client strings + `BrandName` wordmark component, server strings, `server/src/config.ts` and the `securityChecks` env-var names in `/api/server/info`, `utils/version.ts`, Dockerfile build defines, tests asserting old names, `.github/workflows/docker.yml` IMAGE + labels, `docker-compose.yml`, `electron-builder.json`, e2e `global-setup.ts`, README/docs/website text; website screenshots regenerating is deferred with the website). Commits follow the repo's conventional-commit table.
- **Identifiers (renamed now — zero deployments make it free):** env prefix `FLYBUDGET_*`→`OHMZBUDGET_*`, cookies `flybudget_*`→`ohmzbudget_*`, backup format marker, SW cache name. `budget.db` filename stays (never branded).
- **AGPL-3.0-only compliance:** keep LICENSE; add NOTICE crediting dtymoszenko/FlyBudget; repoint `SOURCE_CODE_URL` to the fork; strip upstream logo/name from product surfaces (no trademark rights granted). The public fork itself satisfies §13 for household network use.
- **Release:** own image `ghcr.io/ohmzi/ohmzbudget` (enable fork workflows; change `IMAGE` + `org.opencontainers.image.*` labels); compose under `deploy/` as in §3.
- **Deferred (tier-2, explicit):** Electron installers, Docusaurus website + in-browser demo, paperless rebrand (never), per-user private budgets, multi-currency (track upstream `feat/european-banks-multi-currency`), auto-accept match thresholds.

## 7. Phasing & testing

| Milestone | Content | Exit criteria |
|---|---|---|
| **M0 Rebrand ship** | Repo rename (owner go), sweep, identifiers, tests updated, image, compose skeleton + pinned subnets | CI green (vitest + Playwright + format/tsc), `--mode demo` build passes, OhmzBudget runs on host, tunnel reachable |
| **M1 Identity & plumbing** | `users`/roles/sessions, service-token middleware, `internalFetch`, hostGuard entries | New auth + token tests pass; sidecar-call path provable via curl |
| **M2 Document bridge** | paperless stack in compose; documents module: upload, links, polling, proxy, webhook ingest, receipt panel on transaction detail | Upload → OCR → visible → linkable end-to-end; contract tests vs pinned paperless container. *System becomes useful here.* |
| **M3 Statement import** | CSV profiles → OFX → PDF text → scanned-via-OCR; `statement_imports` | Golden-file tests per format + bank templates; real bank file imported with review |
| **M4 Reconciliation** | Matcher, suggestions, review inbox, dismissals | Scoring unit tests; e2e tap-to-resolve; first real receipt matched |

**Testing strategy:** extend the existing harness (server vitest incl. fast-check property tests, client tests, 18 Playwright e2e specs). New tests live beside new modules. Paperless interactions get contract tests against the pinned container. Each milestone ends with the full suite green + a homelab smoke test.

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Upstream drift (young, fast, one-maintainer project) | Minimal-touch module layout (D9), pinned v0.1.1 base, `upstream` remote, scheduled rebase; isolate diffs to new files where possible |
| Multi-user surgery touches core auth | Confine to auth middleware + sessions + users table; no data-scoping changes (shared budget) |
| PDF statement parsing is open-ended | Template backlog, never-guess, archive-fallback; only build templates for banks actually used |
| Webhook path unverified for API uploads | Polling is the guaranteed path; M2 verifies |
| Docker address pools exhausted / host has 79 containers, swap 29/31 GiB | Pinned subnets mandatory; stack is light (≤5 containers); avoid AI/GPU workloads; monitor |
| AGPL/GPL compliance drift | Public repo + repointed source link + NOTICE; paperless stays unmodified; no data-importer code copied |
| Import API semantics (no transfers/tags/currencies in the row schema) | v1 scope: rows are transactions; transfers created via the app's own two-leg endpoint manually; multi-currency deferred |

## 9. Out of scope (v1)

Multi-currency; per-user private budgets; Electron/website/demo rebrand surfaces; paperless rebrand; Tika/Gotenberg; LLM/AI features (paperless AI stays off); auto-creating transactions from receipts or statements without review; migrating any prior Firefly/trip-reconciler data (a Firefly ledger dump is deliberately preserved at `/var/backups/firefly` outside this system).

## 10. Open items (owner confirmation)

1. **Hostname:** `budget.example.com` proposed; owner adds the cloudflared dashboard route at M0/M2.
2. **GitHub rename timing:** M0, on the owner's go (old URLs redirect).
3. **Banks for PDF templates:** collect samples at M3 time.
4. **Plaid/SimpleFIN:** left exactly as the app ships (native); using them needs owner credentials later — not blocking.
5. `/var/backups/firefly` ledger dump stays unless the owner later says otherwise.
6. Tier-2 list in §6 confirmed as deferred.
