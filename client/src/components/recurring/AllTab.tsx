import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Pause, Play, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import { useUpdateSchedule, useDeleteSchedule } from '../../hooks/useSchedules';
import { ConfirmModal } from '../ui/ConfirmModal';
import { RECURRENCE_TYPE_LABELS, type Schedule } from '../../types';

const FREQ_MAP = new Map(RECURRENCE_TYPE_LABELS.map((f) => [f.value, f.label]));

interface Props {
  allRecurring: Schedule[];
  onEdit: (item: Schedule) => void;
}

export default function AllTab({ allRecurring, onEdit }: Props) {
  const [canceledOpen, setCanceledOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategories();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups)
      for (const c of g.categories) map.set(c.id, `${c.icon ? c.icon + ' ' : ''}${c.name}`);
    return map;
  }, [groups]);

  const active = allRecurring.filter((r) => r.status === 'active' || r.status === 'paused');
  const canceled = allRecurring.filter((r) => r.status === 'canceled');

  function Row({ item }: { item: Schedule }) {
    const isPaused = item.status === 'paused';
    return (
      <div
        className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-light hover:bg-hover transition-colors group ${
          isPaused ? 'opacity-60' : ''
        }`}
      >
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
            isPaused
              ? 'bg-surface-alt text-text-disabled'
              : item.amount > 0
                ? 'bg-positive-subtle text-positive'
                : 'bg-brand-50 text-brand-600'
          }`}
        >
          {item.amount > 0 ? 'Income' : 'Expense'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text truncate">{item.name}</span>
            <span className="text-[10px] font-medium text-text-tertiary bg-surface-alt px-1.5 py-0.5 rounded">
              {FREQ_MAP.get(item.recurrenceType) || item.recurrenceType}
            </span>
            {isPaused && (
              <span className="text-[10px] font-medium text-caution bg-caution-subtle px-1.5 py-0.5 rounded">
                Paused
              </span>
            )}
            {Boolean(item.autoCreate) && (
              <span className="text-[10px] font-medium text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                Auto
              </span>
            )}
            {item.amountType !== 'exact' && (
              <span className="text-[10px] font-medium text-text-tertiary bg-surface-alt px-1.5 py-0.5 rounded">
                {item.amountType === 'approximate' ? '~Approx' : 'Variable'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.categoryId && categoryMap.has(item.categoryId) && (
              <span className="text-xs text-text-tertiary">{categoryMap.get(item.categoryId)}</span>
            )}
            {item.accountId && accountMap.has(item.accountId) && (
              <span className="text-xs text-text-tertiary">· {accountMap.get(item.accountId)}</span>
            )}
            <span className="text-xs text-text-tertiary">· Since {item.startDate}</span>
          </div>
        </div>

        <span
          className={`text-sm font-medium tabular-nums whitespace-nowrap ${
            item.amount > 0 ? 'text-positive' : 'text-text'
          }`}
        >
          {item.amountType !== 'exact' && '~'}
          {formatCurrency(item.amount)}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() =>
              updateSchedule.mutate({
                id: item.id,
                status: isPaused ? 'active' : 'paused',
              })
            }
            className="p-1 rounded text-text-tertiary hover:bg-hover hover:text-text-secondary transition-colors"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            onClick={() => onEdit(item)}
            className="p-1 rounded text-text-tertiary hover:bg-hover hover:text-text-secondary transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => setDeleteId(item.id)}
            className="p-1 rounded text-text-tertiary hover:bg-negative-subtle hover:text-negative transition-colors"
            title="Cancel"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        {active.length === 0 ? (
          <div className="text-center py-12 text-sm text-text-tertiary">
            No active recurring items yet. Add one to get started.
          </div>
        ) : (
          <div className="bg-surface rounded-lg shadow-card border border-border-light overflow-hidden">
            {active.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {canceled.length > 0 && (
        <div>
          <button
            onClick={() => setCanceledOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-secondary mb-2"
          >
            {canceledOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Canceled ({canceled.length})
          </button>
          {canceledOpen && (
            <div className="opacity-50 bg-surface rounded-lg shadow-card border border-border-light overflow-hidden">
              {canceled.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteSchedule.mutate({ id: deleteId });
          setDeleteId(null);
        }}
        title="Cancel Recurring Item?"
        message="This will mark the item as canceled. It can be found under the Canceled section."
        confirmLabel="Cancel Item"
        danger
      />
    </div>
  );
}
