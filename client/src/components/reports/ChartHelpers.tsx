import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../utils/currency';
import { CATEGORY_COLORS } from '../../utils/chartColors';

export const EXPENSE_COLORS = CATEGORY_COLORS;

export const monthLabel = (month: string) => format(parseISO(`${month}-01`), 'MMM yy');

export function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-md shadow-hover px-3 py-2">
      <p className="text-xs text-text-tertiary mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs font-medium" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="h-full flex items-end gap-2 px-4 pb-4 pt-8 animate-pulse">
      {[55, 72, 40, 85, 60, 78, 45, 90, 50, 65].map((h, i) => (
        <div key={i} className="flex-1 bg-surface-alt rounded-t" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ message = 'No data for this period.' }: { message?: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-sm text-text-tertiary">{message}</div>
    </div>
  );
}

export interface StatCard {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

const TONE_CLASS = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-text-tertiary',
} as const;

export function StatCardRow({ cards, stretch }: { cards: StatCard[]; stretch?: boolean }) {
  if (!cards.length) return null;
  return (
    <div className="flex gap-3 mb-5 flex-wrap">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-lg bg-surface-alt border border-border-light px-4 py-3 min-w-[110px] ${
            stretch ? 'flex-1 basis-0 min-w-[160px]' : ''
          }`}
        >
          <p className="text-xs text-text-tertiary">{c.label}</p>
          {c.sub && <p className="text-[11px] text-text-tertiary/80">{c.sub}</p>}
          <p className={`text-lg font-semibold mt-0.5 tabular-nums ${c.tone ? TONE_CLASS[c.tone] : 'text-text'}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
