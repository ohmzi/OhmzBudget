import { beforeAll, describe, expect, it } from 'vitest';
process.env.OHMZBUDGET_SERVER_MODE = 'true';
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../db/index.js');
const { listTokens, mintToken, revokeToken, verifyBearer } = await import('./serviceTokens.js');

beforeAll(() => migrate(db, { migrationsFolder: 'src/db/migrations' }));

describe('service tokens', () => {
  it('mints a prefixed token, stores only its hash, verifies and lists without the hash', () => {
    const { token, id } = mintToken('paperless webhook', ['ingest']);
    expect(token).toMatch(/^ozb_[A-Za-z0-9_-]{43}$/);
    expect(verifyBearer(`Bearer ${token}`)).toMatchObject({ id, scopes: ['ingest'] });
    expect(listTokens().find((t) => t.id === id)).not.toHaveProperty('tokenHash');
  });

  it('rejects unknown, malformed and revoked tokens', () => {
    expect(verifyBearer('Bearer ozb_nope')).toBeNull();
    expect(verifyBearer(undefined)).toBeNull();
    const { token, id } = mintToken('t', ['service']);
    revokeToken(id);
    expect(verifyBearer(`Bearer ${token}`)).toBeNull();
  });

  it('keeps only the hash at rest and lists revocation times', () => {
    const { token, id } = mintToken('sidecar', ['service', 'ingest']);
    expect(JSON.stringify(db.$client.prepare('select * from service_tokens').all())).not.toContain(
      token,
    );
    expect(listTokens().find((t) => t.id === id)).toMatchObject({
      name: 'sidecar',
      scopes: ['service', 'ingest'],
      revokedAt: null,
      lastUsedAt: null,
    });
    expect(revokeToken(id)).toBe(true);
    expect(listTokens().find((t) => t.id === id)?.revokedAt).toBeTruthy();
    expect(revokeToken('missing')).toBe(false);
  });

  it('parses malformed scope lists defensively', () => {
    const { id } = mintToken('broken', ['service']);
    db.$client.prepare('update service_tokens set scopes = ? where id = ?').run('not json', id);
    expect(listTokens().find((t) => t.id === id)?.scopes).toEqual([]);
    db.$client.prepare('update service_tokens set scopes = ? where id = ?').run('["admin",1]', id);
    expect(listTokens().find((t) => t.id === id)?.scopes).toEqual([]);
  });

  it('normalizes createdAt to ISO UTC (SQLite writes datetime("now") without T and Z)', () => {
    const { id } = mintToken('clock', ['service']);
    // The column default is SQLite's datetime('now'): UTC, but not ISO, and the client
    // would parse a "2026-10-10 08:18:45" string as local time (T4 review fix)
    const stored = db.$client
      .prepare('select created_at from service_tokens where id = ?')
      .get(id) as { created_at: string };
    expect(stored.created_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    const createdAt = listTokens().find((t) => t.id === id)!.createdAt;
    expect(createdAt).toBe(`${stored.created_at.replace(' ', 'T')}Z`);
    expect(createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });
});
