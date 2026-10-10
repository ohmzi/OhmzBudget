import type { RequestHandler } from 'express';
import type { AuthedLocals } from '../types.js';

/**
 * Gate for the admin API (user management, service tokens). Mount it after
 * `requireSession`, which puts the signed-in account in res.locals: only an admin
 * passes; everyone else, signed in or not, gets 403. Desktop and dev mode have no
 * accounts at all, so nothing admin-only is reachable there either.
 */
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if ((res.locals as AuthedLocals).user?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};
