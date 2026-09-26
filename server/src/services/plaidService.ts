import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { db } from '../db/index.js';
import { plaidConfig } from '../db/schema.js';

type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment';

let plaidClient: PlaidApi | null = null;

function getCredentials() {
  const config = db.select().from(plaidConfig).get();
  if (!config) return null;
  return { clientId: config.clientId, secret: config.secret, environment: config.environment };
}

function getPlaidClient(): PlaidApi {
  if (plaidClient) return plaidClient;

  const creds = getCredentials();
  if (!creds) throw new Error('Plaid is not configured');

  const envMap: Record<string, string> = {
    sandbox: PlaidEnvironments.sandbox,
    development: PlaidEnvironments.development,
    production: PlaidEnvironments.production,
  };

  plaidClient = new PlaidApi(
    new Configuration({
      basePath: envMap[creds.environment] ?? PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': creds.clientId,
          'PLAID-SECRET': creds.secret,
        },
      },
    }),
  );
  return plaidClient;
}

export function invalidatePlaidClient() {
  plaidClient = null;
}

export function isPlaidConfigured(): boolean {
  return getCredentials() !== null;
}

export function getPlaidEnvironment(): string {
  const creds = getCredentials();
  return creds?.environment ?? 'sandbox';
}

export async function createLinkToken(itemId?: string): Promise<string> {
  const client = getPlaidClient();

  const request: any = {
    user: { client_user_id: 'local-user' },
    client_name: 'FlyBudget',
    language: 'en',
    country_codes: [CountryCode.Us],
  };

  if (itemId) {
    request.access_token = itemId;
  } else {
    request.products = [Products.Transactions];
  }

  const response = await client.linkTokenCreate(request);
  return response.data.link_token;
}

export async function createUpdateLinkToken(accessToken: string): Promise<string> {
  const client = getPlaidClient();
  const response = await client.linkTokenCreate({
    user: { client_user_id: 'local-user' },
    client_name: 'FlyBudget',
    language: 'en',
    country_codes: [CountryCode.Us],
    access_token: accessToken,
  });
  return response.data.link_token;
}

export interface PlaidAccountInfo {
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number;
  availableBalance: number | null;
}

export async function exchangePublicToken(publicToken: string) {
  const client = getPlaidClient();

  const exchangeResponse = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  const accountsResponse = await client.accountsGet({ access_token: accessToken });
  const item = accountsResponse.data.item;
  const plaidAccounts = accountsResponse.data.accounts;

  const accounts: PlaidAccountInfo[] = plaidAccounts.map((a) => ({
    plaidAccountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    type: a.type,
    subtype: a.subtype ?? null,
    mask: a.mask ?? null,
    currentBalance: a.balances.current ?? 0,
    availableBalance: a.balances.available ?? null,
  }));

  return {
    accessToken,
    itemId,
    institutionId: item.institution_id ?? '',
    accounts,
  };
}

export async function getInstitutionName(institutionId: string): Promise<string> {
  if (!institutionId) return 'Unknown Institution';
  try {
    const client = getPlaidClient();
    const response = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    return response.data.institution.name;
  } catch {
    return 'Unknown Institution';
  }
}

export interface PlaidSyncResult {
  added: Array<{
    transactionId: string;
    accountId: string;
    date: string;
    amount: number;
    name: string;
    merchantName: string | null;
    category: string[];
    pending: boolean;
  }>;
  modified: Array<{
    transactionId: string;
    accountId: string;
    date: string;
    amount: number;
    name: string;
    merchantName: string | null;
  }>;
  removed: Array<{ transactionId: string }>;
  nextCursor: string;
  accountBalances: Array<{
    accountId: string;
    current: number;
    available: number | null;
  }>;
}

export async function syncTransactions(
  accessToken: string,
  cursor: string | null,
): Promise<PlaidSyncResult> {
  const client = getPlaidClient();

  const allAdded: PlaidSyncResult['added'] = [];
  const allModified: PlaidSyncResult['modified'] = [];
  const allRemoved: PlaidSyncResult['removed'] = [];
  let nextCursor = cursor ?? '';
  let hasMore = true;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor || undefined,
    });

    const data = response.data;

    for (const t of data.added) {
      if (t.pending) continue;
      allAdded.push({
        transactionId: t.transaction_id,
        accountId: t.account_id,
        date: t.date,
        amount: t.amount,
        name: t.name,
        merchantName: t.merchant_name ?? null,
        category: t.category ?? [],
        pending: t.pending,
      });
    }

    for (const t of data.modified) {
      if (t.pending) continue;
      allModified.push({
        transactionId: t.transaction_id,
        accountId: t.account_id,
        date: t.date,
        amount: t.amount,
        name: t.name,
        merchantName: t.merchant_name ?? null,
      });
    }

    for (const t of data.removed) {
      allRemoved.push({ transactionId: t.transaction_id! });
    }

    nextCursor = data.next_cursor;
    hasMore = data.has_more;
  }

  let accountBalances: PlaidSyncResult['accountBalances'] = [];
  try {
    const balResponse = await client.accountsGet({ access_token: accessToken });
    accountBalances = balResponse.data.accounts.map((a) => ({
      accountId: a.account_id,
      current: a.balances.current ?? 0,
      available: a.balances.available ?? null,
    }));
  } catch {
    // Balance fetch is best-effort
  }

  return {
    added: allAdded,
    modified: allModified,
    removed: allRemoved,
    nextCursor,
    accountBalances,
  };
}

export function plaidAmountToCents(plaidAmount: number): number {
  return Math.round(-plaidAmount * 100);
}

export function mapPlaidAccountType(type: string, subtype: string | null): AccountType {
  if (type === 'depository') {
    if (
      subtype === 'savings' ||
      subtype === 'money market' ||
      subtype === 'hsa' ||
      subtype === 'cd'
    )
      return 'savings';
    return 'checking';
  }
  if (type === 'credit') return 'credit';
  if (type === 'investment' || type === 'brokerage') return 'investment';
  return 'checking';
}

export function plaidBalanceToCents(balance: number, accountType: string): number {
  if (accountType === 'credit' || accountType === 'loan') {
    return -Math.round(balance * 100);
  }
  return Math.round(balance * 100);
}
