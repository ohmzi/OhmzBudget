import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Server mode is read from the environment when modules load, so set it first
process.env.OHMZBUDGET_SERVER_MODE = 'true';

const express = (await import('express')).default;
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { requireSession } = await import('./auth.js');
const { requireAdmin } = await import('../middleware/adminGuard.js');
const { serviceAuth } = await import('../middleware/serviceAuth.js');
const { serviceRouter } = await import('./service.js');
const { ingestRouter } = await import('./ingest.js');
const { serviceTokensRouter } = await import('./serviceTokens.js');
const { accountsRouter } = await import('./accounts.js');
const { createSession } = await import('../auth/sessions.js');
const { createUser, ensureAuthReady } = await import('../auth/users.js');

// The machine-caller path (Task 6): scoped bearer tokens reach only the sidecar routes,
// over real HTTP against an app mounted exactly like index.ts does — the service mounts
// sit between /api/auth and `app.use('/api', requireSession)`, which is what makes them a
// path-scoped bypass of the session gate and nothing more.

let server: Server;
let base: string;
let adminCookie = '';
let serviceToken: { id: string; token: string };
let ingestToken: { id: string; token: string };

const get = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers });
const post = (path: string, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers });

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  ensureAuthReady(); // fills auth_config.secret, like server startup

  const admin = await createUser('owner', 'owner password 123', 'admin');
  if (!admin.ok) throw new Error('failed to create the test account');
  adminCookie = `ohmzbudget_session=${createSession(admin.user.id, 'test browser').token}`;

  const app = express();
  app.use(express.json());
  // Exactly the index.ts mount order: the token routes and the session gate, then the rest
  app.use('/api/service', serviceAuth('service'), serviceRouter);
  app.use('/api/ingest', serviceAuth('ingest'), ingestRouter);
  app.use('/api', requireSession);
  app.use('/api/service-tokens', requireAdmin, serviceTokensRouter);
  app.use('/api/accounts', accountsRouter);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  // Minted through the admin API, the way the by-hand proof does it
  const mint = async (name: string, scopes: string[]) => {
    const res = await fetch(`${base}/service-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ name, scopes }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; token: string };
  };
  serviceToken = await mint('sidecar', ['service']);
  ingestToken = await mint('paperless webhook', ['ingest']);
});
afterAll(() => server.close());

describe('service token middleware', () => {
  it('answers 401 to a request with no Authorization header', async () => {
    const res = await get('/service/whoami');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('answers 401 to a malformed Authorization header', async () => {
    const headers = ['garbage', 'Bearer', 'Bearer ', 'Token abc', 'Basic abc', 'bearer abc'];
    for (const authorization of headers) {
      const res = await get('/service/whoami', { authorization });
      expect(res.status, authorization).toBe(401);
      expect(await res.json(), authorization).toEqual({ error: 'Unauthorized' });
    }
  });

  it('answers 401 to an unknown or non-token bearer', async () => {
    for (const authorization of [`Bearer ozb_${'x'.repeat(43)}`, 'Bearer ozb_short']) {
      const res = await get('/service/whoami', { authorization });
      expect(res.status, authorization).toBe(401);
      expect(await res.json(), authorization).toEqual({ error: 'Unauthorized' });
    }
  });

  it('answers 403 Forbidden to a valid token that lacks the required scope', async () => {
    const res = await get('/service/whoami', { authorization: `Bearer ${ingestToken.token}` });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('answers whoami to a service token: the token name and its scopes', async () => {
    const res = await get('/service/whoami', { authorization: `Bearer ${serviceToken.token}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'sidecar', scopes: ['service'] });
  });

  it('records last_used_at when a token is used', async () => {
    const res = await get('/service-tokens', { cookie: adminCookie });
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; lastUsedAt: string | null }[];
    const used = list.find((t) => t.id === serviceToken.id);
    const unused = list.find((t) => t.id === ingestToken.id);
    expect(used?.lastUsedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
    // A rejected request is not a use: the ingest token never passed the guard
    expect(unused?.lastUsedAt).toBeNull();
    expect(list.some((t) => t.id === serviceToken.id && t.lastUsedAt !== null)).toBe(true);
  });

  it('does not accept a session cookie alone (service routes never read cookies)', async () => {
    const res = await get('/service/whoami', { cookie: adminCookie });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('the app stays closed around the service routes', () => {
  it('refuses a cookieless request to a normal API route even with a valid bearer token', async () => {
    const res = await get('/accounts', { authorization: `Bearer ${serviceToken.token}` });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Login required' });
  });

  it('keeps the admin token API behind the session (the service mount does not shadow it)', async () => {
    expect((await get('/service-tokens', { cookie: adminCookie })).status).toBe(200);
    expect((await get('/service-tokens')).status).toBe(401);
    expect(
      (await get('/service-tokens', { authorization: `Bearer ${serviceToken.token}` })).status,
    ).toBe(401);
  });
});

describe('ingest routes', () => {
  it('accepts paperless with an ingest token', async () => {
    const res = await post('/ingest/paperless', {
      authorization: `Bearer ${ingestToken.token}`,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuses paperless with a service token (scopes are not interchangeable)', async () => {
    const res = await post('/ingest/paperless', {
      authorization: `Bearer ${serviceToken.token}`,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('refuses paperless without a token, cookie or not', async () => {
    expect((await post('/ingest/paperless')).status).toBe(401);
    expect((await post('/ingest/paperless', { cookie: adminCookie })).status).toBe(401);
  });

  it('refuses a token revoked mid-test from then on', async () => {
    const before = await post('/ingest/paperless', {
      authorization: `Bearer ${ingestToken.token}`,
    });
    expect(before.status).toBe(200);

    const revoked = await fetch(`${base}/service-tokens/${ingestToken.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(revoked.status).toBe(204);

    const after = await post('/ingest/paperless', {
      authorization: `Bearer ${ingestToken.token}`,
    });
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: 'Unauthorized' });
  });
});

// Kept last: it re-evaluates config.ts with server mode off, so it must not disturb the
// app and modules the tests above share.
describe('outside server mode', () => {
  it('stands aside entirely (desktop and dev mode have no tokens)', async () => {
    process.env.OHMZBUDGET_SERVER_MODE = 'false';
    vi.resetModules();
    let probe: Server | undefined;
    try {
      const { serviceAuth: desktopServiceAuth } = await import('../middleware/serviceAuth.js');
      const { serviceRouter: desktopServiceRouter } = await import('./service.js');
      const app = express();
      app.use('/api/service', desktopServiceAuth('service'), desktopServiceRouter);
      probe = await new Promise<Server>((r) => {
        const s = app.listen(0, '127.0.0.1', () => r(s));
      });
      const res = await fetch(
        `http://127.0.0.1:${(probe.address() as AddressInfo).port}/api/service/whoami`,
      );
      // The guard let the cookieless request through (it stands aside), and the route
      // answers as absent rather than crashing on a caller it can't describe
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    } finally {
      probe?.close();
      process.env.OHMZBUDGET_SERVER_MODE = 'true';
    }
  });
});
