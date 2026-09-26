import { db } from '../db/index.js';
import { payees, rules } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { applyRulesToNew } from './rulesEngine.js';

export function resolvePayee(
  payeeName: string | null | undefined,
  payeeId: string | null | undefined,
) {
  let id = payeeId ?? null;
  let name = payeeName ?? null;
  if (!id && payeeName) {
    const existing = db.select().from(payees).where(eq(payees.name, payeeName)).get();
    if (existing) {
      id = existing.id;
    } else {
      id = nanoid();
      db.insert(payees)
        .values({
          id,
          name: payeeName,
          defaultCategoryId: null,
          createdAt: new Date().toISOString(),
        })
        .run();
    }
    name = payeeName;
  }
  return { payeeId: id, payeeName: name };
}

// checks payee defaults then rules — first matching rule wins
export function inferCategory(
  payeeId: string | null,
  payeeName: string | null,
  amount: number,
  notes: string | null,
) {
  let categoryId: string | null = null;
  let matchedPayeeId = payeeId;
  if (payeeId) {
    const payee = db.select().from(payees).where(eq(payees.id, payeeId)).get();
    if (payee?.defaultCategoryId) categoryId = payee.defaultCategoryId;
  }
  if (!categoryId) {
    const allRules = db
      .select()
      .from(rules)
      .orderBy(rules.sortOrder)
      .all()
      .map((r) => ({ ...r, conditions: JSON.parse(r.conditions), actions: JSON.parse(r.actions) }));
    const actions = applyRulesToNew({ payeeName, amount, notes, categoryId: null }, allRules);
    if (actions) {
      for (const a of actions) {
        if (a.field === 'category_id') categoryId = a.value;
        else if (a.field === 'payee_id') matchedPayeeId = a.value;
      }
    }
  }
  return { categoryId, payeeId: matchedPayeeId };
}
