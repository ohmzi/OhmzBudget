import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Server mode is read from the environment when modules load, so set it first
process.env.OHMZBUDGET_SERVER_MODE = 'true';

const express = (await import('express')).default;
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { authRouter, requireSession } = await import('./auth.js');
const { setupCode } = await import('../auth/setupCode.js');
const { createUser, ensureAuthReady } = await import('../auth/users.js');

let server: Server;
let base: string;

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  ensureAuthReady(); // fills auth_config.secret, like server startup

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api', requireSession);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/accounts', (_req, res) => res.json([{ name: 'secret account' }]));
  // What requireSession left in res.locals (Task 5's admin guard reads the caller there)
  app.get('/api/whoami', (_req, res) => res.json({ user: res.locals.user ?? null }));
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie?: string) =>
  fetch(base + path, { headers: cookie ? { cookie } : {} });
const sessionCookie = (res: Response) => res.headers.get('set-cookie')?.split(';')[0];
const deviceCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith('ohmzbudget_device='))
    ?.split(';')[0];

describe('server mode login', () => {
  let cookie: string;

  it('starts locked, asking for setup; data requires a login', async () => {
    expect(await (await get('/auth/status')).json()).toEqual({
      enabled: true,
      needsSetup: true,
      authenticated: false,
      user: null,
    });
    expect((await get('/accounts')).status).toBe(401);
    expect((await get('/health')).status).toBe(200);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    expect(
      (
        await post('/auth/setup', {
          username: 'owner',
          password: 'short',
          setupCode: setupCode(),
        })
      ).status,
    ).toBe(400);
  });

  it('setup requires the setup code from the server log', async () => {
    expect(
      (await post('/auth/setup', { username: 'owner', password: 'attacker password' })).status,
    ).toBe(403);
    expect(
      (
        await post('/auth/setup', {
          username: 'owner',
          password: 'attacker password',
          setupCode: 'AAAA-BBBB',
        })
      ).status,
    ).toBe(403);
    expect((await get('/auth/status')).status).toBe(200);
    expect(setupCode()).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  });

  it('first visit claims an interim phantom row as the admin account and signs in', async () => {
    // An install that ran the interim release can carry an empty-hash phantom row for the
    // name the owner picks (review finding T2-C1). It is not an account: setup is still
    // needed, nobody can sign in as it, and setup must claim it in place instead of 409ing.
    db.$client
      .prepare(
        "insert into users (id, username, password_hash, role) values ('phantom-owner', 'owner', '', 'member')",
      )
      .run();
    expect(await (await get('/auth/status')).json()).toMatchObject({
      needsSetup: true,
      user: null,
    });
    // Case, spaces and dashes in the code don't matter
    const code = setupCode().toLowerCase().replace(/-/g, ' ');
    const res = await post('/auth/setup', {
      username: 'owner',
      password: 'first password 123',
      setupCode: code,
    });
    expect(res.status).toBe(204);
    // The phantom became the account in place: one row, the same id, now with a real hash
    // and the admin role (no duplicate row, which the unique username index would refuse)
    expect(db.$client.prepare('select id, username, role, password_hash from users').all()).toEqual(
      [
        {
          id: 'phantom-owner',
          username: 'owner',
          role: 'admin',
          password_hash: expect.stringMatching(/^scrypt\$/),
        },
      ],
    );
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^ohmzbudget_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    cookie = sessionCookie(res)!;
    // /status names the account behind the cookie (Task 8's client shows it and its role)
    expect(await (await get('/auth/status', cookie)).json()).toEqual({
      enabled: true,
      needsSetup: false,
      authenticated: true,
      user: { id: expect.any(String), username: 'owner', role: 'admin' },
    });
    expect((await get('/accounts', cookie)).status).toBe(200);
    // requireSession hands the route the same account (Task 5's admin guard reads it)
    expect(await (await get('/whoami', cookie)).json()).toEqual({
      user: { id: expect.any(String), username: 'owner', role: 'admin' },
    });
  });

  it('setup can only happen once', async () => {
    expect(
      (
        await post('/auth/setup', {
          username: 'attacker',
          password: 'attacker password',
          setupCode: 'anything',
        })
      ).status,
    ).toBe(409);
  });

  it('stores only hashes: no plaintext password or session token in the database', () => {
    const dump = JSON.stringify([
      db.$client.prepare('select * from auth_config').all(),
      db.$client.prepare('select * from users').all(),
      db.$client.prepare('select * from sessions').all(),
    ]);
    expect(dump).not.toContain('first password 123');
    expect(dump).not.toContain(cookie.split('=')[1]);
  });

  it('rejects wrong passwords and forged or missing sessions', async () => {
    const wrongPassword = await post('/auth/login', {
      username: 'owner',
      password: 'wrong password',
    });
    // An unknown username costs the same and answers the same: nothing enumerates accounts
    const wrongUsername = await post('/auth/login', {
      username: 'nobody',
      password: 'first password 123',
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongUsername.status).toBe(401);
    expect(await wrongPassword.json()).toEqual({ error: 'Incorrect password' });
    expect(await wrongUsername.json()).toEqual({ error: 'Incorrect password' });
    expect((await get('/accounts', 'ohmzbudget_session=forged')).status).toBe(401);
    expect((await get('/accounts')).status).toBe(401);
  });

  it('logs in with the right username and password, and logging out ends the session', async () => {
    const res = await post('/auth/login', { username: 'owner', password: 'first password 123' });
    expect(res.status).toBe(204);
    const second = sessionCookie(res)!;
    expect(await (await get('/auth/status', second)).json()).toMatchObject({
      authenticated: true,
      user: { username: 'owner', role: 'admin' },
    });
    expect((await get('/accounts', second)).status).toBe(200);
    expect((await post('/auth/logout', {}, second)).status).toBe(204);
    expect((await get('/accounts', second)).status).toBe(401);
  });

  it('changing the password requires the current one and signs out other sessions', async () => {
    const other = sessionCookie(
      await post('/auth/login', { username: 'owner', password: 'first password 123' }),
    )!;
    const wrong = await post(
      '/auth/change-password',
      { currentPassword: 'nope nope nope', newPassword: 'second password 456' },
      cookie,
    );
    expect(wrong.status).toBe(401);
    const ok = await post(
      '/auth/change-password',
      { currentPassword: 'first password 123', newPassword: 'second password 456' },
      cookie,
    );
    expect(ok.status).toBe(204);
    expect((await get('/accounts', cookie)).status).toBe(200); // this session stays
    expect((await get('/accounts', other)).status).toBe(401); // others are signed out
    expect(
      (await post('/auth/login', { username: 'owner', password: 'first password 123' })).status,
    ).toBe(401);
    expect(
      (await post('/auth/login', { username: 'owner', password: 'second password 456' })).status,
    ).toBe(204);
  });

  let device: string;
  let voidedDevice: string;

  it('remembers a browser that signed in, even across a password change', async () => {
    const before = await post('/auth/login', {
      username: 'owner',
      password: 'second password 456',
    });
    voidedDevice = deviceCookie(before)!;
    const session = sessionCookie(before)!;
    expect(voidedDevice).toMatch(/^ohmzbudget_device=[\w-]+\.[\w-]+$/);
    expect(before.headers.getSetCookie().join()).toMatch(/Path=\/api\/auth/);
    // Device cookies are keyed by the install secret (auth_config.secret), not by a
    // password hash, so changing the password keeps this browser trusted and it gets a
    // fresh cookie
    const changed = await post(
      '/auth/change-password',
      { currentPassword: 'second password 456', newPassword: 'third password 789' },
      session,
    );
    expect(changed.status).toBe(204);
    device = deviceCookie(changed)!;
    expect(device).toBeDefined();
    expect(device).not.toBe(voidedDevice);
  });

  // On purpose, these tests come after the sign-in tests above and put their refusals
  // last: the per-address login allowance (10 refusals, see authRateLimit) has to stay
  // big enough for every successful sign-in in this file, and the rate-limit test below
  // is what spends the rest of it.

  let ownerCookie: string;
  let memberCookie: string;

  it('two users sign in independently and cannot see each other’s sessions', async () => {
    // The setup session was signed out by the password change above: sign back in
    ownerCookie = sessionCookie(
      await post('/auth/login', { username: 'owner', password: 'third password 789' }),
    )!;
    // Task 5's admin API (`POST /api/users`) will call this same service
    const created = await createUser('member1', 'member1 password 123', 'member');
    if (!created.ok) throw new Error(`failed to create member1: ${created.error}`);
    memberCookie = sessionCookie(
      await post('/auth/login', { username: 'member1', password: 'member1 password 123' }),
    )!;
    // /status names the account behind each cookie
    expect(await (await get('/auth/status', ownerCookie)).json()).toMatchObject({
      authenticated: true,
      user: { username: 'owner', role: 'admin' },
    });
    expect(await (await get('/auth/status', memberCookie)).json()).toMatchObject({
      authenticated: true,
      user: { username: 'member1', role: 'member' },
    });
    // Signed-in devices are per user: member1 sees only its own session
    const memberSessions = (await (await get('/auth/sessions', memberCookie)).json()) as {
      id: string;
      current: boolean;
    }[];
    const ownerSessions = (await (await get('/auth/sessions', ownerCookie)).json()) as {
      id: string;
    }[];
    expect(memberSessions).toHaveLength(1);
    expect(memberSessions[0].current).toBe(true);
    expect(ownerSessions.length).toBeGreaterThan(1); // from the tests above, plus this one
    expect(ownerSessions.some((s) => s.id === memberSessions[0].id)).toBe(false);
    expect((await get('/accounts', memberCookie)).status).toBe(200); // the budget is shared
  });

  it('signing out others never touches another user’s sessions', async () => {
    const secondMember = sessionCookie(
      await post('/auth/login', { username: 'member1', password: 'member1 password 123' }),
    )!;
    const signedOut = await (await post('/auth/sessions/sign-out-others', {}, memberCookie)).json();
    expect(signedOut).toEqual({ signedOut: 1 }); // only member1's second session
    expect((await get('/accounts', memberCookie)).status).toBe(200); // this session stays
    expect((await get('/accounts', secondMember)).status).toBe(401); // the user's other one is gone
    // The owner's sessions are untouched
    expect(await (await get('/auth/status', ownerCookie)).json()).toMatchObject({
      authenticated: true,
      user: { username: 'owner' },
    });
    expect((await get('/accounts', ownerCookie)).status).toBe(200);
  });

  it('the setup username must be valid and unique', async () => {
    // The body is validated before the already-set-up gate, so a malformed one is a 400
    const invalid = await post('/auth/setup', {
      username: 'bad name!',
      password: 'long enough password',
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatch(/username/i);
    // With an account in place setup can't be repeated, even with a valid username
    expect(
      (await post('/auth/setup', { username: 'owner', password: 'long enough password' })).status,
    ).toBe(409);
  });

  it('rate-limits repeated failed attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (await post('/auth/login', { username: 'owner', password: `guess ${i}` })).status,
      );
    }
    expect(statuses).toContain(429);
    // Earlier failures in this file count too, so the limit kicks in within 10 tries
    expect(statuses.indexOf(429)).toBeLessThanOrEqual(10);
  });

  it("can't lock out a browser that signed in before, even from the same address", async () => {
    // This address is locked now (previous test); a trusted device has its own limit
    expect((await post('/auth/login', { username: 'owner', password: 'guess' })).status).toBe(429);
    expect(
      (await post('/auth/login', { username: 'owner', password: 'third password 789' }, device))
        .status,
    ).toBe(204);
    // A device cookie from before the password change stays trusted: the HMAC keys on the
    // install secret, which is never rotated
    expect(
      (
        await post(
          '/auth/login',
          { username: 'owner', password: 'third password 789' },
          voidedDevice,
        )
      ).status,
    ).toBe(204);
    // Forged or tampered device cookies fall back to the address's limit
    for (const fake of ['ohmzbudget_device=forged.cookie', device.slice(0, -2) + 'AA']) {
      expect(
        (await post('/auth/login', { username: 'owner', password: 'third password 789' }, fake))
          .status,
      ).toBe(429);
    }
  });
});
