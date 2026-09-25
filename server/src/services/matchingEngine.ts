import { db } from '../db/index.js';
import { schedules, scheduleOccurrences, scheduleMatchDismissals, transactions } from '../db/schema.js';
import { eq, and, gte, lte, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { format, parseISO, addDays, subDays } from 'date-fns';

export function linkOccurrenceToTransaction(
  occurrenceId: string,
  transactionId: string,
  matchType: 'automatic' | 'manual',
  confidence: number,
): void {
  const occ = db.select().from(scheduleOccurrences).where(eq(scheduleOccurrences.id, occurrenceId)).get();
  if (!occ) return;

  const now = format(new Date(), 'yyyy-MM-dd');

  db.update(scheduleOccurrences)
    .set({
      status: 'paid',
      matchedTransactionId: transactionId,
      matchType,
      matchConfidence: confidence,
      paidAt: now,
    })
    .where(eq(scheduleOccurrences.id, occurrenceId))
    .run();

  db.update(transactions)
    .set({ scheduleId: occ.scheduleId })
    .where(eq(transactions.id, transactionId))
    .run();
}

export function unlinkOccurrence(occurrenceId: string): void {
  const occ = db.select().from(scheduleOccurrences).where(eq(scheduleOccurrences.id, occurrenceId)).get();
  if (!occ) return;

  if (occ.matchedTransactionId) {
    db.update(transactions)
      .set({ scheduleId: null })
      .where(eq(transactions.id, occ.matchedTransactionId))
      .run();
  }

  db.update(scheduleOccurrences)
    .set({
      status: 'pending',
      matchedTransactionId: null,
      matchType: null,
      matchConfidence: null,
      paidAt: null,
    })
    .where(eq(scheduleOccurrences.id, occurrenceId))
    .run();
}

export function unlinkOccurrenceByTransactionId(transactionId: string): void {
  const occ = db.select()
    .from(scheduleOccurrences)
    .where(eq(scheduleOccurrences.matchedTransactionId, transactionId))
    .get();

  if (!occ) return;

  db.update(scheduleOccurrences)
    .set({
      status: 'pending',
      matchedTransactionId: null,
      matchType: null,
      matchConfidence: null,
      paidAt: null,
    })
    .where(eq(scheduleOccurrences.id, occ.id))
    .run();
}

interface MatchCandidate {
  occurrenceId: string;
  scheduleId: string;
  score: number;
  payeeScore: number;
  schedulePayeeId: string | null;
}

function scoreMatch(
  tx: { date: string; amount: number; payeeId: string | null; payeeName: string | null; accountId: string },
  occ: { expectedDate: string; expectedAmount: number },
  schedule: { amount: number; amountType: string; dateFlexibility: number; payeeId: string | null; accountId: string | null; name: string },
): { score: number; payeeScore: number } {
  const txDate = parseISO(tx.date);
  const occDate = parseISO(occ.expectedDate);
  const daysDiff = Math.abs(txDate.getTime() - occDate.getTime()) / (24 * 60 * 60 * 1000);

  if (daysDiff > schedule.dateFlexibility) return { score: 0, payeeScore: 0 };

  let dateScore = Math.max(0, 30 - daysDiff * 5);

  let amountScore = 0;
  const amountDiff = Math.abs(tx.amount - occ.expectedAmount);
  const absExpected = Math.abs(occ.expectedAmount);

  switch (schedule.amountType) {
    case 'exact':
      amountScore = amountDiff === 0 ? 30 : 0;
      break;
    case 'approximate':
      if (amountDiff === 0) amountScore = 30;
      else if (absExpected > 0 && amountDiff / absExpected <= 0.1) amountScore = 20;
      else amountScore = 0;
      break;
    case 'variable':
      if (amountDiff === 0) amountScore = 30;
      else if (absExpected > 0 && amountDiff / absExpected <= 0.25) amountScore = 10;
      else amountScore = 0;
      break;
    default:
      amountScore = amountDiff === 0 ? 30 : 0;
  }

  if (amountScore === 0) return { score: 0, payeeScore: 0 };

  let payeeScore = 0;
  if (schedule.payeeId && tx.payeeId === schedule.payeeId) {
    payeeScore = 25;
  } else if (schedule.payeeId && tx.payeeName && schedule.name) {
    const txNameLower = tx.payeeName.toLowerCase();
    const schedNameLower = schedule.name.toLowerCase();
    if (txNameLower.includes(schedNameLower) || schedNameLower.includes(txNameLower)) {
      payeeScore = 15;
    }
  }

  let accountScore = 0;
  if (schedule.accountId && tx.accountId === schedule.accountId) {
    accountScore = 15;
  } else if (!schedule.accountId) {
    accountScore = 5;
  }

  return { score: dateScore + amountScore + payeeScore + accountScore, payeeScore };
}

export function attemptAutoMatch(transactionId: string): boolean {
  const tx = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!tx) return false;

  if (tx.transferTransactionId) return false;
  if (tx.scheduleId) return false;

  const isExpense = tx.amount < 0;
  const activeSchedules = db.select()
    .from(schedules)
    .where(eq(schedules.status, 'active'))
    .all()
    .filter(s => {
      if (isExpense && s.amount > 0) return false;
      if (!isExpense && s.amount < 0) return false;
      if (s.accountId && s.accountId !== tx.accountId) return false;
      return true;
    });

  if (activeSchedules.length === 0) return false;

  const candidates: MatchCandidate[] = [];

  for (const schedule of activeSchedules) {
    const pendingOccs = db.select()
      .from(scheduleOccurrences)
      .where(
        and(
          eq(scheduleOccurrences.scheduleId, schedule.id),
          eq(scheduleOccurrences.status, 'pending'),
          gte(scheduleOccurrences.expectedDate, format(subDays(parseISO(tx.date), schedule.dateFlexibility), 'yyyy-MM-dd')),
          lte(scheduleOccurrences.expectedDate, format(addDays(parseISO(tx.date), schedule.dateFlexibility), 'yyyy-MM-dd')),
        ),
      )
      .all();

    for (const occ of pendingOccs) {
      const { score, payeeScore } = scoreMatch(tx, occ, schedule);
      if (score >= 40) {
        const dismissed = db.select()
          .from(scheduleMatchDismissals)
          .where(
            and(
              eq(scheduleMatchDismissals.occurrenceId, occ.id),
              eq(scheduleMatchDismissals.transactionId, transactionId),
            ),
          )
          .get();

        if (!dismissed) {
          candidates.push({
            occurrenceId: occ.id,
            scheduleId: schedule.id,
            score,
            payeeScore,
            schedulePayeeId: schedule.payeeId,
          });
        }
      }
    }
  }

  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const secondBest = candidates.length > 1 ? candidates[1] : null;

  const margin = secondBest ? best.score - secondBest.score : 100;
  const payeeOk = !best.schedulePayeeId || best.payeeScore > 0;

  if (best.score >= 75 && payeeOk && margin >= 15) {
    linkOccurrenceToTransaction(best.occurrenceId, transactionId, 'automatic', best.score);
    return true;
  }

  return false;
}

export interface MatchSuggestion {
  occurrenceId: string;
  scheduleId: string;
  scheduleName: string;
  scheduledDate: string;
  expectedDate: string;
  expectedAmount: number;
  candidates: {
    transactionId: string;
    date: string;
    amount: number;
    payeeName: string | null;
    score: number;
  }[];
}

export function getMatchSuggestions(): MatchSuggestion[] {
  const today = format(new Date(), 'yyyy-MM-dd');
  const windowStart = format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const windowEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  const pendingOccs = db.select({
    occ: scheduleOccurrences,
    schedule: schedules,
  })
    .from(scheduleOccurrences)
    .innerJoin(schedules, eq(scheduleOccurrences.scheduleId, schedules.id))
    .where(
      and(
        eq(scheduleOccurrences.status, 'pending'),
        eq(schedules.status, 'active'),
        gte(scheduleOccurrences.expectedDate, windowStart),
        lte(scheduleOccurrences.expectedDate, windowEnd),
      ),
    )
    .all();

  const suggestions: MatchSuggestion[] = [];

  for (const { occ, schedule } of pendingOccs) {
    const nearbyTxns = db.select()
      .from(transactions)
      .where(
        and(
          isNull(transactions.scheduleId),
          isNull(transactions.transferTransactionId),
          gte(transactions.date, format(subDays(parseISO(occ.expectedDate), schedule.dateFlexibility), 'yyyy-MM-dd')),
          lte(transactions.date, format(addDays(parseISO(occ.expectedDate), schedule.dateFlexibility), 'yyyy-MM-dd')),
        ),
      )
      .all();

    const candidateTxns: MatchSuggestion['candidates'] = [];

    for (const tx of nearbyTxns) {
      if (schedule.amount < 0 && tx.amount > 0) continue;
      if (schedule.amount > 0 && tx.amount < 0) continue;

      const dismissed = db.select()
        .from(scheduleMatchDismissals)
        .where(
          and(
            eq(scheduleMatchDismissals.occurrenceId, occ.id),
            eq(scheduleMatchDismissals.transactionId, tx.id),
          ),
        )
        .get();
      if (dismissed) continue;

      const { score } = scoreMatch(tx, occ, schedule);
      if (score >= 40) {
        candidateTxns.push({
          transactionId: tx.id,
          date: tx.date,
          amount: tx.amount,
          payeeName: tx.payeeName,
          score,
        });
      }
    }

    if (candidateTxns.length > 0) {
      candidateTxns.sort((a, b) => b.score - a.score);
      suggestions.push({
        occurrenceId: occ.id,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduledDate: occ.scheduledDate,
        expectedDate: occ.expectedDate,
        expectedAmount: occ.expectedAmount,
        candidates: candidateTxns,
      });
    }
  }

  return suggestions;
}

export function dismissMatchSuggestion(occurrenceId: string, transactionId: string): void {
  try {
    db.insert(scheduleMatchDismissals).values({
      id: nanoid(),
      occurrenceId,
      transactionId,
    }).run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) return;
    throw e;
  }
}

export function reconcileWithAutoCreated(
  accountId: string,
  amount: number,
  date: string,
  payeeName: string | null,
): string | null {
  const flexibility = 3;
  const dateFrom = format(subDays(parseISO(date), flexibility), 'yyyy-MM-dd');
  const dateTo = format(addDays(parseISO(date), flexibility), 'yyyy-MM-dd');

  const paidOccs = db.select({
    occ: scheduleOccurrences,
    schedule: schedules,
    tx: transactions,
  })
    .from(scheduleOccurrences)
    .innerJoin(schedules, eq(scheduleOccurrences.scheduleId, schedules.id))
    .innerJoin(transactions, eq(scheduleOccurrences.matchedTransactionId, transactions.id))
    .where(
      and(
        eq(scheduleOccurrences.status, 'paid'),
        gte(scheduleOccurrences.expectedDate, dateFrom),
        lte(scheduleOccurrences.expectedDate, dateTo),
        eq(transactions.accountId, accountId),
      ),
    )
    .all()
    .filter(r => r.tx.importedId?.startsWith('schedule:'));

  if (paidOccs.length === 0) return null;

  const matchingOccs = paidOccs.filter(r => {
    const { schedule, tx } = r;
    const amountDiff = Math.abs(amount - tx.amount);
    const absExpected = Math.abs(tx.amount);

    switch (schedule.amountType) {
      case 'exact':
        return amountDiff === 0;
      case 'approximate':
        return absExpected > 0 ? amountDiff / absExpected <= 0.1 : amountDiff === 0;
      case 'variable':
        return absExpected > 0 ? amountDiff / absExpected <= 0.25 : amountDiff === 0;
      default:
        return amountDiff === 0;
    }
  });

  if (matchingOccs.length !== 1) return null;

  const match = matchingOccs[0];
  const existingTxId = match.tx.id;

  const updates: Record<string, any> = {};
  updates.importedId = null;

  if (amount !== match.tx.amount) updates.amount = amount;
  if (payeeName && payeeName !== match.tx.payeeName) updates.payeeName = payeeName;

  const txDate = parseISO(match.tx.date);
  const bankDate = parseISO(date);
  if (Math.abs(txDate.getTime() - bankDate.getTime()) > 0) {
    updates.date = date;
  }

  db.update(transactions)
    .set(updates)
    .where(eq(transactions.id, existingTxId))
    .run();

  return existingTxId;
}
