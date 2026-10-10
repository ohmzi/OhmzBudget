import type { RequestHandler } from 'express';
import { serverMode } from '../config.js';
import { touchToken, verifyBearer, type Scope } from '../auth/serviceTokens.js';
import type { AuthedLocals } from '../types.js';

/**
 * Auth for machine callers (paperless webhook, sidecar): a scoped bearer token instead of
 * the session cookie. Mounted BEFORE `requireSession` (see index.ts), it is the bypass of
 * the session gate for exactly the paths it is mounted on — a bearer token buys nothing
 * anywhere else, and `/api/service/whoami` accepts no cookie.
 *
 * Desktop and dev mode have no tokens at all: the guard stands aside there, where the
 * desktop's per-launch API token and the loopback binding already protect the API.
 */
export function serviceAuth(requiredScope: Scope): RequestHandler {
  return (req, res, next) => {
    if (!serverMode) return next();
    // Unknown, revoked and malformed headers are one answer: nothing about a token may
    // leak whether it ever existed
    const token = verifyBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!token.scopes.includes(requiredScope)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    touchToken(token.id);
    // Routes behind this read the caller from res.locals (see AuthedLocals)
    (res.locals as AuthedLocals).service = { name: token.name, scopes: token.scopes };
    next();
  };
}
