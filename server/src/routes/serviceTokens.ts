import { Router } from 'express';
import { z } from 'zod';
import { listTokens, mintToken, revokeToken } from '../auth/serviceTokens.js';

// Admin-only routes for machine callers' bearer tokens (Settings → Server → API tokens),
// behind requireAdmin (middleware/adminGuard.ts). The plaintext token is returned by the
// create route below and by nothing else, ever: the list carries the safe shape only.

export const serviceTokensRouter = Router();

const name = z.string().trim().min(1).max(100);
const scopes = z
  .array(z.enum(['service', 'ingest']))
  .min(1)
  .max(2)
  .refine((s) => new Set(s).size === s.length, 'duplicate scope');
const nameError = 'Name must be 1-100 characters';
const scopesError = 'Scopes must be service, ingest, or both';

serviceTokensRouter.get('/', (_req, res) => {
  res.json(listTokens());
});

serviceTokensRouter.post('/', (req, res) => {
  const parsed = z.object({ name, scopes }).safeParse(req.body);
  if (!parsed.success) {
    const body = (req.body ?? {}) as { name?: unknown };
    return res
      .status(400)
      .json({ error: name.safeParse(body.name).success ? scopesError : nameError });
  }
  const { token, id } = mintToken(parsed.data.name, parsed.data.scopes);
  res.status(201).json({ id, name: parsed.data.name, scopes: parsed.data.scopes, token });
});

serviceTokensRouter.delete('/:id', (req, res) => {
  // Revoking is idempotent (revoked stays revoked); only an id that was never stored is 404
  if (!revokeToken(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
