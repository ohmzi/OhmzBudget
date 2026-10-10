# OhmzBudget M0 — Rebrand Ship: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Execution Tracker

Maintained between tasks; commit shas live on branch `m0-rebrand`. Owner directive 2026-10-10: autonomous execution, haiku subagents, plan-as-tracker (this table + ticked boxes are the cross-session source of truth).

| Task                                     | Status         | Evidence / commits                                                                                                                          |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Baseline & branch                      | ✅ done        | `m0-rebrand` @ 7c8d00d; server 263/263 · client 85/85 · tsc ✓ · e2e 113/115 (2 pre-existing flakes, pass isolated) · format repaired pre-T2 |
| 2 Root & package manifests               | ✅ done        | f24f917; names + lockfiles name-only; tsc ✓; review clean (0 findings)                                                                      |
| 3 Client display strings & wordmark      | ✅ done        | 1eb58c7; 41 files; greps CLEAN; tsc/85 tests/build/demo ✓; review clean (0 blocking)                                                        |
| 4 Client shell & storage identifiers     | ✅ done        | d7960fd; 5 files; dist scan CLEAN; review clean (0 blocking)                                                                                |
| 5 Server runtime identity                | ⬜ not started |                                                                                                                                             |
| 6 End-to-end tests                       | ⬜ not started |                                                                                                                                             |
| 7 Docker & CI identity                   | ⬜ not started |                                                                                                                                             |
| 8 Electron identity                      | ⬜ not started |                                                                                                                                             |
| 9 Docs, attribution & source links       | ⬜ not started |                                                                                                                                             |
| 10 Website text sweep                    | ⬜ not started |                                                                                                                                             |
| 11 Deploy skeleton & host run            | ⬜ not started |                                                                                                                                             |
| 12 Full verification sweep               | ⬜ not started |                                                                                                                                             |
| 13 GitHub rename & push (pre-authorized) | ⬜ not started |                                                                                                                                             |

**Goal:** Rebrand the `ohmzi/FlyBudget` fork into `ohmzi/OhmzBudget` — full identity sweep, tests updated, own image, deploy skeleton with pinned subnets — ending with the rebranded app running on the homelab host.

**Architecture:** A mechanical-but-thorough rename of a TypeScript monorepo (client / server / electron / e2e / website / docker), done area-by-area with the existing test suite as the regression net at every step. No behavior changes. All persisted identifiers rename freely (fresh start — zero deployments exist).

**Tech Stack:** React 19 + Vite, Express 5 + better-sqlite3 + Drizzle, Vitest (+ fast-check) and Playwright, Docker, GitHub Actions, Electron (identity only — builds deferred).

**Spec:** `docs/superpowers/specs/2026-10-10-ohmzbudget-design.md`

## Global Constraints

- **Name map (exact):** display `FlyBudget` → `OhmzBudget`; slug `flybudget` → `ohmzbudget`; env prefix `FLYBUDGET_*` → `OHMZBUDGET_*`; cookies `ohmzbudget_session` / `ohmzbudget_device` / `ohmzbudget_token`; IndexedDB `ohmzbudget-offline`; outbox channel/lock `ohmzbudget-outbox`; SW cache `ohmzbudget-app-v1` + purge prefix `ohmzbudget-`; backup marker `ohmzbudget-backup`; version env `OHMZBUDGET_VERSION`; client global `__OHMZBUDGET_VERSION__`; image `ghcr.io/ohmzi/ohmzbudget`; packages `ohmzbudget`, `ohmzbudget-client`, `ohmzbudget-server`, `ohmzbudget-e2e`, `ohmzbudget-website`; electron appId `com.ohmzi.ohmzbudget`, productName `OhmzBudget`, executableName `ohmzbudget`, artifacts `OhmzBudget-*`; GitHub `ohmzi/OhmzBudget`.
- **Keep unchanged:** `budget.db` filename; `LICENSE` (byte-identical); `CLA.md` + `.github/workflows/cla.yml` (legal review pending — do not touch or present as ours); third-party product names in docs (Firefly III, Actual Budget — comparisons, never rename); Font Awesome / Inter attribution lines; website blog filename `2026-10-01-welcome-to-flybudget.mdx` (URL slug) and `website/static/img/screenshots/`.
- **AGPL-3.0-only:** rebrand allowed; attribution kept; add `NOTICE`; `client/src/utils/project.ts` `SOURCE_CODE_URL`/`ISSUES_URL` repoint to the fork. `WEBSITE_URL`/`DOCS_URL`/`SELF_HOSTING_URL` point at the fork repo for now (that website is tier-2).
- **Domains:** never blanket-replace `flybudget.org` — it changes only where explicitly stated (`client/src/utils/project.ts`, Task 9). Every other sweep excludes or protects the domain string.
- **Conventional commits** per the repo's table. One sweep area per commit.
- **Do not** change dependency versions, `engines`, `.npmrc` policies, or CI workflows' behavior beyond the listed renames. **Do not** push anything or rename the GitHub repo until Task 13's explicit owner gate.
- `--mode demo` client build must keep passing after every client task; the demo worker must not gain Node-dependent code.

## Review Focus

These are the failure modes this plan's tests pin down; an executor must not shortcut them:

1. **Missed old-name strings** in UI/tests that keep showing "FlyBudget" after the sweep — each sweep task ends with a zero-hit `grep` in its area, not just tests passing.
2. **Cookie/env mismatches** between `electron/main.ts` and `server/src/middleware/security.ts` / `sessions.ts` (they must stay in sync) — server tests + grep both check.
3. **Version plumbing drift** — `OHMZBUDGET_VERSION` env (Dockerfile esbuild `--define`), `__OHMZBUDGET_VERSION__` (Vite define), `utils/version.ts`, `/api/server/info` must all agree after rename.
4. **Backup marker rename consistency** — `backupService.ts`, its tests, and e2e `data.spec.ts` must all assert `ohmzbudget-backup`; old backups are intentionally unreadable (fresh start).
5. **Renamed container/secret names** breaking the documented `docker exec ohmzbudget …` maintenance commands and healthcheck — the Task 7 docker run and Task 11 host run check both.

---

### Task 1: Baseline & working branch

**Files:** none (git ops only)

- [x] **Step 1: Land the spec and branch**

```bash
cd ~/StudioProjects/OhmzBudget
git checkout main && git merge --ff-only design-spec && git checkout -b m0-rebrand
```

- [x] **Step 2: Install dependencies**

```bash
npm ci && (cd client && npm ci) && (cd server && npm ci) && (cd e2e && npm ci)
```

- [x] **Step 3: Record a green baseline**

```bash
(cd server && npm test) && (cd client && npm test) && (cd client && npx tsc --noEmit) && (cd server && npx tsc --noEmit) && npm run format:check
```

Expected: all pass. If anything fails **before** any change, stop and report — the baseline is broken.
Note the server test count; it must not drop later.

- [x] **Step 4: (Optional but recommended) e2e baseline** — ran; 113/115, 2 pre-existing flakes (both pass on isolated re-run)

```bash
cd e2e && npx playwright install chromium && npm test
```

Expected: all pass. If this is skipped, the Task 6 e2e run is also the first full run — treat failures there accordingly.

- [x] **Step 5: Commit nothing** — this task is setup; proceed to Task 2 on branch `m0-rebrand`.

---

### Task 2: Root & package manifests

**Files:**

- Modify: `package.json` (root), `client/package.json`, `server/package.json`, `e2e/package.json`, `website/package.json`
- Modify (regenerated): all matching `package-lock.json`

- [x] **Step 1: Rename the package names + repo metadata**

Root `package.json`: `"name": "ohmzbudget"`, `"desktopName": "ohmzbudget.desktop"` (root), and update `description` / `repository` / `homepage` / `bugs` / `author` URL fields to `https://github.com/ohmzi/OhmzBudget`. Same `name` rename per dir: `ohmzbudget-client`, `ohmzbudget-server`, `ohmzbudget-e2e`, `ohmzbudget-website`. Use `npm pkg set name=ohmzbudget-client` inside each dir (root: `npm pkg set name=ohmzbudget`). Do **not** touch version, engines, dependencies.

- [x] **Step 2: Resync lockfiles**

```bash
npm install --package-lock-only --ignore-scripts && (cd client && npm install --package-lock-only --ignore-scripts) && (cd server && npm install --package-lock-only --ignore-scripts) && (cd e2e && npm install --package-lock-only --ignore-scripts) && (cd website && npm install --package-lock-only --ignore-scripts)
```

- [x] **Step 3: Verify**

```bash
grep -rn '"name"' package.json client/package.json server/package.json e2e/package.json website/package.json | grep -v ohmzbudget || echo CLEAN
(cd client && npx tsc --noEmit) && (cd server && npx tsc --noEmit)
```

- [x] **Step 4: Commit** (landed as f24f917)

```bash
git add package.json package-lock.json client server e2e website
git commit -m "chore: rename packages and metadata to ohmzbudget"
```

---

### Task 3: Client display strings & wordmark

**Files:**

- Modify: `client/src/components/ui/BrandName.tsx` (wordmark: render `Ohmz` + `Budget`; rename prop `flyClassName` → `ohmzClassName` and its usages)
- Modify: all files under `client/src` containing `FlyBudget` (~39 files, ~91 hits — e.g. `Sidebar`, `AppShell`, `Welcome`, `AuthGate` "Set up your OhmzBudget server"/"Sign in to OhmzBudget", `ReconnectScreen`, `ConnectionBanner`, `SavingPausedHint`, `DemoBanner`, `NotInDemo`, `ServerSettings`, `DataExport`, `HelpFooter`, `MerchantSelect`, `WaitingTransactions`, plaid/simplefin cards, `api/client.ts` error text)
- Modify: `client/vite.config.ts` (define `__FLYBUDGET_VERSION__` → `__OHMZBUDGET_VERSION__`) — **same commit**, so the tree never carries a renamed usage without its define (tsc/build would fail)
- Test: client tests asserting display strings (run all; fix hits)

- [x] **Step 1: Case-sensitive sweep (order matters — display name first; `project.ts` excluded)**

```bash
cd ~/StudioProjects/OhmzBudget
grep -rln 'FlyBudget' client/src --exclude=project.ts | xargs sed -i 's/FlyBudget/OhmzBudget/g'
grep -rln 'flybudget' client/src --exclude=project.ts | xargs sed -i 's/flybudget/ohmzbudget/g'
sed -i 's/__FLYBUDGET_VERSION__/__OHMZBUDGET_VERSION__/g' client/vite.config.ts
```

Note: this also renames storage identifiers and plugin names in `client/src` — Task 4 verifies those specifically (storage.ts / outbox.ts). `client/src/utils/project.ts` carries the only `flybudget.org` URLs and is handled deliberately in Task 9 — never blanket-replace the domain.

- [x] **Step 2: Wordmark component (manual edit)**

`BrandName.tsx` renders two spans so the brand color applies to "Fly" today. Change to `Ohmz` + `Budget` and rename the prop through all usages:

```tsx
// before: <span className={flyClassName}>Fly</span><span className={budgetClassName}>Budget</span>
// after:  <span className={ohmzClassName}>Ohmz</span><span className={budgetClassName}>Budget</span>
```

- [x] **Step 3: Verify zero hits + tests**

```bash
grep -rn 'FlyBudget\|flybudget' client/src --exclude=project.ts || echo CLEAN   # project.ts keeps its URL constants until Task 9
cd client && npx tsc --noEmit && npm test && npm run build
npx vite build --mode demo 2>&1 | tail -3   # demo build must pass
```

- [x] **Step 4: Commit** (landed as 1eb58c7)

```bash
git add client && git commit -m "refactor: rebrand client display strings to OhmzBudget"
```

---

### Task 4: Client shell & storage identifiers

**Files:**

- Modify: `client/index.html` (`<title>`, favicon alt text), `client/public/sw.js` (cache `ohmzbudget-app-v1`, purge prefix `ohmzbudget-`; **add**: on activate, also delete legacy `flybudget-app-v1` cache so stale clients self-heal), `client/vite.config.ts` (plugin names `ohmzbudget-demo-*`, define `__OHMZBUDGET_VERSION__`), `client/src/offline/storage.ts` (IndexedDB `ohmzbudget-offline`), `client/src/offline/outbox.ts` (BroadcastChannel + Web Lock `ohmzbudget-outbox`)
- Modify: wherever the client reads the version global (grep `__FLYBUDGET_VERSION__` / `__OHMZBUDGET_VERSION__`)
- Replace: `client/public/logo.png` with a placeholder mark — the upstream logo must come off product surfaces (the favicon reference keeps pointing at `logo.png`). `electron/resources/` icons stay untouched for now (builds deferred).

- [x] **Step 1: Confirm the Task 3 sweep covered the identifiers, then fix leftovers**

```bash
grep -rn 'flybudget' client/public client/vite.config.ts client/index.html client/src/offline || echo CLEAN
grep -rn '__FLYBUDGET_VERSION__\|FLYBUDGET_VERSION' client server Dockerfile || echo CLEAN
```

Replace any remaining `__FLYBUDGET_VERSION__` → `__OHMZBUDGET_VERSION__` (vite define + all readers) and ensure `sw.js` purges both cache-name generations on activate.

- [x] **Step 2: Placeholder logo**

```bash
python3 - <<'PY'
from PIL import Image, ImageDraw
img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, 511, 511], radius=96, fill=(37, 99, 235, 255))   # --color-brand-600
d.ellipse([136, 136, 376, 376], outline=(255, 255, 255, 255), width=28)
d.ellipse([206, 206, 306, 306], fill=(255, 255, 255, 255))
img.save('client/public/logo.png')
print('placeholder logo written')
PY
```

A real OhmzBudget logo is a tier-2 design task.

- [x] **Step 3: Verify**

```bash
cd client && npx tsc --noEmit && npm test && npm run build && npx vite build --mode demo 2>&1 | tail -3
```

- [x] **Step 4: Commit** (landed as d7960fd)

```bash
git add client server/src/browser/app.ts && git commit -m "refactor: rename client shell, sw cache and storage identifiers"
```

---

### Task 5: Server runtime identity

**Files:**

- Modify: `server/src/config.ts` (`FLYBUDGET_SERVER_MODE|HOST|ALLOWED_HOSTS|TRUST_PROXY|API_TOKEN|DATA_KEY|DATA_KEY_FILE|VERSION` → `OHMZBUDGET_*`), `server/src/middleware/security.ts` (cookie `ohmzbudget_token`), `server/src/auth/sessions.ts` (`ohmzbudget_session`, `ohmzbudget_device`), `server/src/index.ts` (messages, env refs), `server/src/db/secretCrypto.ts`, `server/src/auth/setupCode.ts` (log message), `server/src/utils/version.ts` (`OHMZBUDGET_VERSION`), `server/src/routes/server.ts` (`securityChecks` hint strings name the new env vars), `server/src/services/backupService.ts` (`BACKUP_FORMAT = 'ohmzbudget-backup'`), `server/src/services/plaidService.ts` (Plaid `client_name: 'OhmzBudget'`; leave `client_user_id: 'local-user'` untouched)
- Modify (same commit — they assert the old names): `server/src/routes/auth.test.ts`, `server/src/routes/server.test.ts`, `server/src/routes/backup.test.ts`, `server/src/middleware/security.serverMode.test.ts`, `server/src/middleware/security.test.ts`
- Sweep: any remaining `FlyBudget|flybudget` under `server/`

- [ ] **Step 1: Mechanical sweep, then hand-fix**

```bash
cd ~/StudioProjects/OhmzBudget
grep -rl 'FLYBUDGET' server | xargs sed -i 's/FLYBUDGET_/OHMZBUDGET_/g'
grep -rl 'flybudget' server | xargs sed -i 's#flybudget\.org#@@KD@@#g; s/flybudget/ohmzbudget/g; s/@@KD@@/flybudget.org/g'   # domain-protective (Global Constraints)
```

Hand-check the four hand-written migrations' comments and `server/src/routes/server.ts` `securityChecks` (env-var names in user-facing hints).

- [ ] **Step 2: Update tests asserting old names** — set them to the new cookie names, env vars, backup marker, and messages in this same commit.

- [ ] **Step 3: Verify**

```bash
grep -rn 'FlyBudget\|flybudget\|FLYBUDGET' server || echo CLEAN
cd server && npx tsc --noEmit && npm test
```

- [ ] **Step 4: Commit**

```bash
git add server && git commit -m "refactor: rename server identity, env prefix, cookies and backup marker"
```

---

### Task 6: End-to-end tests

**Files:**

- Modify: `e2e/global-setup.ts` (env vars, `ohmzbudget_token` cookie header, `ohmzbudget-e2e-*` tmp dirs, backup format fixture), `e2e/tests/server-mode/auth.spec.ts` ("Set up your OhmzBudget server" / "Sign in to OhmzBudget"), `e2e/tests/connection.spec.ts` ("Can't reach OhmzBudget"), `e2e/tests/data.spec.ts` ("not an OhmzBudget backup file", `{format:'ohmzbudget-backup'}`), and the rest — `demo/demo.spec.ts`, `navigation.spec.ts`, `accounts.spec.ts`, `security.spec.ts`, `settings.spec.ts`, `phone/*` — any spec asserting old names (the sweep below catches them all)

- [ ] **Step 1: Sweep**

```bash
cd ~/StudioProjects/OhmzBudget
grep -rl 'FlyBudget' e2e | xargs sed -i 's/FlyBudget/OhmzBudget/g'
grep -rl 'flybudget' e2e | xargs sed -i 's/flybudget/ohmzbudget/g'
grep -rl 'FLYBUDGET' e2e | xargs sed -i 's/FLYBUDGET_/OHMZBUDGET_/g'
grep -rl 'flybudget' e2e | xargs sed -i 's#flybudget\.org#@@KD@@#g; s/flybudget/ohmzbudget/g; s/@@KD@@/flybudget.org/g'   # domain-protective
```

- [ ] **Step 2: Full e2e run (desktop + phone + demo + server-mode)**

```bash
grep -rn 'FlyBudget\|flybudget\|FLYBUDGET' e2e || echo CLEAN
cd e2e && npm test
```

Expected: all projects pass, including the phone overflow checks and demo checks. This is the strongest rebrand regression net.

- [ ] **Step 3: Commit**

```bash
git add e2e && git commit -m "test: update e2e suite for ohmzbudget identifiers"
```

---

### Task 7: Docker & CI identity

**Files:**

- Modify: `Dockerfile` (comments, `ENV OHMZBUDGET_*`, esbuild `--define:OHMZBUDGET_VERSION`), `docker-compose.yml` (service/container `ohmzbudget`, image `ghcr.io/ohmzi/ohmzbudget`, volume `ohmzbudget-data`, secret `ohmzbudget_data_key` + file `ohmzbudget_data_key.txt`, env, header comments), `docker/backup.cjs`, `docker/reset-password.cjs` (messages: `docker exec ohmzbudget …`), `.github/workflows/docker.yml` (`IMAGE=ghcr.io/ohmzi/ohmzbudget`, `org.opencontainers.image.title=OhmzBudget` + description, smoke-test `docker exec ohmzbudget` commands), `.github/workflows/release.yml` (artifact paths/names `OhmzBudget-*.exe/.dmg/.deb/.AppImage`, release title, kill commands in comments)
- Do **not** modify: `.github/workflows/cla.yml`

- [ ] **Step 1: Sweep + hand-check**

```bash
grep -rl 'FlyBudget' Dockerfile docker-compose.yml docker .github | xargs sed -i 's/FlyBudget/OhmzBudget/g'
grep -rl 'flybudget' Dockerfile docker-compose.yml docker .github | xargs sed -i 's#flybudget\.org#@@KD@@#g; s/flybudget/ohmzbudget/g; s/@@KD@@/flybudget.org/g'   # domain-protective
grep -rl 'FLYBUDGET' Dockerfile docker-compose.yml docker .github | xargs sed -i 's/FLYBUDGET_/OHMZBUDGET_/g'
grep -rn 'FlyBudget\|flybudget\|FLYBUDGET' Dockerfile docker-compose.yml docker .github | grep -v cla.yml || echo CLEAN
```

- [ ] **Step 2: Build and smoke-test the container**

```bash
cd ~/StudioProjects/OhmzBudget
docker build -t ohmzbudget:test .
printf '%s' "$(openssl rand -base64 32)" > /tmp/ohmzbudget_data_key.txt && chmod 400 /tmp/ohmzbudget_data_key.txt
docker run --rm -d --name ohmzbudget-smoke -p 127.0.0.1:17300:3001 \
  -e OHMZBUDGET_SERVER_MODE=true -e OHMZBUDGET_HOST=0.0.0.0 \
  -e OHMZBUDGET_DATA_KEY_FILE=/run/secrets/key \
  -v /tmp/ohmzbudget_data_key.txt:/run/secrets/key:ro -v /tmp/ohmzbudget-smoke-data:/data ohmzbudget:test
for i in $(seq 1 15); do curl -sf http://127.0.0.1:17300/api/health && break; sleep 2; done
docker rm -f ohmzbudget-smoke
```

Expected: `{"status":"ok"}` exactly.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml docker .github
git commit -m "build: rename docker and CI identity to ohmzbudget"
```

---

### Task 8: Electron identity (identity only — builds deferred)

**Files:**

- Modify: `electron-builder.json` (`appId: "com.ohmzi.ohmzbudget"`, `productName: "OhmzBudget"`, artifactName patterns `OhmzBudget-*`, `executableName: "ohmzbudget"`, vendor/maintainer/linux synopsis/description), `electron/main.ts` (messages, cookie `ohmzbudget_token` — **must match** `server/src/middleware/security.ts`; `OHMZBUDGET_*` env), `electron/package.json` (name via Task 2), any `FlyBudget` strings

- [ ] **Step 1: Sweep + hand-check the cookie name pair**

```bash
grep -rl 'FlyBudget' electron | xargs sed -i 's/FlyBudget/OhmzBudget/g'
grep -rl 'flybudget' electron | xargs sed -i 's/flybudget/ohmzbudget/g'
grep -rl 'FLYBUDGET' electron | xargs sed -i 's/FLYBUDGET_/OHMZBUDGET_/g'
grep -rl 'flybudget' electron | xargs sed -i 's#flybudget\.org#@@KD@@#g; s/flybudget/ohmzbudget/g; s/@@KD@@/flybudget.org/g'   # domain-protective
grep -rn 'ohmzbudget_token' electron/main.ts server/src/middleware/security.ts   # both files must show it
```

- [ ] **Step 2: Verify**

```bash
grep -rn 'FlyBudget\|flybudget\|FLYBUDGET' electron || echo CLEAN
cd electron && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron && git commit -m "refactor: rename electron app identity (installers deferred)"
```

---

### Task 9: Repo docs, attribution & source links (AGPL)

**Files:**

- Modify: `README.md` (title, badges → fork URLs, docker commands), `SECURITY.md` (advisory link → fork), `CONTRIBUTING.md`, `PLANNING.md`, `AGENTS.md` **and** `CLAUDE.md` (keep them byte-identical — repo rule), `client/src/utils/project.ts` (`SOURCE_CODE_URL=https://github.com/ohmzi/OhmzBudget`, `ISSUES_URL=…/issues`, `WEBSITE_URL`/`DOCS_URL`/`SELF_HOSTING_URL` → fork repo for now; **keep** `LICENSE_URL`)
- Create: `NOTICE`
- Do **not** modify: `LICENSE`, `CLA.md`, `website/blog/…-welcome-to-flybudget.mdx`

- [ ] **Step 1: Doc sweeps (README/SECURITY/CONTRIBUTING/PLANNING/AGENTS+CLAUDE, case-sensitive order)**

```bash
grep -rl 'FlyBudget' README.md SECURITY.md CONTRIBUTING.md PLANNING.md AGENTS.md CLAUDE.md | xargs sed -i 's/FlyBudget/OhmzBudget/g'
grep -rl 'flybudget' README.md SECURITY.md CONTRIBUTING.md PLANNING.md AGENTS.md CLAUDE.md | xargs sed -i 's#flybudget\.org#@@KD@@#g; s/flybudget/ohmzbudget/g; s/@@KD@@/flybudget.org/g'   # domain-protective
grep -rl 'FLYBUDGET' README.md SECURITY.md CONTRIBUTING.md PLANNING.md AGENTS.md CLAUDE.md | xargs sed -i 's/FLYBUDGET_/OHMZBUDGET_/g'
grep -rl 'dtymoszenko/FlyBudget\|dtymoszenko/flybudget' README.md SECURITY.md CONTRIBUTING.md AGENTS.md CLAUDE.md website/sidebarsCommunity.ts | xargs sed -i 's#dtymoszenko/[Ff]ly[Bb]udget#ohmzi/OhmzBudget#g'
```

(SECURITY-related comparison content and upstream credit lines stay in NOTICE and in prose; badge/issue links repoint.)

- [ ] **Step 2: Fix `project.ts` targets precisely** — edit the constants so `SOURCE_CODE_URL` and `ISSUES_URL` are `https://github.com/ohmzi/OhmzBudget` and `…/issues`; `WEBSITE_URL`, `DOCS_URL`, `SELF_HOSTING_URL` point at the fork repo (the Docusaurus site is tier-2); `LICENSE_URL` stays as-is.

```bash
grep -n 'URL =' client/src/utils/project.ts
```

- [ ] **Step 3: Write `NOTICE`**

```markdown
# NOTICE

OhmzBudget is a rebranded fork of FlyBudget (https://github.com/dtymoszenko/FlyBudget),
Copyright David Tymoszenko and contributors, licensed AGPL-3.0-only. The LICENSE file is
kept unchanged and the original project is credited here. OhmzBudget's own source is
published at https://github.com/ohmzi/OhmzBudget, satisfying AGPL section 13 for network users.

OhmzBudget runs paperless-ngx (https://github.com/paperless-ngx/paperless-ngx, GPL-3.0-only)
as a separate, unmodified service.
```

- [ ] **Step 4: Verify + commit**

```bash
grep -n 'flybudget.org' client/src/utils/project.ts && echo 'FAIL: project.ts still points at flybudget.org' || echo OK
grep -c 'flybudget.org' README.md   # may stay >0: README keeps upstream-site links; NOTICE covers attribution
diff AGENTS.md CLAUDE.md    # no output — they must stay identical
git add README.md SECURITY.md CONTRIBUTING.md PLANNING.md AGENTS.md CLAUDE.md client/src/utils/project.ts NOTICE website/sidebarsCommunity.ts
git commit -m "docs: rebrand documentation, attribution and source links"
```

---

### Task 10: Website text sweep (screenshots & blog slug excluded)

**Files:** Modify text in `website/docs/` (19 files incl. `self-hosting.mdx` `FLYBUDGET_*` env names), `website/community/`, `website/tour/` front matter + `website/sidebars*.ts` labels, `website/docusaurus.config.ts` (title/tagline/url/organizationName `ohmzi`/projectName `OhmzBudget`/navbar/`editUrl`/footer copyright — keep `defaultLocale`), `website/src/pages/index.tsx`, `website/src/pages/download.tsx` (REPO + artifact filenames `OhmzBudget-*`), `website/src/theme/Logo/index.tsx` (wordmark spans `Ohmz`)

**Do not touch:** `website/static/img/screenshots/**`, `website/blog/*.mdx` filename, `website/static/img/logo.png` (assets are tier-2)

- [ ] **Step 1: Sweep + hand-check docusaurus.config.ts editUrl ×4 and footer**

```bash
grep -rl 'FlyBudget' website --include='*.mdx' --include='*.ts' --include='*.tsx' --include='*.css' | xargs sed -i 's/FlyBudget/OhmzBudget/g'
# protect the domain while renaming the slug:
grep -rl 'flybudget' website --include='*.mdx' --include='*.ts' --include='*.tsx' --include='*.css' | xargs sed -i 's#flybudget\.org#@@KD@@#g; s/flybudget/ohmzbudget/g; s/@@KD@@/flybudget.org/g'
grep -rl 'FLYBUDGET' website --include='*.mdx' --include='*.ts' --include='*.tsx' --include='*.css' | xargs sed -i 's/FLYBUDGET_/OHMZBUDGET_/g'
grep -rl 'dtymoszenko' website --include='*.ts' --include='*.tsx' --include='*.mdx' | xargs sed -i 's#dtymoszenko/[Ff]ly[Bb]udget#ohmzi/OhmzBudget#g'
grep -rn 'dtymoszenko' website --include='*.ts' --include='*.tsx' --include='*.mdx' || echo CLEAN
```

The `url:` value in `docusaurus.config.ts` and other `flybudget.org` domains stay untouched in M0 (the site is not deployed; domains are decided at tier-2).

- [ ] **Step 2: Verify the site still builds**

```bash
cd website && npm ci && npm run build 2>&1 | tail -5   # build = build:demo (client --mode demo) + docusaurus build
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add website && git commit -m "docs: sweep website text for ohmzbudget (screenshots deferred)"
```

---

### Task 11: Deploy skeleton & host run

**Files:**

- Create: `deploy/compose.yml`, `deploy/docker-compose.override.yml`, `deploy/.env.example`, `deploy/README.md`, `deploy/.gitignore` (contents: `secrets/`)
- Compose secrets pattern (host): `deploy/secrets/ohmzbudget_data_key` (chmod 400)

- [ ] **Step 1: Write `deploy/compose.yml`** (service skeleton — paperless stack lands in M2 with the same conventions):

```yaml
name: ohmzbudget
services:
  ohmzbudget:
    build:
      context: ..
      dockerfile: Dockerfile
    image: ohmzbudget:local
    container_name: ohmzbudget
    restart: unless-stopped
    environment:
      OHMZBUDGET_SERVER_MODE: 'true'
      OHMZBUDGET_HOST: '0.0.0.0'
      OHMZBUDGET_DATA_KEY_FILE: '/run/secrets/ohmzbudget_data_key'
      OHMZBUDGET_ALLOWED_HOSTS: '${OHMZBUDGET_ALLOWED_HOSTS:-localhost,127.0.0.1}'
      OHMZBUDGET_TRUST_PROXY: 'true'
    ports:
      - '127.0.0.1:7300:3001'
    volumes:
      - ohmzbudget-data:/data
    secrets:
      - ohmzbudget_data_key
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: 30s
      timeout: 5s
      retries: 3
    read_only: true
    tmpfs: ['/tmp']
    security_opt: ['no-new-privileges:true']
    cap_drop: ['ALL']
volumes:
  ohmzbudget-data:
networks:
  default:
    name: ohmzbudget_default
secrets:
  ohmzbudget_data_key:
    file: ./secrets/ohmzbudget_data_key
```

- [ ] **Step 2: Write `deploy/docker-compose.override.yml`** (pinned subnet — Docker address pools on this host are exhausted; untracked-style pattern like VoiceStudio):

```yaml
# Pinned because this host's Docker default address pools are exhausted.
networks:
  default:
    ipam:
      config:
        - subnet: 10.88.0.0/24
```

- [ ] **Step 3: Deploy and verify on the host**

```bash
cd deploy && mkdir -p secrets
[ -f secrets/ohmzbudget_data_key ] || { openssl rand -base64 32 > secrets/ohmzbudget_data_key; }
chmod 400 secrets/ohmzbudget_data_key
docker compose -f compose.yml -f docker-compose.override.yml up -d --build
for i in $(seq 1 20); do curl -sf http://127.0.0.1:7300/api/health && break; sleep 2; done   # expect {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7300/   # expect 200 (login screen)
```

- [ ] **Step 4: Commit** (the generated secret stays untracked via `deploy/.gitignore` containing `secrets/`)

```bash
cd .. && git add deploy && git commit -m "build: add deploy compose skeleton with pinned subnet"
```

- [ ] **Step 5: Owner step (report, don't block)** — the cloudflared route `budget.example.com → http://localhost:7300` is a Cloudflare dashboard action; note it for the owner in the task result.

---

### Task 12: Full verification sweep

**Files:** none (verification + any leftover strings this catches, each as its own fix-commit)

- [ ] **Step 1: Repo-wide residual scan (expected keeps only)**

```bash
cd ~/StudioProjects/OhmzBudget
grep -rIn 'FlyBudget\|flybudget\|FLYBUDGET' --exclude-dir={.git,node_modules,dist,build,.docusaurus,static,coverage} . | grep -vE 'CLA\.md|LICENSE|NOTICE|welcome-to-flybudget|flybudget-app-v1|/tmp/' || echo CLEAN
```

Expected leftovers: only `CLA.md` (kept), `website/blog/…welcome-to-flybudget.mdx` (slug kept), and `client/public/sw.js`'s `LEGACY_CACHE = 'flybudget-app-v1'` literal (the mandated stale-client purge needs the old cache name). Generated dirs (`website/build`, `website/.docusaurus`, `website/static/demo`, `client/dist`, `server/dist`) are excluded. Anything else — fix in a `fix:` commit and re-run.

- [ ] **Step 2: Full local battery**

```bash
(cd server && npm test) && (cd client && npm test) && (cd client && npx tsc --noEmit) && (cd server && npx tsc --noEmit) && npm run format:check && (cd e2e && npm test)
```

- [ ] **Step 3: Demo + website builds**

```bash
(cd client && npx vite build --mode demo 2>&1 | tail -3) && (cd website && npm run build 2>&1 | tail -3)
```

- [ ] **Step 4: Container + health on the host (re-run Task 11 Step 3) and `/api/server/info` version check**

```bash
curl -s http://127.0.0.1:7300/api/server/info | head -c 300   # after login it reports version (Task 11's instance)
```

If a version shows blank/undefined, the version plumbing (Review Focus #3) regressed — fix before proceeding.

---

### Task 13: GitHub rename & push (OWNER GATE — stop and ask)

**Files:** none (git/gh ops)

- [ ] **Step 1: STOP. Ask the owner explicitly:** "Rename `ohmzi/FlyBudget` → `ohmzi/OhmzBudget` on GitHub now and push `main`, `design-spec`, `m0-rebrand`? (Old URLs redirect.)" Wait for an explicit yes.

- [ ] **Step 2: Rename + repoint remote** (API call — deterministic, no interactive prompt; old URLs redirect after ~a minute)

```bash
gh api --method PATCH repos/ohmzi/FlyBudget -f name=ohmzbudget
cd ~/StudioProjects/OhmzBudget && git remote set-url origin https://github.com/ohmzi/OhmzBudget.git && git remote -v
```

- [ ] **Step 3: Push branches** (the push triggers CI + the docker workflow on the fork)

```bash
git push -u origin main && git push origin design-spec m0-rebrand
```

- [ ] **Step 4: Watch CI**

```bash
gh run list -R ohmzi/OhmzBudget --limit 10
```

Expect CI and docker workflow runs from the push; the docker workflow builds + smoke-tests the image and publishes nothing without a `v*` tag.

- [ ] **Step 5: Report** — CI status, image workflow result, and confirm the redirect from the old repo URL works (`gh repo view ohmzi/FlyBudget` resolves).

**M0 exit criteria (spec §7):** CI green (vitest + Playwright + format/tsc), `--mode demo` build passes, OhmzBudget runs on the host, tunnel reachable (owner dashboard route).

---

## Plan Set Note

**Owner directive (2026-10-10):** at the end of the build (M4 or the furthest milestone reached), run an acceptance test — create the admin account, upload one sample receipt, one bill, and one statement, and verify the data feeds into the ledger and archive. Sample files are generated locally (avoids sourcing real/PII documents).

M1 (identity & plumbing: multi-user, service tokens, internalFetch), M2 (document bridge), M3 (statement import) and M4 (reconciliation) get their own detailed plans authored as each predecessor lands — their concrete code depends on the actual M0 delta and upstream movement. The spec §7 milestone table is the authoritative roadmap in the meantime.
