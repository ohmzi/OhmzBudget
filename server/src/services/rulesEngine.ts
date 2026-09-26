import { db } from '../db/index.js';
import { transactions, categories } from '../db/schema.js';
import { eq, isNull } from 'drizzle-orm';

export type Condition = {
  field: 'payee_name' | 'amount' | 'notes';
  op: 'contains' | 'starts_with' | 'ends_with' | 'exact' | 'regex';
  value: string;
};

export type Action = {
  field: 'category_id' | 'payee_id' | 'notes';
  value: string;
};

export type EngineRule = {
  id: string;
  conditions: Condition[];
  actions: Action[];
  sortOrder: number;
};

type TxInput = {
  payeeName: string | null;
  amount: number;
  notes: string | null;
  categoryId: string | null;
};

function evalCondition(c: Condition, tx: TxInput): boolean {
  const raw =
    c.field === 'payee_name' ? tx.payeeName : c.field === 'amount' ? String(tx.amount) : tx.notes;
  const subject = (raw ?? '').toLowerCase();
  const val = c.value.toLowerCase();
  switch (c.op) {
    case 'contains':
      return subject.includes(val);
    case 'starts_with':
      return subject.startsWith(val);
    case 'ends_with':
      return subject.endsWith(val);
    case 'exact':
      return subject === val;
    case 'regex':
      try {
        return new RegExp(c.value, 'i').test(raw ?? '');
      } catch {
        return false;
      }
  }
}

function firstMatch(tx: TxInput, rules: EngineRule[]): Action[] | null {
  for (const rule of rules) {
    if (rule.conditions.every((c) => evalCondition(c, tx))) return rule.actions;
  }
  return null;
}

// Used when creating a new transaction — returns actions from first matching rule.
export function applyRulesToNew(tx: TxInput, rules: EngineRule[]): Action[] | null {
  return firstMatch(tx, rules);
}

// Preview what Run Rules would change (uncategorized transactions only).
export function previewRules(rules: EngineRule[]) {
  const uncategorized = db.select().from(transactions).where(isNull(transactions.categoryId)).all();
  const cats = db.select().from(categories).all();
  const catMap = new Map(cats.map((c) => [c.id, c.name]));

  return uncategorized.flatMap((tx) => {
    const actions = firstMatch(tx, rules);
    if (!actions) return [];
    const catAction = actions.find((a) => a.field === 'category_id');
    return [
      {
        transactionId: tx.id,
        date: tx.date,
        payeeName: tx.payeeName,
        amount: tx.amount,
        newCategoryName: catAction ? (catMap.get(catAction.value) ?? null) : null,
        actions,
      },
    ];
  });
}

// Apply rules to all uncategorized transactions. Returns count updated.
export function runRules(rules: EngineRule[]): number {
  const uncategorized = db.select().from(transactions).where(isNull(transactions.categoryId)).all();
  let count = 0;
  for (const tx of uncategorized) {
    const actions = firstMatch(tx, rules);
    if (!actions) continue;
    const update: Record<string, string> = {};
    for (const a of actions) {
      if (a.field === 'category_id') update.categoryId = a.value;
      else if (a.field === 'payee_id') update.payeeId = a.value;
      else if (a.field === 'notes') update.notes = a.value;
    }
    if (Object.keys(update).length) {
      db.update(transactions).set(update).where(eq(transactions.id, tx.id)).run();
      count++;
    }
  }
  return count;
}

// Test a set of conditions against all transactions. Returns up to 20 matches.
export function testConditions(conditions: Condition[]) {
  const all = db.select().from(transactions).all();
  const fakeRule: EngineRule = { id: '', conditions, actions: [], sortOrder: 0 };
  return all
    .filter((tx) => firstMatch(tx, [fakeRule]) !== null)
    .slice(0, 20)
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      payeeName: tx.payeeName,
      amount: tx.amount,
      categoryId: tx.categoryId,
    }));
}
