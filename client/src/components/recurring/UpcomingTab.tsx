import { useMemo } from 'react';
import { format, addDays } from 'date-fns';
import RecurringItemRow from './RecurringItemRow';
import {
  useScheduleOccurrences,
  useMarkOccurrencePaid,
  useSkipOccurrence,
  useUnmatchOccurrence,
} from '../../hooks/useSchedules';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import { usePreferencesStore } from '../../store/preferencesStore';
import type { Schedule } from '../../types';

interface Props {
  onEdit: (item: Schedule) => void;
  allRecurring: Schedule[];
  onMatchOccurrence?: (occurrenceId: string) => void;
}

export default function UpcomingTab({ onEdit, allRecurring, onMatchOccurrence }: Props) {
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
  const today = format(new Date(), 'yyyy-MM-dd');
  const sixtyDaysOut = format(addDays(new Date(), 60), 'yyyy-MM-dd');

  const { data: occurrences = [], isLoading } = useScheduleOccurrences(today, sixtyDaysOut);
  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategories();
  const markPaid = useMarkOccurrencePaid();
  const skipOcc = useSkipOccurrence();
  const unmatchOcc = useUnmatchOccurrence();

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups)
      for (const c of g.categories) map.set(c.id, `${showCategoryIcons && c.icon ? c.icon + ' ' : ''}${c.name}`);
    return map;
  }, [groups, showCategoryIcons]);

  const recMap = useMemo(() => new Map(allRecurring.map((r) => [r.id, r])), [allRecurring]);

  const unpaid = occurrences.filter(
    (o) =>
      o.displayStatus === 'upcoming' || o.displayStatus === 'due' || o.displayStatus === 'waiting',
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="text-xs text-text-tertiary mb-4">Showing unpaid items for the next 60 days</p>

      {isLoading ? (
        <div className="space-y-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-surface-alt rounded animate-pulse" />
          ))}
        </div>
      ) : unpaid.length === 0 ? (
        <div className="text-center py-16 text-sm text-text-tertiary">
          All caught up — no upcoming items.
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow-card border border-border-light overflow-hidden">
          {unpaid.map((occ) => (
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
  );
}
