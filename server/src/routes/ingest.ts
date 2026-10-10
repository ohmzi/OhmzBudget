import { Router } from 'express';

// Behind serviceAuth('ingest') (see index.ts): the paperless webhook's half of the
// machine-caller path. This is a stub so the sidecar path can be proven end to end;
// M2 replaces it with the real ingest pipeline.

export const ingestRouter = Router();

ingestRouter.post('/paperless', (_req, res) => {
  res.json({ ok: true });
});
