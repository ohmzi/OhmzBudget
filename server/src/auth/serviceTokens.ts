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
    .map((row) => ({ ...row, scopes: parseScopes(row.scopes) }));
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
