import { Router, type Request, type RequestHandler, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { serverMode } from '../config.js';
import { readCookie } from '../middleware/security.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../auth/password.js';
import {
  DEVICE_COOKIE,
  DEVICE_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createDeviceToken,
  createSession,
  deleteOtherSessions,
  deleteSession,
  deleteSessionByPublicId,
  isPasswordSet,
  isValidSession,
  listSessions,
  setInitialPassword,
  touchSession,
  verifyDeviceToken,
} from '../auth/sessions.js';
import {
  changeOwnPassword,
  createUser,
  listUsers,
  sessionUser,
  verifyLogin,
  type SessionUser,
} from '../auth/users.js';
import { checkSetupCode, clearSetupCode, setupCode } from '../auth/setupCode.js';

// Login for server mode (Docker / self-hosted). Sessions belong to a user (see auth/users.ts).
//
// INTERIM: this interim layer still signs in the server's single account with the password
// from the old auth_config row. Task 4 replaces it with username-based setup and login
// (`createUser` from the request, `verifyLogin`, `sessionUser` in /status), which is also
// when `isPasswordSet()` gives way to `isSetupNeeded()`.

export const authRouter = Router();

const password = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

/**
 * Slows password guessing: failed attempts are limited per IP, or per trusted device
 * for browsers that signed in before (see DEVICE_COOKIE), so the owner can't be locked
 * out by someone else behind the same proxy or NAT. Successes don't count.
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const device = verifyDeviceToken(readCookie(req.headers.cookie, DEVICE_COOKIE));
    return device ? `device:${device}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' },
});

const sessionToken = (req: Request) => readCookie(req.headers.cookie, SESSION_COOKIE);

/** The interim single-password layer's account: the one account this server has. */
const singleUser = (): SessionUser | null => listUsers()[0] ?? null;

/** Creates the interim `admin` account for a fresh single-password setup. */
async function createSingleAccount(password: string): Promise<SessionUser | null> {
  const created = await createUser('admin', password, 'admin');
  return created.ok ? created.user : null;
}

function startSession(req: Request, res: Response, user: SessionUser) {
  const { token } = createSession(user.id, req.headers['user-agent']);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    // Behind an HTTPS reverse proxy (with OHMZBUDGET_TRUST_PROXY set), mark it Secure
    secure: req.secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  trustDevice(req, res);
}

/** Marks this browser as a trusted device (only sent to the login routes). */
function trustDevice(req: Request, res: Response) {
  const device = createDeviceToken();
  if (device) {
    res.cookie(DEVICE_COOKIE, device, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: DEVICE_TTL_MS,
      path: '/api/auth',
    });
  }
}

authRouter.get('/status', (req, res) => {
  const needsSetup = serverMode && !isPasswordSet();
  // Make sure a setup code has been printed to the log (e.g. after reset-password)
  if (needsSetup) setupCode();
  res.json({
    enabled: serverMode,
    needsSetup,
    authenticated: !serverMode || isValidSession(sessionToken(req)),
  });
});

authRouter.post('/setup', authRateLimit, async (req, res) => {
  if (!serverMode) return res.status(404).json({ error: 'Not found' });
  const parsed = z
    .object({ password, setupCode: z.string().max(100).optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
    });
  }
  if (isPasswordSet()) return res.status(409).json({ error: 'A password has already been set' });
  if (!checkSetupCode(parsed.data.setupCode)) {
    return res.status(403).json({ error: 'Incorrect setup code' });
  }
  if (!(await setInitialPassword(parsed.data.password))) {
    return res.status(409).json({ error: 'A password has already been set' });
  }
  clearSetupCode();
  // An upgraded install already has the backfilled admin; a fresh one gets `admin` here.
  const user = singleUser() ?? (await createSingleAccount(parsed.data.password));
  if (!user) return res.status(409).json({ error: 'A password has already been set' });
  startSession(req, res, user);
  res.status(204).send();
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  if (!serverMode) return res.status(404).json({ error: 'Not found' });
  const parsed = z.object({ password: z.string().max(MAX_PASSWORD_LENGTH) }).safeParse(req.body);
  if (!parsed.success) return res.status(401).json({ error: 'Incorrect password' });
  const user = singleUser();
  // A missing account still spends a hash (verifyLogin), so timing reveals nothing
  const matched = await verifyLogin(user?.username ?? '', parsed.data.password);
  if (!user || !matched) return res.status(401).json({ error: 'Incorrect password' });
  startSession(req, res, user);
  res.status(204).send();
});

authRouter.post('/logout', (req, res) => {
  deleteSession(sessionToken(req));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).send();
});

authRouter.post('/change-password', authRateLimit, async (req, res) => {
  if (!serverMode) return res.status(404).json({ error: 'Not found' });
  const session = signedIn(req, res);
  if (!session) return;
  const parsed = z
    .object({ currentPassword: z.string().max(MAX_PASSWORD_LENGTH), newPassword: password })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: `New password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
    });
  }
  const changed = await changeOwnPassword(
    session.user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
    session.token,
  );
  if (!changed.ok) return res.status(401).json({ error: 'Current password is incorrect' });
  // This browser keeps a trusted-device cookie (keyed by the install secret, not a password)
  trustDevice(req, res);
  res.status(204).send();
});

// --- Signed-in devices (Settings → Server) ---
// Each session is named by an opaque public id (see publicSessionId), never by the
// stored hash, so nothing here can be turned back into a login. Every route is scoped
// to the caller's own sessions.

/** The caller's session (token and user), or null after answering 404 / 401. */
function signedIn(req: Request, res: Response): { token: string; user: SessionUser } | null {
  if (!serverMode) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const token = sessionToken(req);
  const user = sessionUser(token);
  if (!token || !user) {
    res.status(401).json({ error: 'Login required' });
    return null;
  }
  return { token, user };
}

authRouter.get('/sessions', (req, res) => {
  const session = signedIn(req, res);
  if (session) res.json(listSessions(session.user.id, session.token));
});

authRouter.post('/sessions/sign-out-others', (req, res) => {
  const session = signedIn(req, res);
  if (session) res.json({ signedOut: deleteOtherSessions(session.user.id, session.token) });
});

authRouter.delete('/sessions/:id', (req, res) => {
  const session = signedIn(req, res);
  if (!session) return;
  const id = req.params.id;
  if (!/^[0-9a-f]{12}$/.test(id)) return res.status(400).json({ error: 'Invalid session id' });
  const current = listSessions(session.user.id, session.token).find((s) => s.current)?.id === id;
  if (!deleteSessionByPublicId(session.user.id, id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (current) res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).send();
});

/** In server mode, every API request except health and login needs a valid session. */
export const requireSession: RequestHandler = (req, res, next) => {
  if (!serverMode || req.path === '/health' || req.path.startsWith('/auth/')) return next();
  const token = sessionToken(req);
  if (isValidSession(token)) {
    touchSession(token);
    return next();
  }
  res.status(401).json({ error: 'Login required' });
};
