import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Calendar from './Calendar';
import RecurringItemRow from './RecurringItemRow';
import RecurringSummaryBar from './RecurringSummaryBar';
import {
  useScheduleOccurrences,
  useScheduleSummary,
  useMarkOccurrencePaid,
  useSkipOccurrence,
  useUnmatchOccurrence,
} from '../../hooks/useSchedules';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import type { Schedule } from '../../types';

interface Props {
  onEdit: (item: Schedule) => void;
  allRecurring: Schedule[];
  onMatchOccurrence?: (occurrenceId: string) => void;
}

export default function MonthlyTab({ onEdit, allRecurring, onMatchOccurrence }: Props) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const from = format(startOfMonth(new Date(`${month}-01`)), 'yyyy-MM-dd');
  const to = format(endOfMonth(new Date(`${month}-01`)), 'yyyy-MM-dd');

  const { data: occurrences = [], isLoading } = useScheduleOccurrences(from, to);
  const { data: summary, isLoading: summaryLoading } = useScheduleSummary(month);
  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategories();
  const markPaid = useMarkOccurrencePaid();
  const skipOcc = useSkipOccurrence();
  const unmatchOcc = useUnmatchOccurrence();

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups)
      for (const c of g.categories) map.set(c.id, `${c.icon ? c.icon + ' ' : ''}${c.name}`);
    return map;
  }, [groups]);

  const recMap = useMemo(() => new Map(allRecurring.map((r) => [r.id, r])), [allRecurring]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <RecurringSummaryBar summary={summary} isLoading={summaryLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="bg-surface rounded-lg shadow-card border border-border-light p-4">
          <Calendar month={month} onMonthChange={setMonth} occurrences={occurrences} />
        </div>

        <div>
          {isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-surface-alt rounded animate-pulse" />
              ))}
            </div>
          ) : occurrences.length === 0 ? (
            <div className="text-center py-12 text-sm text-text-tertiary">
              No recurring items for this month.
            </div>
          ) : (
            <div className="bg-surface rounded-lg shadow-card border border-border-light overflow-hidden">
              {occurrences.map((occ) => (
                <RecurringItemRow
                  key={`${occ.scheduleId}-${occ.id}`}
                  occurrence={occ}
                  accountName={
                    occ.scheduleAccountId ? accountMap.get(occ.scheduleAccountId) : undefined
                  }
                  categoryName={
                    occ.scheduleCategoryId ? categoryMap.get(occ.scheduleCategoryId) : undefined
                  }
                  onMarkPaid={() =>
                    markPaid.mutate({
                      scheduleId: occ.scheduleId,
                      date: occ.expectedDate,
                      occurrenceId: occ.id,
                    })
                  }
                  onSkip={() => skipOcc.mutate(occ.id)}
                  onMatch={onMatchOccurrence ? () => onMatchOccurrence(occ.id) : undefined}
                  onUnmatch={() => unmatchOcc.mutate(occ.id)}
                  onEdit={() => {
                    const rec = recMap.get(occ.scheduleId);
                    if (rec) onEdit(rec);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
