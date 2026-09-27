import { formatCurrency } from '../../utils/currency';
import { RECURRENCE_TYPE_LABELS, type AmountType } from '../../types';

export const FREQ_LABEL = new Map(RECURRENCE_TYPE_LABELS.map((f) => [f.value, f.label]));

/** Actual-style amount: `~` prefix when not exact, `+` prefix for income. */
export function formatScheduleAmount(amount: number, amountType: AmountType): string {
  const approx = amountType !== 'exact' ? '~' : '';
  const sign = amount > 0 ? '+' : '';
  return `${approx}${sign}${formatCurrency(Math.abs(amount))}`;
}
