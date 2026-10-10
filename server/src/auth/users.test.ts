import { beforeAll, describe, expect, it } from 'vitest';
process.env.OHMZBUDGET_SERVER_MODE = 'true';
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { eq } = await import('drizzle-orm');
const { db } = await import('../db/index.js');
const { users, authConfig, sessions } = await import('../db/schema.js');
const {
  changeOwnPassword,
  countUsers,
  createUser,
  deleteUser,
  ensureAuthReady,
  isSetupNeeded,
  listUsers,
  resetUserPassword,
  setUserRole,
  verifyLogin,
} = await import('./users.js');
const { createSession, isValidSession } = await import('./sessions.js');

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
  it('stays idempotent on a fresh install: no phantom admin after a restart', () => {
    db.delete(users).run();
    db.delete(authConfig).run();
    ensureAuthReady();
    ensureAuthReady();
    expect(countUsers()).toBe(0);
  });
});

describe('user accounts', () => {
  it('creates, verifies and lists users; username is case-insensitively unique', async () => {
    await createUser('Alice', 'long enough password', 'admin');
    expect(await createUser('alice', 'another password!', 'member')).toEqual({
      ok: false,
      error: 'username_taken',
    });
    expect(await verifyLogin('ALICE', 'long enough password')).toMatchObject({ username: 'Alice' });
    expect(await verifyLogin('alice', 'wrong')).toBeNull();
    expect(await verifyLogin('nobody', 'anything')).toBeNull(); // still spends a hash
    expect(listUsers()).toEqual([{ id: expect.any(String), username: 'Alice', role: 'admin' }]);
  });

  it('rejects usernames that are empty, too long or have illegal characters', async () => {
    for (const bad of ['', 'has space', 'bad name!', 'a'.repeat(65), 'ünïcode']) {
      expect(await createUser(bad, 'long enough password', 'member')).toEqual({
        ok: false,
        error: 'invalid_username',
      });
    }
    expect(listUsers()).toHaveLength(1); // Alice only
  });

  it('refuses to demote or delete the last admin, and refuses self-delete', () => {
    const [admin] = listUsers().filter((u) => u.role === 'admin');
    expect(setUserRole(admin.id, 'member')).toEqual({ ok: false, error: 'last_admin' });
    expect(deleteUser(admin.id, admin.id)).toEqual({ ok: false, error: 'self' });
    expect(listUsers()).toHaveLength(1);
  });

  it('promotes and demotes as long as one admin remains', async () => {
    const created = await createUser('bob', 'long enough password', 'member');
    if (!created.ok) throw new Error('failed to create the user');
    const bob = created.user;
    expect(setUserRole(bob.id, 'admin')).toEqual({ ok: true });
    const [alice] = listUsers().filter((u) => u.username === 'Alice');
    expect(setUserRole(alice.id, 'member')).toEqual({ ok: true }); // bob is still an admin
    expect(setUserRole('missing', 'admin')).toEqual({ ok: false });
    expect(
      listUsers()
        .map((u) => u.role)
        .sort(),
    ).toEqual(['admin', 'member']);
    // Put Alice back on top so later tests keep one obvious admin
    expect(setUserRole(alice.id, 'admin')).toEqual({ ok: true });
  });

  it('deleting a user removes their sessions', async () => {
    const created = await createUser('deletee', 'long enough password', 'member');
    if (!created.ok) throw new Error('failed to create the user');
    const { token } = createSession(created.user.id, 'laptop');
    expect(isValidSession(token)).toBe(true);
    const [admin] = listUsers().filter((u) => u.role === 'admin');
    expect(deleteUser(created.user.id, admin.id)).toEqual({ ok: true });
    expect(isValidSession(token)).toBe(false); // the ON DELETE CASCADE took the session
    // The row itself is gone: listSessions and sessionUserId join `users`, so a stale row
    // would still read as invalid while lingering in the table (T3 review, minor 2)
    expect(db.select().from(sessions).where(eq(sessions.userId, created.user.id)).all()).toEqual(
      [],
    );
    expect(listUsers().map((u) => u.username)).not.toContain('deletee');
  });
});

describe('passwords', () => {
  it('resets a password and signs that user out everywhere', async () => {
    const created = await createUser('carol', 'first password 123', 'member');
    if (!created.ok) throw new Error('failed to create the user');
    const carol = created.user;
    const { token } = createSession(carol.id, 'laptop');
    expect(await resetUserPassword(carol.id, 'second password 456')).toBe(true);
    expect(isValidSession(token)).toBe(false);
    expect(await verifyLogin('carol', 'first password 123')).toBeNull();
    expect(await verifyLogin('carol', 'second password 456')).toMatchObject({ username: 'carol' });
    expect(await resetUserPassword('missing', 'second password 456')).toBe(false);
  });

  it('changes your own password, keeping only the session you pass in', async () => {
    const adminId = listUsers().find((u) => u.username === 'Alice')!.id;
    const { token: keep } = createSession(adminId, 'this browser');
    const { token: drop } = createSession(adminId, 'other browser');
    expect(await changeOwnPassword(adminId, 'nope nope nope', 'new password 789', keep)).toEqual({
      ok: false,
      error: 'wrong_password',
    });
    expect(
      await changeOwnPassword(adminId, 'long enough password', 'new password 789', keep),
    ).toEqual({ ok: true });
    expect(isValidSession(keep)).toBe(true);
    expect(isValidSession(drop)).toBe(false);
    expect(await verifyLogin('Alice', 'long enough password')).toBeNull();
    expect(await verifyLogin('alice', 'new password 789')).toMatchObject({ username: 'Alice' });
  });
});

describe('isSetupNeeded', () => {
  it('asks for setup until a user with a real password hash exists', async () => {
    db.delete(users).run();
    // An empty-hash row (the interim window) is not an account yet
    db.insert(users).values({ id: 'phantom', username: 'admin', passwordHash: '' }).run();
    expect(isSetupNeeded()).toBe(true);
    expect(await verifyLogin('admin', 'anything')).toBeNull();
    expect(await createUser('owner', 'long enough password', 'admin')).toMatchObject({ ok: true });
    expect(isSetupNeeded()).toBe(false);
  });
});
