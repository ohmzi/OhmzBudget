import { apiFetch } from './client';
import type { PlaidItem, PlaidExchangeResult, PlaidSyncResult, AccountType } from '../types';

export const getPlaidStatus = () =>
  apiFetch<{ configured: boolean; environment: string | null }>('/plaid/status');

export const configurePlaid = (data: { clientId: string; secret: string; environment: string }) =>
  apiFetch<{ ok: boolean }>('/plaid/configure', { method: 'POST', body: JSON.stringify(data) });

export const createLinkToken = () =>
  apiFetch<{ linkToken: string }>('/plaid/link-token', { method: 'POST' });

export const exchangePublicToken = (data: {
  publicToken: string;
  institutionId: string;
  institutionName: string;
}) =>
  apiFetch<PlaidExchangeResult>('/plaid/exchange-token', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export interface AccountMappingAction {
  plaidAccountId: string;
  action: 'create' | 'link' | 'skip';
  accountId?: string;
  accountName?: string;
  accountType?: AccountType;
  isOffBudget?: number;
}

export const mapAccounts = (itemId: string, mappings: AccountMappingAction[]) =>
  apiFetch<{ mapped: number; created: number; skipped: number }>(
    `/plaid/items/${itemId}/map-accounts`,
    { method: 'POST', body: JSON.stringify({ mappings }) },
  );

export const getPlaidItems = () => apiFetch<PlaidItem[]>('/plaid/items');

export const syncItem = (itemId: string) =>
  apiFetch<PlaidSyncResult>(`/plaid/items/${itemId}/sync`, { method: 'POST' });

export const syncAll = () =>
  apiFetch<{ results: PlaidSyncResult[] }>('/plaid/sync-all', { method: 'POST' });

export const disconnectItem = (itemId: string) =>
  apiFetch<void>(`/plaid/items/${itemId}`, { method: 'DELETE' });

export const createUpdateLinkToken = (itemId: string) =>
  apiFetch<{ linkToken: string }>(`/plaid/items/${itemId}/update-link`, { method: 'POST' });
