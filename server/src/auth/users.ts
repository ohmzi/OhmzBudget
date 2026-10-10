import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { authConfig, users } from '../db/schema.js';

// Multi-user accounts for server mode. The budget data is shared; roles gate
// administration, and machine callers (paperless, sidecar) use service tokens.

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
  if (countUsers() === 0 && legacy) {
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
