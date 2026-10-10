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
  listSessions,
  touchSession,
  verifyDeviceToken,
} from '../auth/sessions.js';
import {
  changeOwnPassword,
  createUser,
  isSetupNeeded,
  sessionUser,
  verifyLogin,
  type SessionUser,
} from '../auth/users.js';
import { checkSetupCode, clearSetupCode, setupCode } from '../auth/setupCode.js';
import type { AuthedLocals } from '../types.js';

// Login for server mode (Docker / self-hosted): accounts live in `users` (see
// auth/users.ts), every session belongs to one of them, and the routes below are
// scoped to the caller. The first visit creates the admin account with the one-time
// setup code from the server log (see auth/setupCode.ts).

export const authRouter = Router();

const password = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);
// Mirrors USERNAME_PATTERN in auth/users.ts
const username = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/);
const usernameError =
  'Username must be 1-64 characters of letters, digits, dots, dashes or underscores';

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
  // sessionUser answers both questions at once: a live session whose account still exists
  const user = serverMode ? sessionUser(sessionToken(req)) : null;
  const needsSetup = serverMode && isSetupNeeded();
  // Make sure a setup code has been printed to the log (e.g. right after a restart)
  if (needsSetup) setupCode();
  res.json({
    enabled: serverMode,
    needsSetup,
    authenticated: !serverMode || user !== null,
    user,
  });
});

// Set once the gate below has been passed and spans the create: two concurrent valid-code
// setups must not both see isSetupNeeded() true and each create an admin (T4 review fix).
// The loser is turned away with the same 409 a later setup gets.
let setupInFlight = false;

authRouter.post('/setup', authRateLimit, async (req, res) => {
  if (!serverMode) return res.status(404).json({ error: 'Not found' });
  const parsed = z
    .object({ username, password, setupCode: z.string().max(100).optional() })
    .safeParse(req.body);
  // The body is validated before the already-set-up gate, so a malformed one is always
  // a 400 naming the field that is wrong
  if (!parsed.success) {
    const usernameOk = username.safeParse(
      (req.body as { username?: unknown } | undefined)?.username,
    ).success;
    return res.status(400).json({
      error: usernameOk
        ? `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`
        : usernameError,
    });
  }
  if (setupInFlight || !isSetupNeeded()) {
    return res.status(409).json({ error: 'A password has already been set' });
  }
  if (!checkSetupCode(parsed.data.setupCode)) {
    return res.status(403).json({ error: 'Incorrect setup code' });
  }
  // From here to createUser there is no await, so a second request can only see the flag:
  // exactly one setup can be in flight, and one admin comes out of it
  setupInFlight = true;
  try {
    // createUser adopts an empty-hash phantom row with this name (the setup interim window)
    // instead of turning it down; a name of a real account or a lost race is still a 409
    const created = await createUser(parsed.data.username, parsed.data.password, 'admin');
    if (!created.ok) {
      return created.error === 'username_taken'
        ? res.status(409).json({ error: 'A password has already been set' })
        : res.status(400).json({ error: usernameError });
    }
    clearSetupCode();
    startSession(req, res, created.user);
    res.status(204).send();
  } finally {
    setupInFlight = false;
  }
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  if (!serverMode) return res.status(404).json({ error: 'Not found' });
  const parsed = z
    .object({ username: z.string().max(64), password: z.string().max(MAX_PASSWORD_LENGTH) })
    .safeParse(req.body);
  // One message and one timing for every failure (unknown account, phantom row, wrong
  // password): nothing here may reveal whether a username exists
  if (!parsed.success) return res.status(401).json({ error: 'Incorrect password' });
  const user = await verifyLogin(parsed.data.username, parsed.data.password);
  if (!user) return res.status(401).json({ error: 'Incorrect password' });
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
function signedIn(
  req: Request,
  res: Response<unknown, AuthedLocals>,
): { token: string; user: SessionUser } | null {
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
  const user = sessionUser(token);
  if (user) {
    touchSession(token);
    // Routes behind this read the caller from res.locals (see AuthedLocals)
    (res.locals as AuthedLocals).user = user;
    return next();
  }
  res.status(401).json({ error: 'Login required' });
};
