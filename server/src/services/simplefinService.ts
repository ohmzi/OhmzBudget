export interface SimplefinAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'available-balance'?: string;
  'balance-date': number;
  transactions: SimplefinTransaction[];
}

export interface SimplefinTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  transacted_at?: number;
  pending?: boolean;
}

export interface SimplefinConnection {
  conn_id: string;
  name: string;
  org_id?: string;
  org_url?: string;
}

export interface SimplefinResponse {
  errors: string[];
  connections: SimplefinConnection[];
  accounts: SimplefinAccount[];
}

export async function claimAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf-8');

  if (!claimUrl.startsWith('https://')) {
    throw new Error('Invalid setup token: decoded URL must use HTTPS');
  }

  const response = await fetch(claimUrl, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to claim setup token: ${response.status} ${response.statusText}`);
  }

  const accessUrl = await response.text();
  if (!accessUrl.includes('@')) {
    throw new Error('Invalid access URL received from SimpleFIN');
  }

  return accessUrl.trim();
}

export async function fetchAccounts(
  accessUrl: string,
  startDate?: number,
): Promise<SimplefinResponse> {
  const url = new URL(accessUrl + '/accounts');
  url.searchParams.set('version', '2');
  if (startDate) url.searchParams.set('start-date', String(startDate));

  const credentials = Buffer.from(`${url.username}:${url.password}`).toString('base64');
  url.username = '';
  url.password = '';

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (response.status === 402) {
    throw new Error('SimpleFIN subscription required — visit simplefin.org to activate');
  }
  if (response.status === 403) {
    throw new Error('SimpleFIN access denied — token may have been revoked');
  }
  if (!response.ok) {
    throw new Error(`SimpleFIN error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<SimplefinResponse>;
}

export function simpleFinAmountToCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

export function simpleFinBalanceToCents(balance: string): number {
  return Math.round(parseFloat(balance) * 100);
}

export function connectionNameFromResponse(response: SimplefinResponse): string {
  if (response.connections.length > 0 && response.connections[0].name) {
    return response.connections[0].name;
  }
  return 'SimpleFIN Connection';
}
