import { randomBytes } from 'crypto';
import { eq, ne, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { authConfig, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';
import { deleteOtherSessions, deleteSessionsForUser, sessionUserId } from './sessions.js';

// Multi-user accounts for server mode. The budget data is shared; roles gate
// administration, and machine callers (paperless, sidecar) use service tokens.

export type Role = 'admin' | 'member';

/** The safe shape of an account: never the password hash. */
export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

/** 1-64 characters of letters, digits, dot, underscore or dash. */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

const now = () => new Date().toISOString();

const toSessionUser = (row: { id: string; username: string; role: string }): SessionUser => ({
  id: row.id,
  username: row.username,
  role: row.role === 'admin' ? 'admin' : 'member',
});

/** Case-insensitive lookup, matching the schema's unique index (COLLATE NOCASE). */
const byUsername = (username: string) =>
  db
    .select()
    .from(users)
    .where(sql`${users.username} COLLATE NOCASE = ${username}`)
    .get();

const byId = (id: string) => db.select().from(users).where(eq(users.id, id)).get();

const countAdmins = () =>
  db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).all().length;

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
  // Only a row with a REAL hash is legacy input. The empty-hash carrier row created on fresh
  // installs (below) must never be backfilled — otherwise a second startup would mint a
  // phantom empty-hash `admin` and no account could ever be set up (see review finding T2-C1).
  if (countUsers() === 0 && legacy?.passwordHash) {
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

/** Setup is needed until some account has a real password (empty-hash rows don't count). */
export function isSetupNeeded(): boolean {
  return (
    db.select({ id: users.id }).from(users).where(ne(users.passwordHash, '')).all().length === 0
  );
}

/** Every account, oldest first. Never includes password hashes. */
export function listUsers(): SessionUser[] {
  return db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .orderBy(users.createdAt, users.username)
    .all()
    .map(toSessionUser);
}

export async function createUser(
  username: string,
  password: string,
  role: Role,
): Promise<
  { ok: true; user: SessionUser } | { ok: false; error: 'username_taken' | 'invalid_username' }
> {
  if (!USERNAME_PATTERN.test(username)) return { ok: false, error: 'invalid_username' };
  const existing = byUsername(username);
  // A row with an empty hash is a phantom from the setup interim window (review finding
  // T2-C1), not an account: nobody can sign in as it and it holds no sessions, so the
  // owner setting up can claim it in place instead of being turned away.
  if (existing && existing.passwordHash) return { ok: false, error: 'username_taken' };
  const passwordHash = await hashPassword(password);
  if (existing) {
    db.update(users)
      .set({ passwordHash, role, updatedAt: now() })
      .where(eq(users.id, existing.id))
      .run();
    return { ok: true, user: toSessionUser({ ...existing, role }) };
  }
  const id = nanoid();
  try {
    db.insert(users).values({ id, username, passwordHash, role }).run();
  } catch (err) {
    // The unique index is the real check: two creates of the same name can race. Only a
    // constraint failure means the name was taken; anything else (a full disk, a closed
    // database) must surface instead of reading as "username_taken" (T3 review, minor 3).
    if (!isConstraintError(err)) throw err;
    return { ok: false, error: 'username_taken' };
  }
  return { ok: true, user: { id, username, role } };
}

/** Whether an error is SQLite refusing a constraint (better-sqlite3's error codes). */
const isConstraintError = (err: unknown) =>
  typeof (err as { code?: unknown })?.code === 'string' &&
  (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT');

/**
 * Checks a username/password pair. Returns the account or null; a missing user (or one
 * without a password, as in the setup interim window) still spends the hashing time, so
 * neither wrong usernames nor wrong passwords can be told apart.
 */
export async function verifyLogin(username: string, password: string): Promise<SessionUser | null> {
  const row = byUsername(username);
  if (!row || !row.passwordHash) {
    await hashPassword(password);
    return null;
  }
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  db.update(users).set({ lastLoginAt: now() }).where(eq(users.id, row.id)).run();
  return toSessionUser(row);
}

/** Changes a role, refusing to leave the server without an admin. */
export function setUserRole(id: string, role: Role): { ok: boolean; error?: 'last_admin' } {
  const row = byId(id);
  if (!row) return { ok: false };
  if (row.role === 'admin' && role !== 'admin' && countAdmins() <= 1) {
    return { ok: false, error: 'last_admin' };
  }
  db.update(users).set({ role, updatedAt: now() }).where(eq(users.id, id)).run();
  return { ok: true };
}

/** Sets a new password and signs that user out everywhere. False for an unknown user. */
export async function resetUserPassword(id: string, password: string): Promise<boolean> {
  if (!byId(id)) return false;
  const passwordHash = await hashPassword(password);
  db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, id)).run();
  deleteSessionsForUser(id);
  return true;
}

/**
 * Deletes an account (its sessions cascade). Refuses to delete the caller themselves, or
 * the last admin — either would lock everyone out of user management.
 */
export function deleteUser(
  id: string,
  actorId: string,
): { ok: boolean; error?: 'self' | 'last_admin' } {
  if (id === actorId) return { ok: false, error: 'self' };
  const row = byId(id);
  if (!row) return { ok: false };
  if (row.role === 'admin' && countAdmins() <= 1) return { ok: false, error: 'last_admin' };
  db.delete(users).where(eq(users.id, id)).run();
  return { ok: true };
}

/**
 * Changes your own password after checking the current one, then signs out every session
 * of that user except the one passed in (when it is).
 */
export async function changeOwnPassword(
  id: string,
  currentPassword: string,
  newPassword: string,
  keepSessionToken?: string,
): Promise<{ ok: boolean; error?: 'wrong_password' }> {
  const row = byId(id);
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return { ok: false, error: 'wrong_password' };
  }
  const passwordHash = await hashPassword(newPassword);
  db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, id)).run();
  if (keepSessionToken) deleteOtherSessions(id, keepSessionToken);
  else deleteSessionsForUser(id);
  return { ok: true };
}

/** The account a live session belongs to, or null. Never includes the password hash. */
export function sessionUser(token: string | undefined): SessionUser | null {
  const userId = sessionUserId(token);
  if (!userId) return null;
  const row = byId(userId);
  return row ? toSessionUser(row) : null;
}
