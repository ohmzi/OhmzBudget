import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, parseISO,
  addMonths, subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ScheduleOccurrence, OccurrenceDisplayStatus } from '../../types';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DOT_COLORS: Record<OccurrenceDisplayStatus, string> = {
  upcoming: 'bg-brand-500',
  due: 'bg-brand-600',
  waiting: 'bg-caution',
  paid: 'bg-positive',
  skipped: 'bg-text-disabled',
  cancelled: 'bg-text-disabled',
};

interface Props {
  month: string;
  onMonthChange: (month: string) => void;
  occurrences: ScheduleOccurrence[];
  onDateClick?: (date: string) => void;
}

export default function Calendar({ month, onMonthChange, occurrences, onDateClick }: Props) {
  const monthDate = parseISO(`${month}-01`);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate));
    const end = endOfWeek(endOfMonth(monthDate));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const occByDate = useMemo(() => {
    const map = new Map<string, ScheduleOccurrence[]>();
    for (const occ of occurrences) {
      const key = occ.expectedDate;
      const list = map.get(key) || [];
      list.push(occ);
      map.set(key, list);
    }
    return map;
  }, [occurrences]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onMonthChange(format(subMonths(monthDate, 1), 'yyyy-MM'))}
          className="p-1.5 rounded-md hover:bg-hover text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-text">{format(monthDate, 'MMMM yyyy')}</span>
        <button
          onClick={() => onMonthChange(format(addMonths(monthDate, 1), 'yyyy-MM'))}
          className="p-1.5 rounded-md hover:bg-hover text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border-light rounded-lg overflow-hidden border border-border-light">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="bg-surface-alt py-1.5 text-center text-xs font-medium text-text-tertiary">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, monthDate);
          const isToday = isSameDay(day, new Date());
          const dayOccs = occByDate.get(dateStr) || [];

          return (
            <div
              key={dateStr}
              onClick={() => dayOccs.length > 0 && onDateClick?.(dateStr)}
              className={`bg-surface min-h-[52px] px-1.5 py-1 ${
                dayOccs.length > 0 ? 'cursor-pointer hover:bg-brand-50' : ''
              } ${!inMonth ? 'opacity-30' : ''}`}
            >
              <span
                className={`text-xs tabular-nums ${
                  isToday
                    ? 'bg-brand-600 text-white w-5 h-5 rounded-full inline-flex items-center justify-center font-medium'
                    : 'text-text-secondary'
                }`}
              >
                {format(day, 'd')}
              </span>
              {dayOccs.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap">
                  {dayOccs.slice(0, 4).map((occ, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[occ.displayStatus]}`}
                      title={`${occ.scheduleName} (${occ.displayStatus})`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
