import { Router, type Response } from 'express';
import type { AuthedLocals } from '../types.js';

// The sidecar's half of the machine-caller path, mounted behind serviceAuth (see
// index.ts).

export const serviceRouter = Router();

/** Who the bearer token is: its name and scopes, never its id or hash. */
serviceRouter.get('/whoami', (_req, res: Response<unknown, AuthedLocals>) => {
  const service = res.locals.service;
  if (!service) {
    // Only reachable outside server mode, where serviceAuth stands aside and there are
    // no tokens at all — these routes don't exist there (same as /api/auth)
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ name: service.name, scopes: service.scopes });
});
