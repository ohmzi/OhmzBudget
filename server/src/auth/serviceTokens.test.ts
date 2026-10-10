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
});
