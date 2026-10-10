import { apiFetch } from './client';

// Bearer tokens for machine callers (Settings → Server → API tokens). Admin-only on the
// server. The plaintext comes back from createServiceToken and from nothing else, ever:
// the list carries the safe shape only.

export type Scope = 'service' | 'ingest';

export interface ServiceToken {
  id: string;
  name: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedServiceToken {
  id: string;
  name: string;
  scopes: Scope[];
  /** The plaintext token: shown once, at creation, and never again. */
  token: string;
}

export const getServiceTokens = () => apiFetch<ServiceToken[]>('/service-tokens');

export const createServiceToken = (name: string, scopes: Scope[]) =>
  apiFetch<CreatedServiceToken>('/service-tokens', {
    method: 'POST',
    body: JSON.stringify({ name, scopes }),
  });

export const revokeServiceToken = (id: string) =>
  apiFetch<void>(`/service-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
