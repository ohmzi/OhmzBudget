import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Server mode is read from the environment when modules load, so set it first
process.env.OHMZBUDGET_SERVER_MODE = 'true';

const express = (await import('express')).default;
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { requireSession } = await import('./auth.js');
const { requireAdmin } = await import('../middleware/adminGuard.js');
const { serviceTokensRouter } = await import('./serviceTokens.js');
const { createSession } = await import('../auth/sessions.js');
const { createUser, ensureAuthReady } = await import('../auth/users.js');
const { verifyBearer } = await import('../auth/serviceTokens.js');

let server: Server;
let base: string;
let adminCookie = '';
let memberCookie = '';

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  ensureAuthReady(); // fills auth_config.secret, like server startup

  const admin = await createUser('owner', 'owner password 123', 'admin');
  const member = await createUser('member1', 'member1 password 123', 'member');
  if (!admin.ok || !member.ok) throw new Error('failed to create the test accounts');
  adminCookie = `ohmzbudget_session=${createSession(admin.user.id, 'test browser').token}`;
  memberCookie = `ohmzbudget_session=${createSession(member.user.id, 'test browser').token}`;

  const app = express();
  app.use(express.json());
  app.use('/api', requireSession);
  // Mounted like index.ts does: after requireSession, behind the admin guard
  app.use('/api/service-tokens', requireAdmin, serviceTokensRouter);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const request = (method: string, path: string, options: { body?: unknown; cookie?: string } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

// Every route of this router, so the guard is proven for all of them, not a sample
const tokenRoutes: { method: string; path: string; body?: unknown }[] = [
  { method: 'GET', path: '/service-tokens' },
  { method: 'POST', path: '/service-tokens', body: { name: 'sneaky', scopes: ['ingest'] } },
  { method: 'DELETE', path: '/service-tokens/some-token' },
];

describe('admin guard', () => {
  for (const route of tokenRoutes) {
    it(`answers 401 to anonymous callers on ${route.method} ${route.path}`, async () => {
      const res = await request(route.method, route.path, { body: route.body });
      expect(res.status).toBe(401);
    });

    it(`answers 403 Forbidden to a signed-in member on ${route.method} ${route.path}`, async () => {
      const res = await request(route.method, route.path, {
        body: route.body,
        cookie: memberCookie,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden' });
    });
  }

  it('nothing a member tried came through', async () => {
    const list = await (await request('GET', '/service-tokens', { cookie: adminCookie })).json();
    expect(list).toEqual([]);
  });
});

describe('service tokens', () => {
  let created: { id: string; name: string; scopes: string[]; token: string };

  it('starts with no tokens', async () => {
    const res = await request('GET', '/service-tokens', { cookie: adminCookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a token: the plaintext appears once, in the create response only', async () => {
    const res = await request('POST', '/service-tokens', {
      body: { name: 'paperless webhook', scopes: ['ingest'] },
      cookie: adminCookie,
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    created = JSON.parse(text);
    expect(created).toEqual({
      id: expect.any(String),
      name: 'paperless webhook',
      scopes: ['ingest'],
      token: expect.stringMatching(/^ozb_[A-Za-z0-9_-]{43}$/),
    });
    // Exactly one occurrence of the token in the whole response body
    expect(text.split(created.token)).toHaveLength(2);
    // It is the real token: the server knows it and only stores its hash
    expect(verifyBearer(`Bearer ${created.token}`)).toMatchObject({
      id: created.id,
      name: 'paperless webhook',
      scopes: ['ingest'],
    });
    expect(JSON.stringify(db.$client.prepare('select * from service_tokens').all())).not.toContain(
      created.token,
    );
  });

  it('lists tokens without hashes or the plaintext, with an ISO createdAt', async () => {
    const res = await request('GET', '/service-tokens', { cookie: adminCookie });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    // SQLite's datetime('now') has no "T" and no "Z": the client would read it as local
    // time, so the route must serve an ISO UTC timestamp (T4 review fix)
    expect(list[0]).toEqual({
      id: created.id,
      name: 'paperless webhook',
      scopes: ['ingest'],
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/),
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(list[0]).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(list)).not.toContain(created.token);
  });

  it('validates the name and scopes', async () => {
    const cases: [unknown, RegExp][] = [
      [{ name: '', scopes: ['ingest'] }, /name/i],
      [{ name: 'x'.repeat(101), scopes: ['ingest'] }, /name/i],
      [{ name: 'sidecar', scopes: [] }, /scope/i],
      [{ name: 'sidecar', scopes: ['admin'] }, /scope/i],
      [{ name: 'sidecar' }, /scope/i],
    ];
    for (const [body, message] of cases) {
      const res = await request('POST', '/service-tokens', { body, cookie: adminCookie });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(message);
    }
    // Nothing was minted by the refusals
    const list = await (await request('GET', '/service-tokens', { cookie: adminCookie })).json();
    expect(list).toHaveLength(1);
  });

  it('revokes a token: it stops working and the list keeps it with its timestamp', async () => {
    const res = await request('DELETE', `/service-tokens/${created.id}`, { cookie: adminCookie });
    expect(res.status).toBe(204);
    expect(verifyBearer(`Bearer ${created.token}`)).toBeNull();
    const list = await (await request('GET', '/service-tokens', { cookie: adminCookie })).json();
    expect(list[0]).toMatchObject({ id: created.id, revokedAt: expect.any(String) });
    // Revoking an already-revoked token is not an error, but an unknown id is
    expect(
      (await request('DELETE', `/service-tokens/${created.id}`, { cookie: adminCookie })).status,
    ).toBe(204);
    const missing = await request('DELETE', '/service-tokens/no-such-token', {
      cookie: adminCookie,
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });
  });
});
