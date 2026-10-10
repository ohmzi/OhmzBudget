# OhmzBudget M1 — Identity & Plumbing: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Execution Tracker

Maintained between tasks; commit shas live on branch `m1-identity`. Owner directive 2026-10-10: autonomous execution, haiku subagents, plan-as-tracker (this table + ticked boxes are the cross-session source of truth).

| Task                                                        | Status         | Evidence / commits |
| ----------------------------------------------------------- | -------------- | ------------------ |
| 1 Branch, baseline & tracker                                | ⬜ not started | —                  |
| 2 Schema, migration 0021, startup backfill                  | ⬜ not started | —                  |
| 3 Auth services (users, tokens, per-user sessions)          | ⬜ not started | —                  |
| 4 Auth routes grow a username (and per-user semantics)      | ⬜ not started | —                  |
| 5 Admin routes (users + service tokens) and the admin guard | ⬜ not started | —                  |
| 6 Service-token middleware and the provable sidecar path    | ⬜ not started | —                  |
| 7 `internalFetch` for allowlisted private hosts             | ⬜ not started | —                  |
| 8 The client (username login, Users, API tokens)            | ⬜ not started | —                  |
| 9 End-to-end coverage for the new identity                  | ⬜ not started | —                  |
| 10 Docs, deploy notes, and the acceptance hook              | ⬜ not started | —                  |
| 11 Verification battery and close-out                       | ⬜ not started | —                  |

**Goal:** Real multi-user identity (users, roles, per-user sessions, an account-creating setup flow), scoped service tokens for machine callers, and `internalFetch` for allowlisted private hosts — the seams M2's document bridge needs.

**Architecture:** Additive only. A `users` table owned by a new `auth` service layer; sessions gain `user_id`; the old single-password `auth_config` row becomes migration input (one backfill creates the `admin` user) plus the install secret that keeps the device-cookie lockout defense working. Service tokens are hashed at rest, scoped, revoked by timestamp, and accepted only under `/api/service/*` and `/api/ingest/*` via an `Authorization: Bearer ozb_…` header that bypasses session auth but never the host/origin guards. The budget itself stays shared — every user sees the same data (spec D3).

**Tech Stack:** Express 5, drizzle-orm/better-sqlite3, zod, vitest (real-HTTP harness per `server/src/routes/auth.test.ts`), React 19 + TanStack Query + Tailwind, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-ohmzbudget-design.md` (§3 auth domains, §4 data model, §5.6 rotation surface, §7 M1).

## Global Constraints

- **Roles:** `admin` | `member`. Admin-only: user management, service-token management. Everyone: everything else. The budget data is SHARED — no per-row scoping in M1.
- **Username:** 1–64 chars, `^[a-zA-Z0-9._-]+$`, unique case-insensitively, stored as typed; login compares `COLLATE NOCASE`.
- **Passwords:** existing scrypt helpers only (`server/src/auth/password.ts`); min/max from `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH`; a wrong username or password must spend the same hashing time (no user enumeration).
- **Sessions:** `sessions.user_id` (nullable FK, `ON DELETE CASCADE`); every session operation is scoped to its user; migration 0021 clears pre-existing sessions.
- **Device lockout defense preserved:** the device cookie HMAC keys on `auth_config.secret` (new column, random 32-byte base64url, backfilled at startup), NOT on any user's password hash.
- **Service tokens:** minted as `ozb_` + 32 random bytes base64url; only SHA-256 stored; the plaintext is shown once at creation. Scopes: `service`, `ingest`. Header exactly `Authorization: Bearer <token>`. Revoked (or unknown) → `401 {"error":"Unauthorized"}`; valid token lacking the route's scope → `403 {"error":"Forbidden"}`. `last_used_at` written at most every 5 minutes. **Never in backups.**
- **Service routes bypass session auth only:** `hostGuard`, `originGuard`, `securityHeaders` still apply; headerless server-to-server calls already pass `originGuard`.
- **New routes mount ONLY in `server/src/index.ts`** (not `server/src/browser/app.ts`) — the in-browser demo must not load Node-dependent modules; client features for these screens gate on server mode (existing pattern) and the `--mode demo` build must keep passing.
- **Backups exclude all auth state** (users, sessions, service tokens, auth_config) — same posture as today's password/sessions exclusion.
- **Additive schema only**; new tables registered where the repo requires (none in `BACKUP_TABLES` — auth is excluded there).
- Conventional commits per the repo table; `npm run format:check` clean at every commit; never push without the controller's go-ahead; haiku subagents per the standing owner directive.

## Review Focus

1. **Upgrade path for a pre-M1 install** (auth_config row exists, users empty): the backfill must create the `admin` user from the stored hash so the existing password still logs in — test in Task 2.
2. **Cross-user session isolation:** user A's sessions must never be listed, touched, or signed out by user B, and a deleted user's sessions must die with the row — tests in Tasks 3–5.
3. **The last-admin trap:** demoting or deleting the final admin (or deleting yourself) must be refused with a clear error — Task 3 tests.
4. **Token blast radius:** a leaked token is useless after revocation, an `ingest` token gets `403` on `service` routes and vice versa, and the plaintext exists only in the creation response — Tasks 3 and 6 tests.
5. **`internalFetch` SSRF bound:** only allowlisted `host[:port]` targets, on the initial URL and after every redirect hop — Task 7 tests.

---

### Task 1: Branch, baseline & tracker

**Files:** none in the repo except the plan file's tracker.

- [ ] **Step 1: Branch from the M0 tip**

```bash
cd ~/StudioProjects/OhmzBudget
git checkout main && git merge --ff-only origin/main 2>/dev/null; git checkout m0-rebrand && git pull --ff-only
git checkout -b m1-identity
```

- [ ] **Step 2: Baseline (fast suites)**

```bash
(cd server && npm test) && (cd client && npm test) && (cd client && npx tsc --noEmit) && (cd server && npx tsc --noEmit) && npm run format:check
```

Expected: all green (server 263, client 85). If not, stop and report — the baseline is broken.

- [ ] **Step 3: Seed the plan tracker**

Add an `## Execution Tracker` table under the header (same shape as the M0 plan's) with Tasks 1–11 as `⬜ not started`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-10-10-ohmzbudget-m1-identity.md
git commit -m "docs: start M1 identity plan (tracker + baseline)"
```

---

### Task 2: Schema, migration 0021, startup backfill

**Files:**

- Modify: `server/src/db/schema.ts` (append `users`, `serviceTokens`; `sessions.userId`; `authConfig.secret`)
- Create: `server/src/db/migrations/0021_users_service_tokens.sql`
- Modify: `server/src/db/migrations/meta/_journal.json` (append entry, mirroring 0020's — `when` must exceed `1790850000000`)
- Create: `server/src/auth/users.ts` (service skeleton; full API lands in Task 3 — this task only adds `countUsers()` and `ensureAuthReady()`)
- Modify: `server/src/index.ts` (`startServer`: call `ensureAuthReady()` before `listen`)
- Test: `server/src/auth/users.test.ts`

**Interfaces:**

- Produces: `users` / `service_tokens` tables (column names below), `authConfig.secret`, `countUsers(): number`, `ensureAuthReady(): void` (idempotent).

- [ ] **Step 1: Write the failing tests** (`server/src/auth/users.test.ts` — mirror `routes/auth.test.ts`'s migrate-first harness)

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
process.env.OHMZBUDGET_SERVER_MODE = 'true';
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { users, authConfig, sessions } = await import('../db/schema.js');
const { countUsers, ensureAuthReady } = await import('./users.js');

beforeAll(() => migrate(db, { migrationsFolder: 'src/db/migrations' }));

describe('ensureAuthReady', () => {
  it('backfills an admin user from a legacy auth_config row', () => {
    db.insert(authConfig).values({ id: 'server', passwordHash: 'scrypt$legacy' }).run();
    ensureAuthReady();
    const admin = db.select().from(users).all()[0];
    expect(admin).toMatchObject({
      username: 'admin',
      role: 'admin',
      passwordHash: 'scrypt$legacy',
    });
    expect(countUsers()).toBe(1);
  });
  it('fills auth_config.secret with random material and keeps it stable', () => {
    ensureAuthReady();
    const secret = db.select({ secret: authConfig.secret }).from(authConfig).get()?.secret;
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    ensureAuthReady();
    expect(db.select({ secret: authConfig.secret }).from(authConfig).get()?.secret).toBe(secret);
  });
  it('creates no user when nothing was stored and no secret row exists yet', () => {
    db.delete(users).run();
    db.delete(authConfig).run();
    ensureAuthReady();
    expect(countUsers()).toBe(0);
    expect(db.select({ secret: authConfig.secret }).from(authConfig).get()?.secret).toBeTruthy();
  });
  it('migration 0021 cleared old sessions (column exists, no rows survive)', () => {
    expect(db.select().from(sessions).all()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd server && npx vitest run src/auth/users.test.ts` → FAIL (`users` export missing).

- [ ] **Step 3: Schema additions** (`schema.ts`, after the `authConfig`/`sessions` block)

```ts
/** Server-mode accounts. The budget data is shared; roles gate administration. */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'), // 'admin' | 'member'
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastLoginAt: text('last_login_at'),
  },
  (table) => [uniqueIndex('users_username_unique').on(sql`${table.username} COLLATE NOCASE`)],
);
```

(If drizzle's index builder rejects the expression form, write the unique index in the migration SQL only and keep `uniqueIndex('users_username_unique').on(table.username)` here — the migration is authoritative.)

```ts
/** Machine callers (paperless webhook, sidecar). Only the SHA-256 of the token is stored. */
export const serviceTokens = sqliteTable('service_tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  scopes: text('scopes').notNull().default('[]'), // JSON array, e.g. ["ingest"]
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
});
```

`authConfig` gains `secret: text('secret')`; `sessions` gains `userId: text('user_id').references(() => users.id, { onDelete: 'cascade' })`.

- [ ] **Step 4: Migration `0021_users_service_tokens.sql`**

```sql
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text DEFAULT 'member' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  `last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username` COLLATE NOCASE);
--> statement-breakpoint
CREATE TABLE `service_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `token_hash` text NOT NULL,
  `scopes` text DEFAULT '[]' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `last_used_at` text,
  `revoked_at` text
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_id` text REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
DELETE FROM `sessions`;
--> statement-breakpoint
ALTER TABLE `auth_config` ADD `secret` text;
```

Append to `meta/_journal.json` (copy 0020's entry): `{"idx": 21, "version": "6", "when": 1790900000000, "tag": "0021_users_service_tokens", "breakpoints": true}`.

- [ ] **Step 5: `ensureAuthReady()`** (in `users.ts`)

```ts
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { authConfig, users } from '../db/schema.js';

export function countUsers(): number {
  return db.select({ id: users.id }).from(users).all().length;
}

/**
 * Idempotent startup fix-ups:
 * - an install upgrading from single-password mode gets its stored hash as the `admin` user;
 * - auth_config.secret (the device-cookie HMAC key) is created once and never rotated.
 */
export function ensureAuthReady(): void {
  const legacy = db.select().from(authConfig).get();
  if (countUsers() === 0 && legacy) {
    db.insert(users)
      .values({ id: nanoid(), username: 'admin', role: 'admin', passwordHash: legacy.passwordHash })
      .run();
  }
  if (!legacy) {
    db.insert(authConfig).values({ id: 'server', passwordHash: '', secret: randomKey() }).run();
  } else if (!legacy.secret) {
    db.update(authConfig).set({ secret: randomKey() }).where(eq(authConfig.id, 'server')).run();
  }
}
const randomKey = () => randomBytes(32).toString('base64url');
```

Wire in `startServer()` right after the migration block: `const { ensureAuthReady } = await import('./auth/users.js'); ensureAuthReady();` — keep it OUT of `browser/app.ts`.

- [ ] **Step 6: Run the tests → PASS; then `cd server && npx tsc --noEmit && npm test`** (263 must not drop).

- [ ] **Step 7: Commit**

```bash
git add server/src/db server/src/auth/users.ts server/src/auth/users.test.ts server/src/index.ts
git commit -m "feat: users and service-token schema with startup backfill"
```

---

### Task 3: Auth services (users, tokens, per-user sessions)

**Files:**

- Create: `server/src/auth/serviceTokens.ts`
- Modify: `server/src/auth/users.ts` (full account API)
- Modify: `server/src/auth/sessions.ts` (user-scoped sessions; device HMAC via `auth_config.secret`)
- Test: `server/src/auth/users.test.ts` (extend), `server/src/auth/serviceTokens.test.ts`, `server/src/auth/sessions.test.ts` (extend if present, else new)

**Interfaces:**

- Consumes: Task 2's tables + `ensureAuthReady`.
- Produces (exact signatures later tasks rely on):
  - `users.ts`: `interface SessionUser { id: string; username: string; role: 'admin' | 'member' }`; `listUsers(): SessionUser[]`; `createUser(username, password, role): Promise<{ ok: true; user: SessionUser } | { ok: false; error: 'username_taken' | 'invalid_username' }>`; `verifyLogin(username, password): Promise<SessionUser | null>`; `setUserRole(id, role): { ok: boolean; error?: 'last_admin' }`; `resetUserPassword(id, password): Promise<boolean>`; `deleteUser(id, actorId): { ok: boolean; error?: 'self' | 'last_admin' }`; `changeOwnPassword(id, currentPassword, newPassword, keepSessionToken): Promise<{ ok: boolean; error?: 'wrong_password' }>`; `sessionUser(token): SessionUser | null`; `isSetupNeeded(): boolean`.
  - `serviceTokens.ts`: `type Scope = 'service' | 'ingest'`; `mintToken(name: string, scopes: Scope[]): { token: string; id: string }`; `verifyBearer(header: string | undefined): { id: string; name: string; scopes: Scope[] } | null`; `listTokens(): { id, name, scopes, createdAt, lastUsedAt, revokedAt }[]`; `revokeToken(id: string): boolean`.
  - `sessions.ts`: `createSession(userId, userAgent?): { token; expiresAt }`; `listSessions(userId, currentToken)`; `deleteOtherSessions(userId, currentToken): number`; `deleteSessionsForUser(userId): number`; `isValidSession` unchanged in name (now also requires a live user).

- [ ] **Step 1: Failing tests — users API** (extend `users.test.ts`):

```ts
it('creates, verifies and lists users; username is case-insensitively unique', async () => {
  await createUser('Alice', 'long enough password', 'admin');
  expect(await createUser('alice', 'another password!', 'member')).toEqual({
    ok: false,
    error: 'username_taken',
  });
  expect(await verifyLogin('ALICE', 'long enough password')).toMatchObject({ username: 'Alice' });
  expect(await verifyLogin('alice', 'wrong')).toBeNull();
  expect(await verifyLogin('nobody', 'anything')).toBeNull(); // still spends a hash
});
it('refuses to demote or delete the last admin, and refuses self-delete', () => {
  const [admin] = listUsers().filter((u) => u.role === 'admin');
  expect(setUserRole(admin.id, 'member')).toEqual({ ok: false, error: 'last_admin' });
  expect(deleteUser(admin.id, admin.id)).toEqual({ ok: false, error: 'self' });
});
it('deleting a user removes their sessions', async () => {
  /* create user + session, delete, expect isValidSession false */
});
```

- [ ] **Step 2: Failing tests — tokens** (`serviceTokens.test.ts`):

```ts
it('mints a prefixed token, stores only its hash, verifies and lists without the hash', () => {
  const { token, id } = mintToken('paperless webhook', ['ingest']);
  expect(token).toMatch(/^ozb_[A-Za-z0-9_-]{43}$/);
  expect(verifyBearer(`Bearer ${token}`)).toMatchObject({ id, scopes: ['ingest'] });
  expect(listTokens().find((t) => t.id === id)).not.toHaveProperty('tokenHash');
});
it('rejects unknown, malformed and revoked tokens', () => {
  expect(verifyBearer('Bearer ozb_nope')).toBeNull();
  expect(verifyBearer(undefined)).toBeNull();
  const { token, id } = mintToken('t', ['service']);
  revokeToken(id);
  expect(verifyBearer(`Bearer ${token}`)).toBeNull();
});
```

- [ ] **Step 3: Implement** — mirror `password.ts`/`sessions.ts` style. `verifyLogin` hashes a dummy password when the user is missing (copy `checkPassword`'s timing note). Password changes/resets call `deleteSessionsForUser` except the caller's kept token. `verifyBearer` = `createHash('sha256')` lookup + `revokedAt === null`; parse scopes JSON defensively. Sessions: `createSession` writes `userId`; `isValidSession` joins `users` (`users.id = sessions.userId`); device HMAC switches from `authConfig.passwordHash` to `authConfig.secret` (read the fresh row each call).

- [ ] **Step 4: Full server suite + tsc → green** (update the existing `sessions`-asserting tests where signatures changed).

- [ ] **Step 5: Commit** — `git commit -m "feat: user accounts, scoped service tokens and per-user sessions"`

---

### Task 4: Auth routes grow a username (and per-user semantics)

**Files:**

- Modify: `server/src/routes/auth.ts`
- Test: `server/src/routes/auth.test.ts` (update flows + new cases)

**Interfaces:**

- Consumes: Task 3 APIs. Produces (wire contract): `GET /api/auth/status` → `{ enabled, needsSetup, authenticated, user: { id, username, role } | null }`; `POST /api/auth/setup { username, password, setupCode }`; `POST /api/auth/login { username, password }`; `POST /api/auth/change-password { currentPassword, newPassword }` (caller's own); session routes unchanged in shape, now scoped to the caller.

- [ ] **Step 1: Update the existing tests first** — every `setup`/`login` body gains `username: 'owner'`; sign-in assertions read `status.user.username === 'owner'`. Add:

```ts
it('the setup username must be valid and unique', async () => {
  /* POST /setup with 'bad name!' → 400; after setup, a second /setup → 409 */
});
it('two users sign in independently and cannot see each other’s sessions', async () => {
  // admin creates 'member1' via POST /api/users; member1 logs in with its own cookie;
  // GET /api/auth/sessions as member1 lists only member1's sessions
});
it('signing out others never touches another user’s sessions', async () => {
  /* member1 sign-out-others leaves owner cookie valid */
});
```

- [ ] **Step 2: Implement** — `/setup` validates `username` (`z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/)`), replaces the password check with `isSetupNeeded()`, calls `createUser(..., 'admin')`; `/login` keys on `verifyLogin`, error text unchanged (`Incorrect password`) to avoid enumeration; `/status` includes `user` via `sessionUser(token)`; `requireSession` attaches `res.locals.user = sessionUser(token)` (declare `interface AuthedLocals { user?: SessionUser; service?: { name: string; scopes: string[] } }` exported from a shared `server/src/types.ts` and use `Response<unknown, AuthedLocals>` where needed); `signedIn()` helpers return `{ token, user }`.

- [ ] **Step 3: `cd server && npx tsc --noEmit && npm test` → green.**

- [ ] **Step 4: Commit** — `git commit -m "feat: username-based setup and login, per-user sessions"`

---

### Task 5: Admin routes (users + service tokens) and the admin guard

**Files:**

- Create: `server/src/routes/users.ts` (`usersRouter`), `server/src/routes/serviceTokens.ts` (`serviceTokensRouter`)
- Modify: `server/src/index.ts` (mount `app.use('/api/users', usersRouter)` and `app.use('/api/service-tokens', serviceTokensRouter)` after `requireSession`)
- Create: `server/src/middleware/adminGuard.ts` (or export `requireAdmin` from `routes/auth.ts` — pick one, export `requireAdmin: RequestHandler` checking `res.locals.user?.role === 'admin'`, else `403 {"error":"Forbidden"}`)
- Test: `server/src/routes/users.test.ts`, `server/src/routes/serviceTokens.test.ts`

**Interfaces:** consumed by the client in Task 8 — record exact paths:

- `GET /api/users` → `SessionUser[]`; `POST /api/users { username, password, role }` → `201 { user }` | `409 username_taken`; `PATCH /api/users/:id { role }`; `POST /api/users/:id/reset-password { password }`; `DELETE /api/users/:id`.
- `GET /api/service-tokens` → list (no hashes); `POST /api/service-tokens { name, scopes }` → `201 { id, name, scopes, token }` (**only time the token appears**); `DELETE /api/service-tokens/:id` (revoke).

- [ ] **Step 1: Failing tests** — non-admin → 403 on every route; admin CRUD happy paths; last-admin demote → `409 last_admin`; self-delete → `409 self`; token create response contains the token exactly once and list never does.
- [ ] **Step 2: Implement** with zod validation mirroring existing routers' style.
- [ ] **Step 3: `npx tsc --noEmit && npm test` → green.**
- [ ] **Step 4: Commit** — `git commit -m "feat: admin APIs for users and service tokens"`

---

### Task 6: Service-token middleware and the provable sidecar path

**Files:**

- Create: `server/src/middleware/serviceAuth.ts`, `server/src/routes/service.ts` (`serviceRouter`: `GET /whoami`), `server/src/routes/ingest.ts` (`ingestRouter`: `POST /paperless` stub for M2)
- Modify: `server/src/index.ts` — BETWEEN the auth mount and `requireSession`:

```ts
app.use('/api/service', serviceAuth('service'), serviceRouter);
app.use('/api/ingest', serviceAuth('ingest'), ingestRouter);
```

- Test: `server/src/routes/serviceAuth.test.ts` (real-HTTP harness)

**Interfaces:**

- `serviceAuth(requiredScope: Scope): RequestHandler` — skips entirely when `!serverMode`; reads `Authorization: Bearer`; `verifyBearer` → null ⇒ `401 {"error":"Unauthorized"}`; scope missing ⇒ `403 {"error":"Forbidden"}`; on success sets `res.locals.service = { name, scopes }` and touches `last_used_at` (in-memory throttle, mirror `touchSession`).
- `GET /api/service/whoami` → `{ name, scopes }`. `POST /api/ingest/paperless` → `200 {"ok":true}` (stub; a comment marks it as M2's replacement point).

- [ ] **Step 1: Failing tests** — no header → 401; garbage → 401; `ingest` token on `/api/service/whoami` → 403; `service` token → 200 with `{name}`; revoked mid-test → 401; a **session cookie alone** on `/api/service/whoami` → 401 (service routes do not accept cookies); `/api/accounts` with a Bearer header and no cookie → 401 (the bypass is path-scoped, not global).
- [ ] **Step 2: Implement; `npx tsc --noEmit && npm test` → green.**
- [ ] **Step 3: Commit** — `git commit -m "feat: scoped service-token auth for sidecar routes"`
- [ ] **Step 4: Prove the path by hand (the M1 exit check)** — noting the exact commands in the report:

```bash
# against the dev server or the container: mint via the admin API first, then
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7300/api/service/whoami   # {"name":"...","scopes":["service"]}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7300/api/service/whoami   # 401 without the header
```

---

### Task 7: `internalFetch` for allowlisted private hosts

**Files:**

- Create: `server/src/services/internalFetch.ts`
- Modify: `server/src/config.ts` (append):

```ts
/**
 * Private-network hosts internalFetch may reach, comma-separated "host" or "host:port"
 * (e.g. "ohmzbudget,paperless:8000"). Empty = nothing is reachable.
 */
export const internalFetchAllow = (process.env.OHMZBUDGET_INTERNAL_FETCH_ALLOW ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
```

- Test: `server/src/services/internalFetch.test.ts`

**Interfaces:**

- `internalFetch(url: string, init?: RequestInit): Promise<Response>` — http/https only; the URL's `host[:port]` must match an allowlist entry exactly; redirects followed manually (max 5), **every hop re-validated**; `AbortSignal.timeout(30_000)` merged with `init.signal`; response size NOT capped here (callers check) but a comment says so; throws `InternalFetchError extends Error` with `code: 'not_allowed' | 'http_error' | 'too_many_redirects' | 'timeout'`.

- [ ] **Step 1: Failing tests** (spin a `http.createServer` on `127.0.0.1:0` inside the test; set `process.env.OHMZBUDGET_INTERNAL_FETCH_ALLOW` before importing the module — the module reads config at import):

```ts
it('reaches an allowlisted host:port', async () => {
  /* 200 + body */
});
it('refuses a non-allowlisted host before any connection', async () => {
  await expect(internalFetch('http://localhost:9/x')).rejects.toMatchObject({
    code: 'not_allowed',
  });
});
it('refuses a redirect that leaves the allowlist', async () => {
  /* first hop 302 → non-allowlisted host */
});
it('allows a redirect within the allowlist', async () => {
  /* 302 → same server, other path */
});
```

- [ ] **Step 2: Implement** — consciously mirror `safeFetch`'s structure (read `server/src/services/safeFetch.ts` for the redirect loop + error style) but with the opposite admission rule (allowlist of private names instead of public-IP-only).
- [ ] **Step 3: `npx tsc --noEmit && npm test` → green.**
- [ ] **Step 4: Commit** — `git commit -m "feat: internalFetch for allowlisted private hosts"`

---

### Task 8: The client (username login, Users, API tokens)

**Files:**

- Modify: `client/src/api/auth.ts` (`AuthStatus` gains `user: { id; username; role } | null`; `setup(username, password, setupCode)`, `login(username, password)`)
- Create: `client/src/api/users.ts`, `client/src/api/serviceTokens.ts` (thin `apiFetch` wrappers per existing style)
- Modify: `client/src/components/auth/AuthGate.tsx` (`PasswordForm`: `const [username, setUsername] = useState('')`; a Username field ABOVE the password field on BOTH modes — setup label `Username`, login label `Username`, `autoComplete="username"`, hint under setup: `Letters, digits, dots, dashes and underscores.`; disable submit while `!username`; pass to `authApi.setup`/`authApi.login`)
- Create: `client/src/components/settings/UsersSection.tsx`, `client/src/components/settings/ApiTokensSection.tsx`
- Modify: `client/src/components/settings/ServerSettings.tsx` (render the two sections in the server-mode area; both invisible when `useAppMode() !== 'server'`; both hidden for `member` role — read the role from the `auth-status` query the same way other server-mode UI reads status)

**Interfaces:** consumes Task 5's routes; labels the e2e task relies on: buttons `Add user`, `Create token`; fields `Username`, `Password`, `Name`, `Scopes` (two checkboxes labelled `service` and `ingest`); the created token appears in a `role="status"` block with a `Copy` button and the warning `Copy this token now — it will not be shown again.`; row menus `Reset password`, `Make admin` / `Make member`, `Remove user`, `Revoke`.

- [ ] **Step 1: Implement the API wrappers + AuthGate fields** (above).
- [ ] **Step 2: `UsersSection`** — TanStack Query `['users']`; table (Username, Role `Badge`, Created, Last login) using the existing table-row idiom; `Add user` opens the shared `Modal` with username/password/role select; row `RowMenu` per the labels above; destructive ones through `ConfirmModal`. Errors surface via the existing error string convention.
- [ ] **Step 3: `ApiTokensSection`** — query `['service-tokens']`; table (Name, Scopes badges, Created, Last used); create dialog per labels; after create, show the one-time token block; `Revoke` via `ConfirmModal`.
- [ ] **Step 4: Verify** — `cd client && npx tsc --noEmit && npm test && npm run build && npx vite build --mode demo 2>&1 | tail -3` (demo must pass; the sections simply won't render in demo/serve mode).
- [ ] **Step 5: Commit** — `git commit -m "feat: multi-user login, user management and API tokens in the client"`

---

### Task 9: End-to-end coverage for the new identity

**Files:**

- Modify: `e2e/tests/server-mode/auth.spec.ts` (setup form now fills `Username` `'owner'`; `signIn()` fills `Username` `'owner'`; the welcome heading assertion unchanged)
- Modify/Create: `e2e/tests/server-mode/users.spec.ts` (new, serial, sharing the same server fixture pattern)
- Modify: `e2e/global-setup.ts` ONLY if the setup-code flow changed (it should not — setup code handling is untouched)

New coverage (serial with the existing spec's server): admin opens Settings → Server and creates a member `household`; member signs in in a second context and does NOT see `Add user`; admin mints a token named `test-sidecar` with scope `service`; a raw `fetch` from the test (Playwright `request`) to `/api/service/whoami` with `Authorization: Bearer <token>` returns 200 and the name; without the header → 401; after `Revoke` → 401 (poll for the revoke to land); a member's cookie gets 403 from `GET /api/users`.

- [ ] **Step 1: Update + add specs.**
- [ ] **Step 2: Full run** — `cd e2e && npm test` — all four projects green (desktop/phone/demo/server-mode; the known flake pair: isolated re-run evidence, never mask).
- [ ] **Step 3: Commit** — `git commit -m "test: e2e coverage for users, roles and service tokens"`

---

### Task 10: Docs, deploy notes, and the acceptance hook

**Files:**

- Modify: `website/docs/settings.mdx` (Server section: describe accounts, roles, API tokens) and `website/community/self-hosting.mdx` (first-run now creates an admin account; add `OHMZBUDGET_INTERNAL_FETCH_ALLOW` row to the env table)
- Modify: `deploy/.env.example` (add `OHMZBUDGET_INTERNAL_FETCH_ALLOW=` with a comment; it stays unused until M2. Also extend the `OHMZBUDGET_ALLOWED_HOSTS` example/comment to include the compose service hostname `ohmzbudget` — M2's container-to-container calls carry `Host: ohmzbudget:3001` and hostGuard would 403 them without it)
- Do NOT touch: `client/src/utils/project.ts`, the protected domains, `cla.yml`.

- [ ] **Step 1: Edits; `cd website && npm run build 2>&1 | tail -3` → SUCCESS.**
- [ ] **Step 2: Commit** — `git commit -m "docs: multi-user and service-token guidance"`

---

### Task 11: Verification battery and close-out

- [ ] **Step 1: Full battery** (same command set as M0's Task 12): server + client units, tsc ×2, `format:check`, full e2e, `--mode demo` build, website build.
- [ ] **Step 2: Redeploy on the host** — extend the live `deploy/.env` allowlist to `localhost,127.0.0.1,ohmzbudget,budget.example.com`, then `cd deploy && docker compose -f compose.yml -f docker-compose.override.yml up -d --build`; health `{"status":"ok"}`; `/api/auth/status` shows `needsSetup: true` (no account created yet — that is the owner's acceptance-test step); `/api/service/whoami` without a header → 401.
- [ ] **Step 3: Close-out** — tick every checkbox in this plan, append a Close-out section (final shas, evidence, parked items), commit `docs: M1 close-out`, generate the whole-branch review package `git merge-base m0-rebrand HEAD`..HEAD, run the final review + fix wave per the SDD loop, then hand the branch to the controller for the PR.

**M1 exit criteria (spec §7):** new auth + token tests pass; the sidecar-call path is proven via curl (Task 6 Step 4); every suite green; host redeployed.

---

## Plan Set Note

M2 (document bridge) authors its plan on top of this milestone's merged state. The end-goal acceptance test (admin account + sample receipt/bill/statement uploads, samples generated locally) stays queued for the end of M4 per the owner directive.
