import { apiFetch } from './client';

// Server mode's accounts (Settings → Server → Users). Admin-only on the server, so members
// never load this: the settings UI hides it for them.

export type Role = 'admin' | 'member';

/** The safe shape of an account: never the password hash (mirrors the server's SessionUser). */
export interface User {
  id: string;
  username: string;
  role: Role;
}

export const getUsers = () => apiFetch<User[]>('/users');

export const createUser = (username: string, password: string, role: Role) =>
  apiFetch<{ user: User }>('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  });

export const setUserRole = (id: string, role: Role) =>
  apiFetch<{ user: User }>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

export const resetUserPassword = (id: string, password: string) =>
  apiFetch<void>(`/users/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

export const deleteUser = (id: string) =>
  apiFetch<void>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
