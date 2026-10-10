import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { and, eq, gt, lte, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authConfig, sessions, users } from '../db/schema.js';

// Server-mode login: accounts live in `users` and every session belongs to one of them,
// so sessions are listed and signed out per user and die with their row. Sessions are
// random 256-bit tokens; only their SHA-256 is stored, so a leaked database doesn't leak
// live sessions.

export const SESSION_COOKIE = 'ohmzbudget_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONFIG_ID = 'server';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

// --- Trusted devices ---
// Browsers that have signed in get a long-lived "device" cookie (OWASP's defense
// against lockout attacks): failed logins from a known device are rate limited on
// their own, so someone guessing passwords, even from behind the same reverse proxy
// or NAT, can't lock the owner out. The cookie is an HMAC keyed by the install secret
// (auth_config.secret, created at startup and never rotated), never by any user's
// password hash, so only this server can issue one.

export const DEVICE_COOKIE = 'ohmzbudget_device';
export const DEVICE_TTL_MS = 400 * 24 * 60 * 60 * 1000; // the longest browsers keep a cookie

function deviceSignature(id: string): Buffer | null {
  // Read the fresh row on every call: the secret is created at startup, not cached here
  const row = db
    .select({ secret: authConfig.secret })
    .from(authConfig)
    .where(eq(authConfig.id, CONFIG_ID))
    .get();
  return row?.secret ? createHmac('sha256', row.secret).update(`device:${id}`).digest() : null;
}

/** A new device cookie value, or null if no install secret is set yet. */
export function createDeviceToken(): string | null {
  const id = randomBytes(18).toString('base64url');
  const signature = deviceSignature(id);
  return signature ? `${id}.${signature.toString('base64url')}` : null;
}

/** The device id if the cookie value is one this server issued (for the current secret). */
export function verifyDeviceToken(token: string | undefined): string | null {
  const [id, sig, extra] = (token ?? '').split('.');
  if (!id || !sig || extra !== undefined || id.length > 64) return null;
  const expected = deviceSignature(id);
  const given = Buffer.from(sig, 'base64url');
  if (!expected || given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}

/** Longest user agent kept for the signed-in devices list */
const MAX_USER_AGENT_LENGTH = 256;

/** A user agent header made safe to store and show: no control characters, capped. */
export function cleanUserAgent(userAgent: string | undefined): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = (userAgent ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return cleaned ? cleaned.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

// --- Sessions ---
// Every session belongs to one user; every operation below is scoped to that user.

export function createSession(
  userId: string,
  userAgent?: string,
): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const now = new Date().toISOString();
  db.insert(sessions)
    .values({
      id: digest(token),
      userId,
      expiresAt: expiresAt.toISOString(),
      userAgent: cleanUserAgent(userAgent),
      lastUsedAt: now,
    })
    .run();
  return { token, expiresAt };
}

/** The user a live session belongs to, or null when it is unknown, expired or its user is gone. */
export function sessionUserId(token: string | undefined): string | null {
  if (!token) return null;
  const row = db
    .select({ userId: sessions.userId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, digest(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .get();
  return row?.userId ?? null;
}

export function isValidSession(token: string | undefined): boolean {
  return sessionUserId(token) !== null;
}

export function deleteSession(token: string | undefined) {
  if (token)
    db.delete(sessions)
      .where(eq(sessions.id, digest(token)))
      .run();
}

/** Signs out every session of one user. Returns how many were deleted. */
export function deleteSessionsForUser(userId: string): number {
  return db.delete(sessions).where(eq(sessions.userId, userId)).run().changes;
}

export function deleteExpiredSessions() {
  db.delete(sessions).where(lte(sessions.expiresAt, new Date().toISOString())).run();
}

// --- Signed-in devices ---
// Settings → Server lists the caller's own sessions so they can sign out a lost phone. The
// list never includes the stored id (the token's hash): each session gets a public id that
// is a hash of that hash, which can name a session but can't be turned into a cookie.

/** How often "last used" is written for a session that keeps making requests */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouched = new Map<string, number>();

export const publicSessionId = (storedId: string) => digest(`session:${storedId}`).slice(0, 12);

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
  current: boolean;
}

/** Records that a valid session was used (at most every few minutes per session). */
export function touchSession(token: string | undefined) {
  if (!token) return;
  const id = digest(token);
  const now = Date.now();
  if (now - (lastTouched.get(id) ?? 0) < TOUCH_INTERVAL_MS) return;
  lastTouched.set(id, now);
  // Don't let the map grow with sessions that ended long ago
  if (lastTouched.size > 1000) {
    for (const [key, at] of lastTouched) if (now - at >= TOUCH_INTERVAL_MS) lastTouched.delete(key);
  }
  db.update(sessions)
    .set({ lastUsedAt: new Date(now).toISOString() })
    .where(eq(sessions.id, id))
    .run();
}

/** One user's live sessions, newest first, with the caller's own marked `current`. */
export function listSessions(userId: string, currentToken: string | undefined): SessionInfo[] {
  const current = currentToken ? digest(currentToken) : '';
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date().toISOString())))
    .all()
    .map((s) => ({
      id: publicSessionId(s.id),
      // SQLite's datetime('now') is UTC without the ISO "T" and "Z"
      createdAt: /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s.createdAt)
        ? `${s.createdAt.replace(' ', 'T')}Z`
        : s.createdAt,
      expiresAt: s.expiresAt,
      lastUsedAt: s.lastUsedAt,
      userAgent: s.userAgent,
      current: s.id === current,
    }))
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));
}

/** Signs out one of this user's sessions by its public id. Returns whether one was found. */
export function deleteSessionByPublicId(userId: string, publicId: string): boolean {
  const match = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all()
    .find((s) => publicSessionId(s.id) === publicId);
  if (!match) return false;
  db.delete(sessions).where(eq(sessions.id, match.id)).run();
  return true;
}

/** Signs out every session of this user except the current one. Returns how many were signed out. */
export function deleteOtherSessions(userId: string, currentToken: string): number {
  return db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, digest(currentToken))))
    .run().changes;
}
