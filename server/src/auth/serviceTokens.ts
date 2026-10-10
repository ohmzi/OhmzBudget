import { createHash, randomBytes } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { serviceTokens } from '../db/schema.js';

// Bearer tokens for machine callers (paperless webhook, sidecar). The plaintext is shown
// once at creation and only its SHA-256 is stored, so a leaked database can't be turned
// into API calls; revoking is a timestamp, which keeps the row for the Settings list.

export type Scope = 'service' | 'ingest';

const TOKEN_PREFIX = 'ozb_';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export interface TokenInfo {
  id: string;
  name: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Scopes are a JSON array in the row; anything unexpected reads as no scopes at all. */
function parseScopes(json: string): Scope[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is Scope => scope === 'service' || scope === 'ingest');
  } catch {
    return [];
  }
}

/** Mints `ozb_` + 32 random bytes (base64url) and stores only its hash. */
export function mintToken(name: string, scopes: Scope[]): { token: string; id: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const id = nanoid();
  db.insert(serviceTokens)
    .values({ id, name, tokenHash: digest(token), scopes: JSON.stringify(scopes) })
    .run();
  return { token, id };
}

/** Every token (revoked ones too, with their timestamp), newest first. Never the hash. */
export function listTokens(): TokenInfo[] {
  return db
    .select({
      id: serviceTokens.id,
      name: serviceTokens.name,
      scopes: serviceTokens.scopes,
      createdAt: serviceTokens.createdAt,
      lastUsedAt: serviceTokens.lastUsedAt,
      revokedAt: serviceTokens.revokedAt,
    })
    .from(serviceTokens)
    .orderBy(desc(serviceTokens.createdAt), serviceTokens.name)
    .all()
    .map((row) => ({
      ...row,
      // SQLite's datetime('now') is UTC without the ISO "T" and "Z" (same as listSessions
      // in auth/sessions.ts): without this the client parses it as local time
      createdAt: /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row.createdAt)
        ? `${row.createdAt.replace(' ', 'T')}Z`
        : row.createdAt,
      scopes: parseScopes(row.scopes),
    }));
}

/** The token behind an exactly-`Authorization: Bearer ozb_…` header, or null when unknown or revoked. */
export function verifyBearer(
  header: string | undefined,
): { id: string; name: string; scopes: Scope[] } | null {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match) return null;
  const row = db
    .select()
    .from(serviceTokens)
    .where(eq(serviceTokens.tokenHash, digest(match[1])))
    .get();
  if (!row || row.revokedAt !== null) return null;
  return { id: row.id, name: row.name, scopes: parseScopes(row.scopes) };
}

// How often "last used" is written for a token that keeps making requests. Mirrors
// touchSession in auth/sessions.ts, for the same reason: the Settings list wants to show
// recent activity without a write on every request.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouched = new Map<string, number>();

/** Records that a token was used (at most every few minutes per token). */
export function touchToken(id: string) {
  const now = Date.now();
  if (now - (lastTouched.get(id) ?? 0) < TOUCH_INTERVAL_MS) return;
  lastTouched.set(id, now);
  // Don't let the map grow with tokens that were revoked long ago
  if (lastTouched.size > 1000) {
    for (const [key, at] of lastTouched) if (now - at >= TOUCH_INTERVAL_MS) lastTouched.delete(key);
  }
  db.update(serviceTokens)
    .set({ lastUsedAt: new Date(now).toISOString() })
    .where(eq(serviceTokens.id, id))
    .run();
}

/** Revokes a token. False when no such token exists (already-revoked stays true). */
export function revokeToken(id: string): boolean {
  return (
    db
      .update(serviceTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(serviceTokens.id, id))
      .run().changes > 0
  );
}
