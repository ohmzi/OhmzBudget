import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Server mode is read from the environment when modules load, so set it first
process.env.OHMZBUDGET_SERVER_MODE = 'true';

const express = (await import('express')).default;
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { authRouter, requireSession } = await import('./auth.js');
const { requireAdmin } = await import('../middleware/adminGuard.js');
const { usersRouter } = await import('./users.js');
const { setupCode } = await import('../auth/setupCode.js');
const { createSession } = await import('../auth/sessions.js');
const { createUser, ensureAuthReady, verifyLogin } = await import('../auth/users.js');

let server: Server;
let base: string;

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  ensureAuthReady(); // fills auth_config.secret, like server startup

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api', requireSession);
  // Mounted like index.ts does: after requireSession, behind the admin guard
  app.use('/api/users', requireAdmin, usersRouter);
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

const cookieHeader = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

/** A session cookie for an account, made through the service a real login would go through. */
const signedInAs = (userId: string) =>
  `ohmzbudget_session=${createSession(userId, 'test browser').token}`;

let adminCookie = '';
let adminId = '';
let adminUsername = '';
let memberCookie = '';

describe('setup serialization (T4 review fix)', () => {
  it('two concurrent valid-code setups create exactly one admin; the loser gets 409', async () => {
    const code = setupCode();
    const [a, b] = await Promise.all([
      request('POST', '/auth/setup', {
        body: { username: 'owner', password: 'first owner password', setupCode: code },
      }),
      request('POST', '/auth/setup', {
        body: { username: 'intruder', password: 'intruder password', setupCode: code },
      }),
    ]);
    // Without the in-flight flag both requests pass the isSetupNeeded() gate while the
    // other is hashing, and both create an admin
    expect([a.status, b.status].sort()).toEqual([204, 409]);
    const winner = a.status === 204 ? a : b;
    const loser = a.status === 204 ? b : a;
    expect(await loser.json()).toEqual({ error: 'A password has already been set' });
    adminCookie = cookieHeader(winner);
    // Exactly one account came out of the race, and it can sign in as the admin
    const rows = db.$client
      .prepare("select username, role from users where password_hash <> ''")
      .all() as { username: string; role: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('admin');
    adminUsername = rows[0].username;
    const status = await (await request('GET', '/auth/status', { cookie: adminCookie })).json();
    expect(status).toMatchObject({
      authenticated: true,
      user: { username: adminUsername, role: 'admin' },
    });
    adminId = status.user.id;
  });
});

// Every route of this router, so the guard is proven for all of them, not a sample
const usersRoutes: { method: string; path: string; body?: unknown }[] = [
  { method: 'GET', path: '/users' },
  {
    method: 'POST',
    path: '/users',
    body: { username: 'sneaky', password: 'sneaky password 123', role: 'admin' },
  },
  { method: 'PATCH', path: '/users/some-user', body: { role: 'admin' } },
  { method: 'POST', path: '/users/some-user/reset-password', body: { password: 'sneaky pass' } },
  { method: 'DELETE', path: '/users/some-user' },
];

describe('admin guard', () => {
  beforeAll(async () => {
    const created = await createUser('member1', 'member1 password 123', 'member');
    if (!created.ok) throw new Error(`failed to create member1: ${created.error}`);
    memberCookie = signedInAs(created.user.id);
  });

  for (const route of usersRoutes) {
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
    const list = await (await request('GET', '/users', { cookie: adminCookie })).json();
    expect(list.map((u: { username: string }) => u.username).sort()).toEqual(
      [adminUsername, 'member1'].sort(),
    );
  });
});

describe('admin user management', () => {
  let householdId = '';

  it('lists the accounts in their safe shape and hides empty-hash ghost rows', async () => {
    // A ghost from the setup interim window (review finding T2-C1) can never sign in,
    // so it is not a user: listUsers() must leave it out (T4 review fix)
    db.$client
      .prepare(
        "insert into users (id, username, password_hash, role) values ('ghost', 'ghost', '', 'member')",
      )
      .run();
    const res = await request('GET', '/users', { cookie: adminCookie });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((u: { username: string }) => u.username).sort()).toEqual(
      [adminUsername, 'member1'].sort(),
    );
    for (const user of list) expect(Object.keys(user).sort()).toEqual(['id', 'role', 'username']);
    expect(JSON.stringify(list)).not.toContain('scrypt');
  });

  it('creates a user with the safe shape, refuses a taken name and claims ghost names', async () => {
    const res = await request('POST', '/users', {
      body: { username: 'household', password: 'household password', role: 'member' },
      cookie: adminCookie,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      user: { id: expect.any(String), username: 'household', role: 'member' },
    });
    householdId = body.user.id;
    // The unique index is case-insensitive, like login
    const taken = await request('POST', '/users', {
      body: { username: 'HouseHold', password: 'household password', role: 'member' },
      cookie: adminCookie,
    });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'username_taken' });
    // A ghost row doesn't hold its name hostage: the name is claimed in place, like setup
    const claimed = await request('POST', '/users', {
      body: { username: 'ghost', password: 'ghost password 123', role: 'member' },
      cookie: adminCookie,
    });
    expect(claimed.status).toBe(201);
    expect((await claimed.json()).user).toMatchObject({ username: 'ghost', role: 'member' });
  });

  it('validates the username, password and role with a message naming the field', async () => {
    const cases: [unknown, RegExp][] = [
      [{ username: 'bad name!', password: 'long enough password', role: 'member' }, /username/i],
      [{ username: 'fine', password: 'short', role: 'member' }, /password/i],
      [{ username: 'fine', password: 'long enough password', role: 'root' }, /role/i],
      [{ username: 'fine', password: 'long enough password' }, /role/i], // role is required
    ];
    for (const [body, message] of cases) {
      const res = await request('POST', '/users', { body, cookie: adminCookie });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(message);
    }
  });

  it('changes a role, refusing to demote the last real admin', async () => {
    const promote = await request('PATCH', `/users/${householdId}`, {
      body: { role: 'admin' },
      cookie: adminCookie,
    });
    expect(promote.status).toBe(200);
    expect(await promote.json()).toEqual({
      user: { id: householdId, username: 'household', role: 'admin' },
    });
    // Two admins now, so demoting one is fine
    const demote = await request('PATCH', `/users/${householdId}`, {
      body: { role: 'member' },
      cookie: adminCookie,
    });
    expect(demote.status).toBe(200);
    expect((await demote.json()).user).toMatchObject({ username: 'household', role: 'member' });
    // Nobody could manage users any more, so the last admin stays an admin
    const last = await request('PATCH', `/users/${adminId}`, {
      body: { role: 'member' },
      cookie: adminCookie,
    });
    expect(last.status).toBe(409);
    expect(await last.json()).toEqual({ error: 'last_admin' });
    // A ghost admin (empty hash, cannot sign in) doesn't count as that last admin either
    db.$client
      .prepare(
        "insert into users (id, username, password_hash, role) values ('ghost-admin', 'ghost-admin', '', 'admin')",
      )
      .run();
    const stillLast = await request('PATCH', `/users/${adminId}`, {
      body: { role: 'member' },
      cookie: adminCookie,
    });
    expect(stillLast.status).toBe(409);
    expect(await stillLast.json()).toEqual({ error: 'last_admin' });
    // Unknown ids are 404; a bad role is named
    expect(
      (
        await request('PATCH', '/users/no-such-user', {
          body: { role: 'admin' },
          cookie: adminCookie,
        })
      ).status,
    ).toBe(404);
    const badRole = await request('PATCH', `/users/${householdId}`, {
      body: { role: 'root' },
      cookie: adminCookie,
    });
    expect(badRole.status).toBe(400);
    expect((await badRole.json()).error).toMatch(/role/i);
  });

  it('resets a password and signs that user out everywhere', async () => {
    const householdCookie = signedInAs(householdId);
    const res = await request('POST', `/users/${householdId}/reset-password`, {
      body: { password: 'reset password 456' },
      cookie: adminCookie,
    });
    expect(res.status).toBe(204);
    expect((await request('GET', '/users', { cookie: householdCookie })).status).toBe(401);
    expect(await verifyLogin('household', 'household password')).toBeNull();
    expect(await verifyLogin('household', 'reset password 456')).toMatchObject({
      username: 'household',
    });
    const short = await request('POST', `/users/${householdId}/reset-password`, {
      body: { password: 'short' },
      cookie: adminCookie,
    });
    expect(short.status).toBe(400);
    expect((await short.json()).error).toMatch(/password/i);
    expect(
      (
        await request('POST', '/users/no-such-user/reset-password', {
          body: { password: 'reset password 456' },
          cookie: adminCookie,
        })
      ).status,
    ).toBe(404);
  });

  it('refuses self-delete, deletes another account and its sessions', async () => {
    const selfDelete = await request('DELETE', `/users/${adminId}`, { cookie: adminCookie });
    expect(selfDelete.status).toBe(409);
    expect(await selfDelete.json()).toEqual({ error: 'self' });
    const householdCookie = signedInAs(householdId);
    const deleted = await request('DELETE', `/users/${householdId}`, { cookie: adminCookie });
    expect(deleted.status).toBe(204);
    const names = (await (await request('GET', '/users', { cookie: adminCookie })).json()).map(
      (u: { username: string }) => u.username,
    );
    expect(names).not.toContain('household');
    expect((await request('GET', '/users', { cookie: householdCookie })).status).toBe(401);
    expect((await request('DELETE', `/users/${householdId}`, { cookie: adminCookie })).status).toBe(
      404,
    );
    // Ghost rows aren't accounts, so they cannot be managed either
    expect((await request('DELETE', '/users/ghost-admin', { cookie: adminCookie })).status).toBe(
      404,
    );
  });
});
