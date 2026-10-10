import { apiFetch } from './client';
import type { Role } from './users';

// Login for server mode (Docker / self-hosted). The desktop app and `npm run dev`
// report `enabled: false` and never show a login screen.

/** The signed-in account (server mode): the safe shape, never the password hash. */
export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

export interface AuthStatus {
  enabled: boolean;
  needsSetup: boolean;
  authenticated: boolean;
  /** Null in the desktop app and dev, and while signed out. */
  user: AuthUser | null;
}

export const getAuthStatus = () => apiFetch<AuthStatus>('/auth/status');

export const setup = (username: string, password: string, setupCode: string) =>
  apiFetch<void>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ username, password, setupCode }),
  });

export const login = (username: string, password: string) =>
  apiFetch<void>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const logout = () => apiFetch<void>('/auth/logout', { method: 'POST' });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<void>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
