# OhmzBudget M2 — Document Bridge: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the rebranded OhmzBudget to an unmodified paperless-ngx sidecar: upload documents through the app, archive/OCR them in paperless, see/search them in the UI, link receipts to transactions — no paperless UI ever exposed.

**Architecture:** paperless-ngx v3.3.0 (plus valkey + postgres) runs as an internal-only compose stack on a second pinned network (10.89.0.0/24); the app's server talks to it exclusively via `internalFetch` (M1's allowlisted private fetch), authenticates with a paperless DRF token, and owns a new `document_links` table (the receipt↔transaction spine, included in backups). Browsers only ever talk to the app: file bytes flow through server routes (upload in, Range-capable proxy out). A paperless workflow webhook (M1's service token, scope `ingest`) accelerates status updates; task polling is the guaranteed path.

**Tech Stack:** Express 5 (`busboy` for inbound multipart — one new MIT dep), drizzle-orm, undici (via `internalFetch`), React 19 + TanStack Query, Playwright (with a stub-paperless harness), Docker Compose, paperless-ngx v3.3.0 REST API v10.

**Spec:** `docs/superpowers/specs/2026-10-10-ohmzbudget-design.md` (§4 `document_links`, §5.1 upload, §5.4 serving, §5.5 events, §5.6 errors).

## Global Constraints

- **paperless stays unmodified.** Image `ghcr.io/paperless-ngx/paperless-ngx:3.3.0`. Never expose its port beyond `127.0.0.1:7301` (admin-only) — the UI is served by the same image/port as the API; "headless" = not routed publicly.
- **All server→paperless HTTP goes through `internalFetch`** (`server/src/services/internalFetch.ts`): it returns non-2xx Responses un-thrown (a 401 means token rotation — surface it, never loop), and the allowlist is exact `host[:port]` from `OHMZBUDGET_INTERNAL_FETCH_ALLOW` (use `paperless:8000`).
- **Upload contract:** `POST /api/documents/post_document/`, multipart, the file field is named **`document`**; the response body is a bare JSON string = task UUID; poll `GET /api/tasks/?task_id=<uuid>` until `status` is `success` (then `result_data.document_id`) or `failure`. Auth header exactly `Authorization: Token <token>`.
- **New tables register in `BACKUP_TABLES`** (`server/src/services/backupService.ts` `TABLES` map) or backups silently skip them.
- **Auth:** app routes require the session (member or admin alike — the budget is shared); `POST /api/ingest/paperless` sits behind `serviceAuth('ingest')` and its payload is **untrusted** (validate with zod; only ever update `document_links` rows that match a paperless document id).
- **`browser/app.ts` untouched** — all new routes mount only in `index.ts`; the `--mode demo` build must keep passing. Apply the M1 note: give the documents router the SAME non-server-mode 404 guard `serviceRouter` uses, at ROUTER level so future routes cannot forget it.
- **No personal hostnames in any tracked file** (placeholders only; the hook blocks commits otherwise). No secrets in the repo: paperless secret key + tokens live in `deploy/secrets/` (untracked) and the live `deploy/.env`.
- **paperless service account:** a dedicated non-superuser account `ohmzbudget` owns the app's documents; its DRF token lives only in the app's server environment (`OHMZBUDGET_PAPERLESS_TOKEN`).
- Existing repo rules hold: conventional commits, prettier-clean, demo build green, TDD per the brief, never push without the controller's go-ahead, haiku subagents per the standing owner directive.

## Review Focus

1. **Untrusted ingest** — the webhook route must never let a payload touch anything but `document_links` (no transaction writes, no file paths); malformed/replayed payloads are inert — Task 6 tests.
2. **Proxy safety** — `/api/documents/:id/file` must resolve ids through the link table (or paperless metadata), never echo arbitrary paperless URLs, and must stream (not buffer) with Range support — Task 5 tests.
3. **Upload loss-proofing** — a paperless outage mid-upload lands the row in `queued` with the bytes held on disk; a restart retries; nothing is silently dropped — Tasks 3–5 tests.
4. **Backup coverage** — `document_links` present in `BACKUP_TABLES` and absent from the offline-copy keys (client-side) — Task 2 test.
5. **Token rotation surface** — a paperless 401 produces a visible, actionable error (never a retry loop, never a silent empty list) — Task 3 tests + Task 8 UI state.

---

### Task 1: Branch, baseline & tracker

**Files:** none in the repo except the plan's tracker.

- [ ] **Step 1: Branch from the M1 tip**

```bash
cd ~/StudioProjects/OhmzBudget
git checkout m1-identity && git pull --ff-only 2>/dev/null || true
git checkout -b m2-document-bridge
```

- [ ] **Step 2: Baseline**

```bash
(cd server && npm test) && (cd client && npm test) && (cd client && npx tsc --noEmit) && (cd server && npx tsc --noEmit) && npm run format:check
```

Expected: server 344, client 85. Stop and report if not.

- [ ] **Step 3: Seed the `## Execution Tracker`** (same shape as the M0/M1 plans; Tasks 1–11, branch `m2-document-bridge`).

- [ ] **Step 4: Commit** — `docs: start M2 document-bridge plan (tracker + baseline)`

---

### Task 2: `document_links` schema, migration 0022, backup registration

**Files:**

- Modify: `server/src/db/schema.ts` (append `documentLinks`)
- Create: `server/src/db/migrations/0022_document_links.sql` + `meta/0022_snapshot.json` (generated — recipe below)
- Modify: `server/src/db/migrations/meta/_journal.json` (append idx 22, `when` > `1790900000000`)
- Modify: `server/src/services/backupService.ts` (import `documentLinks`; add to `TABLES`)
- Test: `server/src/db/documentLinks.test.ts`

**Interfaces:**

- Produces: `documentLinks` table; `document_links` columns exactly as the spec §4: `id, paperless_document_id (nullable), transaction_id (nullable FK, ON DELETE SET NULL), source, status, confidence (nullable real), title, staged_path (nullable), created_by (nullable FK to users, ON DELETE SET NULL), created_at, updated_at`.

- [ ] **Step 1: Failing test** (`documentLinks.test.ts`, migrate-first harness like `auth/users.test.ts`):

```ts
it('creates the document_links table with the spec columns and survives a backup round trip', () => {
  const cols = sqlite
    .prepare(`PRAGMA table_info(document_links)`)
    .all()
    .map((c: any) => c.name);
  expect(cols).toEqual(
    expect.arrayContaining([
      'id',
      'paperless_document_id',
      'transaction_id',
      'source',
      'status',
      'confidence',
      'title',
      'staged_path',
      'created_by',
      'created_at',
      'updated_at',
    ]),
  );
  expect(BACKUP_TABLES).toContain('documentLinks');
});
```

- [ ] **Step 2: RED** — `cd server && npx vitest run src/db/documentLinks.test.ts` → fails (no table).

- [ ] **Step 3: Schema** (`schema.ts`, after `serviceTokens`):

```ts
/** The receipt↔document spine (M2): one row per managed document, linked to a transaction when matched. */
export const documentLinks = sqliteTable(
  'document_links',
  {
    id: text('id').primaryKey(),
    paperlessDocumentId: integer('paperless_document_id'),
    paperlessTaskId: text('paperless_task_id'), // the Celery task uuid for a processing upload (reconcile after restart)
    transactionId: text('transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    source: text('source').notNull().default('receipt'), // 'receipt' | 'bill' | 'statement' | 'other'
    status: text('status').notNull().default('processing'), // queued|processing|unlinked|linked|verified|failed
    confidence: integer('confidence'), // 0-100, null until matched
    title: text('title'),
    stagedPath: text('staged_path'), // held upload when paperless was unreachable
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('document_links_paperless_id_unique').on(table.paperlessDocumentId),
    index('document_links_transaction_idx').on(table.transactionId),
  ],
);
```

- [ ] **Step 4: Migration 0022 SQL** (hand-written, mirroring 0021's shape):

```sql
CREATE TABLE `document_links` (
  `id` text PRIMARY KEY NOT NULL,
  `paperless_document_id` integer,
  `paperless_task_id` text,
  `transaction_id` text REFERENCES `transactions`(`id`) ON DELETE set null,
  `source` text DEFAULT 'receipt' NOT NULL,
  `status` text DEFAULT 'processing' NOT NULL,
  `confidence` integer,
  `title` text,
  `staged_path` text,
  `created_by` text REFERENCES `users`(`id`) ON DELETE set null,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_links_paperless_id_unique` ON `document_links` (`paperless_document_id`);
--> statement-breakpoint
CREATE INDEX `document_links_transaction_idx` ON `document_links` (`transaction_id`);
```

Journal: append `{"idx": 22, "version": "6", "when": 1790950000000, "tag": "0022_document_links", "breakpoints": true}`.

- [ ] **Step 5: Snapshot — the proven recipe** (this repo's `db:generate` cannot run without it; reuse the M1 method): temporarily re-add the legacy `recurring_transactions` table + `transactions.recurringTransactionId` to `schema.ts` (copy the exact TEMPORARY block from the M1 fix — it is recorded in `.superpowers/sdd/2026-10-10-ohmzbudget-m1-identity/fix-round-1-addendum.md` if the workspace still exists, otherwise reconstruct from `meta/0021_snapshot.json`), run `cd server && CI=1 npx drizzle-kit generate </dev/null`, rename the emitted snapshot to `meta/0022_snapshot.json`, delete the emitted `0023_*.sql` + its journal entry (keep idx 22), revert the temporary block (`git checkout -- src/db/schema.ts` after re-applying your committed M2 schema changes is NOT possible — instead keep the snapshot and hand-verify), then **prove it with a second run**: with the temporary block still in place and the new snapshot installed, `CI=1 npx drizzle-kit generate </dev/null` must print `No schema changes, nothing to migrate`. Only then revert the temporary block and commit. (The 0022 snapshot legitimately still records `recurring_transactions` — the future cleanup migration drops it.)

- [ ] **Step 6: Backup registration** — import `documentLinks` in `backupService.ts` and add `documentLinks,` to the `TABLES` map (after `transactions`).

- [ ] **Step 7: GREEN + suite** — focused test passes; `npx tsc --noEmit && npm test` (≥344 + your new test).

- [ ] **Step 8: Commit** — `feat: document_links schema, migration 0022 and backup coverage`

---

### Task 3: paperless client (`paperlessClient.ts`)

**Files:**

- Modify: `server/src/config.ts` (append):

```ts
/** Base URL of the headless paperless sidecar, e.g. "http://paperless:8000". */
export const paperlessUrl = process.env.OHMZBUDGET_PAPERLESS_URL ?? '';
/** DRF token for the paperless service account (never logged, never returned to the client). */
export const paperlessToken = process.env.OHMZBUDGET_PAPERLESS_TOKEN ?? '';
```

- Create: `server/src/modules/documents/paperlessClient.ts`
- Test: `server/src/modules/documents/paperlessClient.test.ts` (stub paperless on `http.createServer`, env set before import — the `internalFetch.test.ts` pattern)

**Interfaces (later tasks rely on these EXACT names):**

- `class PaperlessError extends Error { code: 'unreachable' | 'unauthorized' | 'task_failed' | 'not_found' | 'bad_response' }`
- `postDocument(file: { data: Buffer; filename: string; mimetype: string }, meta: { title?: string; created?: string; tags?: string[] }): Promise<string>` → task id
- `getTask(taskId: string): Promise<{ status: 'pending'|'started'|'success'|'failure'; documentId?: number; duplicateOf?: number; error?: string }>`
- `getDocument(id: number): Promise<{ id: number; title: string; created: string; tags: string[] }>`
- `searchDocuments(query: string, page: number): Promise<{ count: number; results: Array<{ id: number; title: string; created: string }> }>`
- `fileRequest(id: number, kind: 'download' | 'preview' | 'thumb'): Promise<Response>` (caller streams; `download` → `/api/documents/{id}/download/`, `preview` → `…/preview/`, `thumb` → `…/thumb/`)
- `export function paperlessConfigured(): boolean`

- [ ] **Step 1: Failing tests** — key cases: `postDocument` sends the multipart field named `document` plus metadata fields and returns the bare-string task id; a 401 response → `PaperlessError('unauthorized')`; an unreachable host → `('unreachable')`; `getTask` maps a `failure` task to `task_failed` with the error text; `fileRequest('download')` returns the streamed Response untouched (status + body pass through).

- [ ] **Step 2: RED** → **Step 3: implement.** Use `internalFetch` for every call with headers `{ Authorization: `Token ${paperlessToken}`, Accept: 'application/json; version=10' }`. Build multipart with undici's `FormData` + `new Blob([data], { type: mimetype })` appended under the name `document`. Before any request: `if (!paperlessConfigured()) throw new PaperlessError('unreachable', 'paperless is not configured')`. Never log the token; error messages carry status + paperless's body text only.

- [ ] **Step 4: GREEN + `npx tsc --noEmit && npm test`.**

- [ ] **Step 5: Commit** — `feat: paperless client for the document bridge`

---

### Task 4: documents service (`documentsService.ts`)

**Files:**

- Create: `server/src/modules/documents/documentsService.ts`
- Test: `server/src/modules/documents/documentsService.test.ts` (migrate-first harness)

**Interfaces:**

- `export type DocumentStatus = 'queued' | 'processing' | 'unlinked' | 'suggested' | 'pending_review' | 'linked' | 'verified' | 'dismissed' | 'failed'` (the spec §4 list — M2 only drives queued/processing/unlinked/linked/verified/failed; the matcher statuses arrive in M4).
- `deterministicId(paperlessDocumentId: number): string` — `'dl_' + createHash('sha256').update('paperless:' + id).digest('hex').slice(0, 20)` (repo rule: deterministic ids for generated rows).
- `createProcessingLink(input: { createdBy?: string; source?: string; title?: string }): string` (returns row id)
- `attachTask(rowId: string, taskId: string): void` (stores the task uuid in `paperless_task_id`)
- Status transitions in ONE place: `setStatus(rowId: string, status: DocumentStatus, patch?: { paperlessDocumentId?: number; paperlessTaskId?: string | null; confidence?: number; transactionId?: string | null }): boolean`
- `linkToTransaction(rowId: string, transactionId: string | null, confidence?: number): { ok: boolean; error?: 'not_found' }`
- `listForTransaction(transactionId: string): DocumentLinkRow[]`
- `listAll(filter?: { status?: DocumentStatus }): DocumentLinkRow[]`
- `findByPaperlessId(id: number): DocumentLinkRow | undefined`
- `reconcileProcessing(): void` — for each `processing` row WITH a `paperless_task_id`, call `getTask` and finish accordingly (task success → `unlinked` + document id; failure → `failed`); no-op when paperless is unconfigured. Called on startup and by the `retry` route.

- [ ] **Step 1: Failing tests** — transitions: `processing → unlinked` on task success (with the document id set); `processing → failed` on task failure; `failed → processing` retry clears the task id; `linkToTransaction` sets `linked` + confidence and `null` resets to `unlinked`; `setStatus` on a missing row is a no-op returning false; deterministic ids stable across calls; `reconcileProcessing` finishes a row whose stubbed task succeeded and is a no-op when paperless is unconfigured.

- [ ] **Step 2: RED** → **Step 3: implement** (drizzle writes via `db`; pure helpers separate; all statuses through `setStatus`) → **Step 4: GREEN + tsc + suite.**

- [ ] **Step 5: Commit** — `feat: document links service`

---

### Task 5: document routes (upload, proxy, link/unlink/retry)

**Files:**

- Add dependency first: `cd server && npm install busboy --ignore-scripts && npm install --save-dev @types/busboy --ignore-scripts` (record both names in the commit; CI's `npm audit signatures` covers them)
- Create: `server/src/routes/documents.ts` (`documentsRouter`), `server/src/modules/documents/uploadHandler.ts`
- Modify: `server/src/index.ts` — mount `app.use('/api/documents', documentsRouter)` after `requireSession` (session-authed like the rest), and give the ROUTER the M1 router-level guard:

```ts
// In documents.ts, first line of the router:
documentsRouter.use((req, res, next) => {
  if (!serverMode) return res.status(404).json({ error: 'Not found' });
  next();
});
```

**Interfaces (client T8 consumes):**

- `POST /api/documents` — multipart; fields: `document` (file, required), `source` (optional), `title` (optional). Flow: parse via busboy into a Buffer (**cap 25 MB**, reject 413 beyond); require a session (route-level); create the link row; `postDocument` → task id; poll `getTask` (1 s interval, **max 120 s**, keep the task id updatable); on success → attach document id + `unlinked`; on `unauthorized` → `502 { error: 'paperless token needs rotation' }`; on unreachable/timeout → stash the bytes at `data/staged/<rowId>-<filename>` (dir beside the DB: `path.join(path.dirname(databasePath), 'staged')`), set `staged_path`, keep `processing`; respond `202 { id, status }` in that case.
- `GET /api/documents?status=&transactionId=` — rows for the UI (JSON, camelCase row shape).
- `GET /api/documents/:id/file?kind=preview|thumb|download` — resolve the row (404 unknown/`processing`), `fileRequest` through paperless, and STREAM: copy `status`, `content-type`, `content-length`, and `content-range`/`accept-ranges` headers, then `Readable.fromWeb(response.body).pipe(res)`.
- `POST /api/documents/:id/link { transactionId }` / `POST /api/documents/:id/unlink` / `POST /api/documents/:id/retry` (retry only for `failed` or `processing`-with-`staged_path`: re-runs the upload from the staged file).
- `GET /api/transactions/:id/documents` — convenience alias for the panel (returns `listForTransaction`).

- [ ] **Step 1: Failing tests** (real-HTTP harness + stub paperless): upload happy path (`202`/`200` row with document id, stub saw field `document`); oversize → 413; anonymous → 401; unknown row → 404; `file` streams bytes and forwards `content-type` + a Range status (stub replies 206); link/unlink flip statuses; retry from `staged_path` re-uploads and deletes the staged file on success; non-server-mode → 404 on every route (the router guard); `GET /api/documents` shape.
- [ ] **Step 2: RED** → **Step 3: implement** → **Step 4: GREEN + tsc + suite + demo build.**
- [ ] **Step 5: Commit** — `feat: document upload, streaming proxy and link routes`

---

### Task 6: real ingest route

**Files:**

- Modify: `server/src/routes/ingest.ts` (replace the stub body; KEEP the mount + comment style)
- Test: `server/src/routes/paperlessIngest.test.ts`

**Interfaces:** `POST /api/ingest/paperless` body (zod): `{ documentId: number (int, positive), status?: 'consumed' | 'failed', title?: string }` → `200 {ok:true}`. Behavior: if `status === 'failed'` → `setStatus(failed)` for the matching row (else no-op); if `consumed` → if a row matches `paperlessDocumentId` and is `processing`, move it to `unlinked`; unknown ids are an idempotent no-op (still 200). NEVER touches transactions or files.

- [ ] **Step 1: Failing tests** — valid consumed → row flips; replayed body → same 200, no double effect; failed → row failed; unknown id → 200 no-op; malformed body → 400; without the service token → 401 (existing serviceAuth path — assert once through the real mount).
- [ ] **Step 2: RED → implement → GREEN + suite.**
- [ ] **Step 3: Commit** — `feat: paperless ingest endpoint (webhook)`

- [ ] **Step 4 (record for T7/T11):** whether paperless workflow CONSUMPTION triggers fire for API uploads is unverified; polling is primary; on the host, if the webhook test fails, note it in the deploy README and leave the polling path as the documented one.

---

### Task 7: deploy — paperless stack on the host

**Files:**

- Modify: `deploy/compose.yml` (add services; the app service gains `OHMZBUDGET_PAPERLESS_URL: 'http://paperless:8000'` and `OHMZBUDGET_PAPERLESS_TOKEN_FILE: '/run/secrets/paperless_token'` + secret), `deploy/docker-compose.override.yml` (add the `internal` network pin), `deploy/.env.example` (`OHMZBUDGET_INTERNAL_FETCH_ALLOW=paperless:8000` becomes ACTIVE with a comment), `deploy/README.md`, `deploy/.gitignore` unchanged (`secrets/` covers the new key)
- On the host (untracked): `deploy/secrets/paperless_secret_key`, `deploy/secrets/paperless_token`

Exact additions (adapt whitespace to the file's style):

```yaml
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:3.3.0
    container_name: paperless
    restart: unless-stopped
    depends_on: [paperless-db, paperless-valkey]
    networks: [default, internal]
    environment:
      PAPERLESS_DBENGINE: postgresql
      PAPERLESS_DBHOST: paperless-db
      PAPERLESS_DBPASS: paperless
      PAPERLESS_REDIS: redis://paperless-valkey:6379
      PAPERLESS_URL: http://localhost:7301
      PAPERLESS_SECRET_KEY_FILE: /run/secrets/paperless_secret_key
      PAPERLESS_OCR_LANGUAGE: eng
      USERMAP_UID: '1000'
      USERMAP_GID: '1000'
    ports: ['127.0.0.1:7301:8000']
    volumes: [paperless-data:/usr/src/paperless/data, paperless-media:/usr/src/paperless/media]
    secrets: [paperless_secret_key]
  paperless-db:
    image: postgres:17-alpine
    container_name: paperless-db
    restart: unless-stopped
    networks: [internal]
    environment: { POSTGRES_DB: paperless, POSTGRES_USER: paperless, POSTGRES_PASSWORD: paperless }
    volumes: [paperless-db:/var/lib/postgresql/data]
  paperless-valkey:
    image: valkey/valkey:9-alpine
    container_name: paperless-valkey
    restart: unless-stopped
    networks: [internal]
volumes: { paperless-data: , paperless-media: , paperless-db: }
networks:
  internal: { name: ohmzbudget_internal }
secrets:
  paperless_secret_key: { file: ./secrets/paperless_secret_key }
```

Override addition:

```yaml
networks:
  internal:
    ipam:
      config:
        - subnet: 10.89.0.0/24
```

- [ ] **Step 1: Pre-check** — `docker network ls` / host routes: `10.89.0.0/24` free (recon said yes; verify). If taken, STOP and report.
- [ ] **Step 2: Generate untracked secrets** — `deploy/secrets/paperless_secret_key` = `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` (chmod 400). Bring up the whole stack (`up -d --build`); wait for both healthchecks (`paperless` may take a minute to migrate).
- [ ] **Step 3: First-run on paperless (runbook, commands recorded in the report)** — superuser: generate a password into `deploy/secrets/paperless_admin_password` (chmod 400) and create via `docker exec paperless python3 -c "import os; from django.contrib.auth import get_user_model; U=get_user_model(); U.objects.filter(username='admin').exists() or U.objects.create_superuser('admin','admin@example.invalid', os.environ['ADMIN_PW'])" ` with `ADMIN_PW` passed via `docker exec -e ADMIN_PW="$(cat deploy/secrets/paperless_admin_password)"` (never on a command line that lands in logs). Service account + token, same exec pattern: `U.objects.create_user('ohmzbudget', password=None)` if absent, then `from django.contrib.auth.models import Permission; u.user_permissions.add(Permission.objects.get(codename='add_document'))` (plus view/change on documents it owns), then mint the DRF token: `from rest_framework.authtoken.models import Token; print(Token.objects.get_or_create(user=u)[0].key)` → write to `deploy/secrets/paperless_token` (chmod 400) → `docker compose up -d` once more so the app picks it up (compose passes it via `OHMZBUDGET_PAPERLESS_TOKEN_FILE`; the app reads it at module load — add a tiny helper in `config.ts` reading `_FILE` variants exactly like `OHMZBUDGET_DATA_KEY_FILE` does).
- [ ] **Step 4: Verify live** — `docker exec ohmzbudget printenv OHMZBUDGET_PAPERLESS_URL` → `http://paperless:8000`; `docker exec ohmzbudget node -e "fetch('http://paperless:8000/api/').then(r=>console.log(r.status))"` → 200/401 (reachability proof); `/api/documents` through the app (401 without a session — correct); compose ps all healthy. Leave running.
- [ ] **Step 5: Commit** (tracked files only) — `build: run paperless-ngx as an internal sidecar`

---

### Task 8: client — dropzone, archive page, receipt panel

**Files:**

- Create: `client/src/api/documents.ts` — including a NEW `apiUpload` helper (in `client/src/api/client.ts`): like `apiFetch` but WITHOUT the default `Content-Type` (the browser must set the multipart boundary), accepting a `FormData` body:

```ts
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  /* same error/connection handling as apiFetch, no JSON header */
}
```

- Create: `client/src/components/documents/Dropzone.tsx` (drag/drop + file picker; `source` toggle Receipt|Bill|Statement; uploads via `apiUpload('/documents', form)`; on 202 shows "processing" with a poll of `['documents']` every 3 s until the row leaves `processing`), `client/src/pages/Documents.tsx` (archive explorer: search box → `GET /api/documents` list; each card: thumb via `/api/documents/:id/file?kind=thumb`, title, status `Badge`, open → preview modal (`iframe` src=`…?kind=preview`, `max-md` full-screen), download link), `client/src/components/documents/ReceiptPanel.tsx` (in `TransactionDetailPanel`: linked docs + thumbs + `Link receipt` picker (unlinked rows) + `Unlink` via `ConfirmModal`; "no receipts" empty state)
- Modify: `client/src/components/transactions/TransactionDetailPanel.tsx` (mount `ReceiptPanel`), `client/src/components/layout/Sidebar*` + routes (a `Documents` destination `/documents`), Dashboard (`GettingStarted` optional — skip), `client/src/App.tsx` or router table (match the repo's route pattern)

**Interfaces:** consumes T5's routes verbatim; new query keys `['documents']`, `['documents', {transactionId}]`; labels for T9: `Upload document` (dropzone button), `Search documents`, `Link receipt`, `Unlink`, status badges `Processing`/`Needs review`? (keep exactly: `Processing`, `Filed`, `Linked`, `Failed`).

- [ ] **Step 1-3:** implement in that order; `useFormReset` where dialogs exist; reuse `EmptyState`/`Badge`/`Modal`. Key snippet — the dropzone submit:

```tsx
const [uploading, setUploading] = useState(false);
async function submit(file: File) {
  setUploading(true);
  try {
    const form = new FormData();
    form.append('document', file);
    form.append('source', source); // Receipt | Bill | Statement toggle
    await apiUpload('/documents', form); // 202: processing; the ['documents'] poll picks it up
    setNotice('Uploading — OCR runs in the background.');
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setUploading(false);
  }
}
```

and the processing poll: `useQuery({ queryKey: ['documents'], refetchInterval: (q) => (q.state.data as DocumentRow[] | undefined)?.some((d) => d.status === 'processing' || d.status === 'queued') ? 3000 : false })`.

- [ ] **Step 4: Verify** — `cd client && npx tsc --noEmit && npm test && npm run build && npx vite build --mode demo 2>&1 | tail -3` (demo: the Documents page must render its NotInDemo/empty state gracefully; the dropzone must not fetch in demo).
- [ ] **Step 5: Commit** — `feat: document dropzone, archive explorer and receipt panel`

---

### Task 9: e2e — stub paperless + documents flow

**Files:**

- Modify: `e2e/global-setup.ts` — start a **stub paperless** (a `http.createServer` helper in `e2e/stubPaperless.ts`) on a fixed port; for the SERVER-MODE project, launch the app with `OHMZBUDGET_PAPERLESS_URL=http://127.0.0.1:<stubPort>` and `OHMZBUDGET_INTERNAL_FETCH_ALLOW=127.0.0.1:<stubPort>` and `OHMZBUDGET_PAPERLESS_TOKEN=stub-token` (desktop project unchanged: paperless unconfigured there, and the `Documents` page shows a NotInDemo-style notice)
- Create: `e2e/stubPaperless.ts` — implements just enough: `POST /api/documents/post_document/` (asserts `Authorization: Token stub-token`, reads the multipart, returns a JSON string task uuid), `GET /api/tasks/?task_id=` (success with `result_data.document_id: 1` after ~1 s), `GET /api/documents/<id>/` (metadata), `GET /api/documents/<id>/(download|preview|thumb)` (tiny PDF bytes / PNG), `GET /api/documents/?query=` (search over one seeded doc)
- Create: `e2e/tests/server-mode/documents.spec.ts` (serial, after auth): owner signs in → `Documents` → upload a small fixture PDF via the dropzone → card leaves `Processing` → preview modal opens (iframe URL served through the app origin) → open a transaction → `Link receipt` → panel shows the doc → archive shows `Linked` → `Unlink` frees it. Use the selector notes from T8's report if present.
- [ ] **Step 1:** implement the stub + spec → **Step 2:** full `cd e2e && npm test` (five… four projects; the stub only starts where needed), flake policy as always.
- [ ] **Step 3: Commit** — `test: e2e coverage for the document bridge`

---

### Task 10: docs

**Files:**

- Modify: `website/community/self-hosting.mdx` (a Paperless section: the sidecar stack, `OHMZBUDGET_PAPERLESS_*` env rows, the admin port 7301, the service account), `website/docs/settings.mdx` (Users/tokens blurb gains the `ingest` scope's real use), `CLAUDE.md` + `AGENTS.md` (same change: a "Documents module (M2)" note — routes, `document_links`, internalFetch contract, the polling-primary/webhook-speculative note)
- Do NOT touch: `client/src/utils/project.ts`, protected domains, `cla.yml`, `CLA.md`.
- [ ] **Step 1:** edits; `cd website && npm run build 2>&1 | tail -3` SUCCESS; format:check.
- [ ] **Step 2: Commit** — `docs: document bridge deployment and usage`

---

### Task 11: battery + live acceptance + close-out

- [ ] **Step 1: Full battery** — server + client units, tsc ×2, format, full e2e, demo + website builds.
- [ ] **Step 2: Live acceptance on the host** — create the admin account if the owner has not; sign in via `http://127.0.0.1:7300` with a scripted session (Playwright against the live port or curl with cookie jar); generate a small sample receipt PDF locally (`python3` + reportlab/PIL → a one-page PDF with "OHMZ SAMPLE MART — TOTAL $23.47 — 2026-10-10"); upload it through `POST /api/documents`; poll until `unlinked`; confirm paperless actually OCR'd it (`docker exec paperless python3 manage.py document_exporter` is heavy — instead GET the document via the app proxy and confirm `content-type: application/pdf` + bytes); confirm the archive page lists it. **This is the M2 exit proof.** Leave everything running.
- [ ] **Step 3: Close-out** — tick the tracker, append the Close-out section (final shas, evidence, parked items — include any token-rotation observations from Task 2 of M3's queue), commit `docs: M2 close-out`, then the controller runs the whole-branch review + fix wave + PR.

**M2 exit criteria (spec §7):** upload → OCR → visible → linkable end-to-end against the real paperless on the host; contract tests vs the stub; every suite green; stack running.

---

## Plan Set Note

M3 (statement import) consumes this milestone's `document_links` + paperless bridge for the statement-archive path; M4 adds the matcher on top of `document_links.confidence`/status. The end-goal acceptance test (admin account + sample receipt/bill/statement uploads) runs at the end of M4.
