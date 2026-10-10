import type { SessionUser } from './auth/users.js';

/**
 * `res.locals` of a request behind `requireSession`: the signed-in account (session
 * cookie) or the service token a machine caller presented. Routes read the caller from
 * here instead of re-reading cookies, so a route handler can be typed
 * `Response<unknown, AuthedLocals>`.
 */
export interface AuthedLocals {
  user?: SessionUser;
  service?: { name: string; scopes: string[] };
}
