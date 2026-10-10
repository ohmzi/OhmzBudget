import { createHash } from 'crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
process.env.OHMZBUDGET_SERVER_MODE = 'true';
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { eq } = await import('drizzle-orm');
const { db } = await import('../db/index.js');
const { authConfig, sessions } = await import('../db/schema.js');
const { createUser, ensureAuthReady } = await import('./users.js');
const {
  createDeviceToken,
  createSession,
  deleteOtherSessions,
  deleteSessionByPublicId,
  deleteSessionsForUser,
  isValidSession,
  listSessions,
  verifyDeviceToken,
} = await import('./sessions.js');

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

let aliceId: string;
let bobId: string;

beforeAll(async () => {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  ensureAuthReady(); // fills auth_config.secret, like server startup
  const alice = await createUser('alice', 'alice password long', 'admin');
  const bob = await createUser('bob', 'bob password long', 'member');
  if (!alice.ok || !bob.ok) throw new Error('failed to create the test users');
  aliceId = alice.user.id;
  bobId = bob.user.id;
});

beforeEach(() => db.delete(sessions).run());

describe('per-user sessions', () => {
  it('records the owning user, and only a live user makes a session valid', () => {
    const { token } = createSession(aliceId, 'laptop');
    expect(isValidSession(token)).toBe(true);
    expect(isValidSession('nonsense')).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
    const stored = db.$client.prepare('select user_id from sessions').all() as {
      user_id: string;
    }[];
    expect(stored).toHaveLength(1);
    expect(stored[0].user_id).toBe(aliceId);
  });

  it("lists only the user's own live sessions, marking the caller's own", () => {
    const { token: current } = createSession(aliceId, 'current');
    createSession(aliceId, 'other');
    const { token: bobToken } = createSession(bobId, 'bob');
    const mine = listSessions(aliceId, current);
    expect(mine.map((s) => s.userAgent).sort()).toEqual(['current', 'other']);
    expect(mine.filter((s) => s.current)).toHaveLength(1);
    expect(mine.find((s) => s.current)?.userAgent).toBe('current');
    // Another user's token never marks one of these as current
    expect(listSessions(aliceId, bobToken).some((s) => s.current)).toBe(false);
    expect(listSessions(bobId, bobToken).map((s) => s.userAgent)).toEqual(['bob']);
  });

  it("signs out a user's other sessions without touching anyone else's", () => {
    const { token: keep } = createSession(aliceId, 'keep');
    const { token: drop } = createSession(aliceId, 'drop');
    const { token: bobToken } = createSession(bobId, 'bob');
    expect(deleteOtherSessions(aliceId, keep)).toBe(1);
    expect(isValidSession(keep)).toBe(true);
    expect(isValidSession(drop)).toBe(false);
    expect(isValidSession(bobToken)).toBe(true);
  });

  it('signs a user out everywhere with deleteSessionsForUser', () => {
    const { token: one } = createSession(aliceId);
    const { token: two } = createSession(aliceId);
    const { token: bobToken } = createSession(bobId);
    expect(deleteSessionsForUser(aliceId)).toBe(2);
    expect(isValidSession(one)).toBe(false);
    expect(isValidSession(two)).toBe(false);
    expect(isValidSession(bobToken)).toBe(true);
  });

  it('names sessions by a public id, scoped to their owner', () => {
    const { token: bobToken } = createSession(bobId, 'bob');
    const publicId = listSessions(bobId, bobToken).find((s) => s.current)!.id;
    expect(deleteSessionByPublicId(aliceId, publicId)).toBe(false); // not Alice's to delete
    expect(isValidSession(bobToken)).toBe(true);
    expect(deleteSessionByPublicId(bobId, publicId)).toBe(true);
    expect(isValidSession(bobToken)).toBe(false);
  });

  it('never lists or accepts an expired session', () => {
    const { token } = createSession(aliceId, 'stale');
    db.update(sessions)
      .set({ expiresAt: new Date(0).toISOString() })
      .where(eq(sessions.id, digest(token)))
      .run();
    expect(listSessions(aliceId, token)).toEqual([]);
    expect(isValidSession(token)).toBe(false);
  });
});

describe('device cookies', () => {
  it('keys the HMAC on the install secret, read fresh on every call', () => {
    const device = createDeviceToken()!;
    expect(device).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyDeviceToken(device)).toBe(device.split('.')[0]);
    // Keyed by the install secret, not by any password hash: changing one leaves it valid
    db.update(authConfig).set({ passwordHash: 'scrypt$changed' }).run();
    expect(verifyDeviceToken(device)).toBe(device.split('.')[0]);
    // Read fresh each call: rotating the secret voids cookies issued before it
    db.update(authConfig).set({ secret: 'rotated-secret' }).run();
    expect(verifyDeviceToken(device)).toBeNull();
    expect(verifyDeviceToken('forged.cookie')).toBeNull();
    expect(verifyDeviceToken(undefined)).toBeNull();
  });
});
