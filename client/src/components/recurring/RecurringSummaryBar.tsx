import { formatCurrency } from '../../utils/currency';
import type { ScheduleSummary } from '../../types';

interface Props {
  summary: ScheduleSummary | undefined;
  isLoading: boolean;
}

export default function RecurringSummaryBar({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex gap-3 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-16 bg-surface-alt rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const income = summary?.income ?? 0;
  const expenses = summary?.expenses ?? 0;
  const net = income + expenses;

  const cards = [
    {
      label: 'Expected Income',
      value: formatCurrency(income),
      color: 'text-positive',
      accent: 'positive' as const,
    },
    {
      label: 'Expected Expenses',
      value: formatCurrency(expenses),
      color: 'text-text',
      accent: 'negative' as const,
    },
    {
      label: 'Net',
      value: formatCurrency(net),
      color: net >= 0 ? 'text-positive' : 'text-negative',
      accent: undefined,
    },
  ];

  return (
    <div className="flex gap-3 mb-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="flex-1 bg-surface-alt rounded-lg border border-border-light px-4 py-3"
        >
          <p className="text-xs text-text-tertiary">{c.label}</p>
          <p className={`text-lg font-semibold tabular-nums mt-0.5 ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}
