import { Router } from 'express';
import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../auth/password.js';
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserRole,
} from '../auth/users.js';
import type { AuthedLocals } from '../types.js';

// Admin-only routes for server mode's accounts (Settings → Server → Users). Every route
// is behind requireAdmin (middleware/adminGuard.ts), which proved from res.locals that
// the caller is a signed-in admin. Ghost rows (empty password hash, see auth/users.ts)
// are not accounts: they read and write as "not found" here, never as users.

export const usersRouter = Router();

// Mirrors the pattern in auth/users.ts, and the copy in routes/auth.ts
const username = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/);
const usernameError =
  'Username must be 1-64 characters of letters, digits, dots, dashes or underscores';
const password = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);
const passwordError = `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`;
const role = z.enum(['admin', 'member']);
const roleError = 'Role must be admin or member';

/** Names the field that is wrong, like routes/auth.ts does for setup and login. */
function createError(body: unknown): string {
  const fields = (body ?? {}) as { username?: unknown; password?: unknown; role?: unknown };
  if (!username.safeParse(fields.username).success) return usernameError;
  if (!password.safeParse(fields.password).success) return passwordError;
  return roleError;
}

/** The account with this id, or undefined: unknown ids and ghost rows are not accounts. */
const findUser = (id: string) => listUsers().find((u) => u.id === id);

usersRouter.get('/', (_req, res) => {
  res.json(listUsers());
});

usersRouter.post('/', async (req, res) => {
  const parsed = z.object({ username, password, role }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: createError(req.body) });
  const created = await createUser(parsed.data.username, parsed.data.password, parsed.data.role);
  if (!created.ok) {
    // The unique index is the real check: two creates of one name can race. A ghost row
    // holding the name is claimed in place instead (see createUser).
    return created.error === 'username_taken'
      ? res.status(409).json({ error: 'username_taken' })
      : res.status(400).json({ error: usernameError });
  }
  res.status(201).json({ user: created.user });
});

usersRouter.patch('/:id', (req, res) => {
  const parsed = z.object({ role }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: roleError });
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  // Nothing can remove the row between the lookup and the write (both synchronous), so a
  // refusal here can only be the last-admin rule
  if (!setUserRole(user.id, parsed.data.role).ok) {
    return res.status(409).json({ error: 'last_admin' });
  }
  res.json({ user: { ...user, role: parsed.data.role } });
});

usersRouter.post('/:id/reset-password', async (req, res) => {
  const parsed = z.object({ password }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: passwordError });
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  await resetUserPassword(user.id, parsed.data.password);
  res.status(204).send();
});

usersRouter.delete('/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  // requireAdmin ran first: the caller is a signed-in admin, so there is always an id
  const actorId = (res.locals as AuthedLocals).user?.id ?? '';
  const result = deleteUser(user.id, actorId);
  if (!result.ok) {
    if (result.error === 'self') return res.status(409).json({ error: 'self' });
    if (result.error === 'last_admin') return res.status(409).json({ error: 'last_admin' });
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).send();
});
