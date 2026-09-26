import { Router } from 'express';
import { db } from '../db/index.js';
import { plaidConfig, plaidItems, plaidAccountMappings, accounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  isPlaidConfigured,
  getPlaidEnvironment,
  invalidatePlaidClient,
  createLinkToken,
  createUpdateLinkToken,
  exchangePublicToken,
  getInstitutionName,
  mapPlaidAccountType,
  plaidBalanceToCents,
} from '../services/plaidService.js';
import { syncPlaidItem, syncAllItems } from '../services/plaidSyncService.js';

export const plaidRouter = Router();

const configureSchema = z.object({
  clientId: z.string().min(1),
  secret: z.string().min(1),
  environment: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
});

const exchangeSchema = z.object({
  publicToken: z.string(),
  institutionId: z.string(),
  institutionName: z.string(),
});

const mapAccountSchema = z.object({
  mappings: z.array(
    z.object({
      plaidAccountId: z.string(),
      action: z.enum(['create', 'link', 'skip']),
      accountId: z.string().optional(),
      accountName: z.string().optional(),
      accountType: z.enum(['checking', 'savings', 'credit', 'cash', 'investment']).optional(),
      isOffBudget: z.number().int().min(0).max(1).optional(),
    }),
  ),
});

function requirePlaid(res: any): boolean {
  if (!isPlaidConfigured()) {
    res.status(503).json({ error: 'Plaid is not configured' });
    return false;
  }
  return true;
}

plaidRouter.get('/status', (_req, res) => {
  res.json({
    configured: isPlaidConfigured(),
    environment: isPlaidConfigured() ? getPlaidEnvironment() : null,
  });
});

plaidRouter.post('/configure', (req, res) => {
  const parsed = configureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { clientId, secret, environment } = parsed.data;
  const existing = db.select().from(plaidConfig).get();
  const now = new Date().toISOString();

  if (existing) {
    db.update(plaidConfig)
      .set({ clientId, secret, environment, updatedAt: now })
      .where(eq(plaidConfig.id, existing.id))
      .run();
  } else {
    db.insert(plaidConfig)
      .values({
        id: nanoid(),
        clientId,
        secret,
        environment,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  invalidatePlaidClient();
  res.json({ ok: true });
});

plaidRouter.post('/link-token', async (req, res) => {
  if (!requirePlaid(res)) return;
  try {
    const linkToken = await createLinkToken();
    res.json({ linkToken });
  } catch (err: any) {
    console.error('Plaid link-token error:', err?.response?.data ?? err.message);
    res
      .status(500)
      .json({ error: err?.response?.data?.error_message ?? 'Failed to create link token' });
  }
});

plaidRouter.post('/exchange-token', async (req, res) => {
  if (!requirePlaid(res)) return;
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { publicToken, institutionId, institutionName } = parsed.data;
    const result = await exchangePublicToken(publicToken);

    const itemId = nanoid();
    db.insert(plaidItems)
      .values({
        id: itemId,
        plaidItemId: result.itemId,
        institutionId,
        institutionName,
        accessToken: result.accessToken,
        cursor: null,
        lastSyncedAt: null,
        syncStatus: 'good',
        syncError: null,
        consentExpiresAt: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    for (const acct of result.accounts) {
      db.insert(plaidAccountMappings)
        .values({
          id: nanoid(),
          plaidItemId: itemId,
          plaidAccountId: acct.plaidAccountId,
          accountId: null,
          plaidAccountName: acct.officialName || acct.name,
          plaidAccountType: acct.type,
          plaidAccountMask: acct.mask,
          isEnabled: 1,
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    res.json({
      itemId,
      institutionName,
      accounts: result.accounts.map((a) => ({
        plaidAccountId: a.plaidAccountId,
        name: a.officialName || a.name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        suggestedType: mapPlaidAccountType(a.type, a.subtype),
        currentBalance: Math.round(
          a.type === 'credit' ? -a.currentBalance * 100 : a.currentBalance * 100,
        ),
      })),
    });
  } catch (err: any) {
    console.error('Plaid exchange error:', err?.response?.data ?? err.message);
    res
      .status(500)
      .json({ error: err?.response?.data?.error_message ?? 'Failed to exchange token' });
  }
});

plaidRouter.post('/items/:itemId/map-accounts', (req, res) => {
  const parsed = mapAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { itemId } = req.params;
  const item = db.select().from(plaidItems).where(eq(plaidItems.id, itemId)).get();
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let mapped = 0;
  let created = 0;
  let skipped = 0;

  for (const m of parsed.data.mappings) {
    const mapping = db
      .select()
      .from(plaidAccountMappings)
      .where(eq(plaidAccountMappings.plaidAccountId, m.plaidAccountId))
      .get();
    if (!mapping) continue;

    if (m.action === 'skip') {
      db.update(plaidAccountMappings)
        .set({ isEnabled: 0, accountId: null })
        .where(eq(plaidAccountMappings.id, mapping.id))
        .run();
      skipped++;
    } else if (m.action === 'link' && m.accountId) {
      db.update(plaidAccountMappings)
        .set({ isEnabled: 1, accountId: m.accountId })
        .where(eq(plaidAccountMappings.id, mapping.id))
        .run();
      mapped++;
    } else if (m.action === 'create') {
      const accountId = nanoid();
      db.insert(accounts)
        .values({
          id: accountId,
          name: m.accountName || mapping.plaidAccountName,
          type: m.accountType || mapPlaidAccountType(mapping.plaidAccountType, null),
          startingBalance: 0,
          isOffBudget: m.isOffBudget ?? 0,
          sortOrder: 0,
          closedAt: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      db.update(plaidAccountMappings)
        .set({ isEnabled: 1, accountId })
        .where(eq(plaidAccountMappings.id, mapping.id))
        .run();
      created++;
    }
  }

  res.json({ mapped, created, skipped });
});

plaidRouter.post('/items/:itemId/sync', async (req, res) => {
  if (!requirePlaid(res)) return;
  const { itemId } = req.params;
  try {
    const result = await syncPlaidItem(itemId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

plaidRouter.post('/sync-all', async (_req, res) => {
  if (!requirePlaid(res)) return;
  try {
    const results = await syncAllItems();
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

plaidRouter.get('/items', (_req, res) => {
  const items = db.select().from(plaidItems).all();
  const mappings = db.select().from(plaidAccountMappings).all();
  const accts = db.select().from(accounts).all();
  const accountMap = new Map(accts.map((a) => [a.id, a]));

  const result = items.map((item) => ({
    id: item.id,
    institutionName: item.institutionName,
    institutionId: item.institutionId,
    lastSyncedAt: item.lastSyncedAt,
    syncStatus: item.syncStatus,
    syncError: item.syncError,
    consentExpiresAt: item.consentExpiresAt,
    accounts: mappings
      .filter((m) => m.plaidItemId === item.id)
      .map((m) => ({
        plaidAccountId: m.plaidAccountId,
        plaidAccountName: m.plaidAccountName,
        plaidAccountType: m.plaidAccountType,
        mask: m.plaidAccountMask,
        accountId: m.accountId,
        accountName: m.accountId ? (accountMap.get(m.accountId)?.name ?? null) : null,
        isEnabled: m.isEnabled,
      })),
  }));

  res.json(result);
});

plaidRouter.delete('/items/:itemId', (_req, res) => {
  const { itemId } = _req.params;
  const item = db.select().from(plaidItems).where(eq(plaidItems.id, itemId)).get();
  if (!item) return res.status(404).json({ error: 'Item not found' });

  db.delete(plaidItems).where(eq(plaidItems.id, itemId)).run();
  res.status(204).send();
});

plaidRouter.post('/items/:itemId/update-link', async (req, res) => {
  if (!requirePlaid(res)) return;
  const { itemId } = req.params;
  const item = db.select().from(plaidItems).where(eq(plaidItems.id, itemId)).get();
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    const linkToken = await createUpdateLinkToken(item.accessToken);
    res.json({ linkToken });
  } catch (err: any) {
    console.error('Plaid update-link error:', err?.response?.data ?? err.message);
    res
      .status(500)
      .json({ error: err?.response?.data?.error_message ?? 'Failed to create update link token' });
  }
});
