import { Check, Pencil, SkipForward, Link2, Unlink } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatCurrency } from '../../utils/currency';
import {
  RECURRENCE_TYPE_LABELS,
  type ScheduleOccurrence,
  type OccurrenceDisplayStatus,
} from '../../types';

const STATUS_PILL: Record<OccurrenceDisplayStatus, string> = {
  upcoming: 'bg-brand-50 text-brand-600',
  due: 'bg-brand-100 text-brand-700',
  waiting: 'bg-caution-subtle text-caution',
  paid: 'bg-positive-subtle text-positive',
  skipped: 'bg-surface-alt text-text-disabled',
  cancelled: 'bg-surface-alt text-text-disabled',
};

const STATUS_PILL_LABEL: Record<OccurrenceDisplayStatus, string> = {
  upcoming: 'Soon',
  due: 'Due',
  waiting: 'Late',
  paid: 'Paid',
  skipped: 'Skip',
  cancelled: 'Cancelled',
};

const STATUS_LABEL: Record<OccurrenceDisplayStatus, string> = {
  upcoming: 'Upcoming',
  due: 'Due today',
  waiting: 'Waiting',
  paid: 'Paid',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

const FREQ_MAP = new Map(RECURRENCE_TYPE_LABELS.map((f) => [f.value, f.label]));

interface Props {
  occurrence: ScheduleOccurrence;
  accountName?: string;
  categoryName?: string;
  onMarkPaid?: () => void;
  onEdit?: () => void;
  onSkip?: () => void;
  onMatch?: () => void;
  onUnmatch?: () => void;
}

export default function RecurringItemRow({
  occurrence: occ,
  accountName,
  categoryName,
  onMarkPaid,
  onEdit,
  onSkip,
  onMatch,
  onUnmatch,
}: Props) {
  const daysUntil = differenceInDays(parseISO(occ.expectedDate), new Date());
  const isPaid = occ.displayStatus === 'paid';
  const isPending =
    occ.displayStatus === 'upcoming' ||
    occ.displayStatus === 'due' ||
    occ.displayStatus === 'waiting';
  const isSkippedOrCancelled = occ.displayStatus === 'skipped' || occ.displayStatus === 'cancelled';
  const hasDifferentAmount =
    isPaid && occ.matchedAmount !== null && occ.matchedAmount !== occ.expectedAmount;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-light hover:bg-hover transition-colors group ${
        occ.displayStatus === 'waiting' ? 'bg-caution-subtle/30' : ''
      }`}
    >
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${STATUS_PILL[occ.displayStatus]}`}
        title={STATUS_LABEL[occ.displayStatus]}
      >
        {STATUS_PILL_LABEL[occ.displayStatus]}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${isPaid || isSkippedOrCancelled ? 'text-text-disabled line-through' : 'text-text'}`}
          >
            {occ.scheduleName}
          </span>
          <span className="text-[10px] font-medium text-text-tertiary bg-surface-alt px-1.5 py-0.5 rounded">
            {FREQ_MAP.get(occ.recurrenceType) || occ.recurrenceType}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-text-tertiary">
            {format(parseISO(occ.expectedDate), 'MMM d, yyyy')}
          </span>
          {isPending && daysUntil >= 0 && (
            <span className="text-xs text-text-tertiary">
              · {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil} days`}
            </span>
          )}
          {occ.displayStatus === 'waiting' && (
            <span className="text-xs text-caution font-medium">
              · {Math.abs(daysUntil)} {Math.abs(daysUntil) === 1 ? 'day' : 'days'} overdue
            </span>
          )}
          {categoryName && <span className="text-xs text-text-tertiary">· {categoryName}</span>}
          {accountName && <span className="text-xs text-text-tertiary">· {accountName}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-medium tabular-nums whitespace-nowrap ${
            isPaid || isSkippedOrCancelled
              ? 'text-text-disabled'
              : occ.expectedAmount > 0
                ? 'text-positive'
                : 'text-text'
          }`}
        >
          {occ.amountType !== 'exact' ? '~' : ''}
          {formatCurrency(occ.expectedAmount)}
        </span>

        {hasDifferentAmount && (
          <span className="text-xs text-caution tabular-nums">
            ({formatCurrency(occ.matchedAmount!)})
          </span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isPending && onMarkPaid && (
            <button
              onClick={onMarkPaid}
              className="p-1 rounded text-positive hover:bg-positive-subtle transition-colors"
              title="Mark as paid"
            >
              <Check size={14} />
            </button>
          )}
          {isPending && onSkip && (
            <button
              onClick={onSkip}
              className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-hover transition-colors"
              title="Skip"
            >
              <SkipForward size={13} />
            </button>
          )}
          {isPending && onMatch && (
            <button
              onClick={onMatch}
              className="p-1 rounded text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-colors"
              title="Match to transaction"
            >
              <Link2 size={13} />
            </button>
          )}
          {isPaid && onUnmatch && (
            <button
              onClick={onUnmatch}
              className="p-1 rounded text-text-tertiary hover:text-caution hover:bg-caution-subtle transition-colors"
              title="Unlink transaction"
            >
              <Unlink size={13} />
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-hover transition-colors"
              title="Edit"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
