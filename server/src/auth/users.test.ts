import { beforeAll, describe, expect, it } from 'vitest';
process.env.OHMZBUDGET_SERVER_MODE = 'true';
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { users, authConfig } = await import('../db/schema.js');
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
  it('stays idempotent on a fresh install: no phantom admin after a restart', () => {
    db.delete(users).run();
    db.delete(authConfig).run();
    ensureAuthReady();
    ensureAuthReady();
    expect(countUsers()).toBe(0);
  });
});
