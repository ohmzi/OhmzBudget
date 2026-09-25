import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, addDays, parseISO, differenceInDays } from 'date-fns';
import { useOccurrences } from '../../hooks/useRecurringTransactions';
import { formatCurrency } from '../../utils/currency';
import { Card } from '../ui/Card';

export default function UpcomingBills() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const thirtyDaysOut = format(addDays(new Date(), 30), 'yyyy-MM-dd');

  const { data: occurrences = [], isLoading } = useOccurrences(today, thirtyDaysOut);

  const upcoming = useMemo(
    () => occurrences
      .filter((o) => o.status === 'upcoming' || o.status === 'overdue')
      .slice(0, 5),
    [occurrences],
  );

  if (isLoading) {
    return (
      <Card>
        <div className="h-5 w-32 bg-surface-alt rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-surface-alt rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Upcoming Bills</h3>
        <Link to="/recurring" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-text-disabled py-4 text-center">No upcoming bills.</p>
      ) : (
        <div className="divide-y divide-border-light">
          {upcoming.map((occ, i) => {
            const daysUntil = differenceInDays(parseISO(occ.expectedDate), new Date());
            const isOverdue = occ.status === 'overdue';
            return (
              <div key={`${occ.recurringTransactionId}-${occ.expectedDate}-${i}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? 'bg-negative' : 'bg-brand-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isOverdue ? 'text-negative font-medium' : 'text-text'}`}>
                    {occ.title}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {format(parseISO(occ.expectedDate), 'MMM d')}
                    {isOverdue
                      ? ` · ${Math.abs(daysUntil)}d overdue`
                      : daysUntil === 0 ? ' · Today'
                      : daysUntil === 1 ? ' · Tomorrow'
                      : ` · in ${daysUntil}d`}
                  </p>
                </div>
                <span className={`text-sm font-medium tabular-nums whitespace-nowrap ${
                  occ.expectedAmount > 0 ? 'text-positive' : 'text-text'
                }`}>
                  {formatCurrency(occ.expectedAmount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
