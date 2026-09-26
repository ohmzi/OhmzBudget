import { useState, useEffect, type RefObject } from 'react';
import {
  parseISO,
  format,
  differenceInDays,
  differenceInMonths,
  addDays,
  addMonths,
  addYears,
  startOfMonth,
  startOfYear,
} from 'date-fns';

// --- Public types ---

interface TickConfig {
  dates: Date[];
  rawStrings: string[];
  chartWidth: number;
  labelSpacingPx?: number;
  minTicks?: number;
  maxTicks?: number;
}

interface TickResult {
  ticks: string[];
  formatTick: (value: string) => string;
}

// --- Interval definitions ---

type IntervalKind = 'day' | 'month' | 'year';
interface Interval {
  kind: IntervalKind;
  count: number;
}

const INTERVALS: Interval[] = [
  { kind: 'day', count: 1 },
  { kind: 'day', count: 2 },
  { kind: 'day', count: 3 },
  { kind: 'day', count: 4 },
  { kind: 'day', count: 5 },
  { kind: 'day', count: 7 },
  { kind: 'day', count: 14 },
  { kind: 'month', count: 1 },
  { kind: 'month', count: 2 },
  { kind: 'month', count: 3 },
  { kind: 'month', count: 6 },
  { kind: 'year', count: 1 },
  { kind: 'year', count: 2 },
  { kind: 'year', count: 5 },
  { kind: 'year', count: 10 },
];

function stepDate(d: Date, iv: Interval): Date {
  if (iv.kind === 'day') return addDays(d, iv.count);
  if (iv.kind === 'month') return addMonths(d, iv.count);
  return addYears(d, iv.count);
}

function countTicks(first: Date, last: Date, iv: Interval): number {
  let count = 0;
  let d = first;
  while (d <= last) {
    count++;
    d = stepDate(d, iv);
  }
  return count;
}

function snapStart(first: Date, iv: Interval): Date {
  if (iv.kind === 'month') return startOfMonth(first);
  if (iv.kind === 'year') return startOfYear(first);
  return first;
}

function intervalDays(iv: Interval): number {
  if (iv.kind === 'day') return iv.count;
  if (iv.kind === 'month') return iv.count * 30;
  return iv.count * 365;
}

// --- Core function ---

export function computeChartTicks(config: TickConfig): TickResult {
  const {
    dates,
    rawStrings,
    chartWidth,
    labelSpacingPx = 150,
    minTicks = 3,
    maxTicks = 12,
  } = config;

  if (dates.length === 0) return { ticks: [], formatTick: () => '' };
  if (dates.length === 1) {
    return { ticks: [rawStrings[0]], formatTick: (v) => formatShort(parseDate(v), 1) };
  }

  const first = dates[0];
  const last = dates[dates.length - 1];
  const spanDays = Math.max(differenceInDays(last, first), 1);

  const desired = Math.max(minTicks, Math.min(maxTicks, Math.floor(chartWidth / labelSpacingPx)));

  let chosen: Interval = INTERVALS[INTERVALS.length - 1];
  for (const iv of INTERVALS) {
    const snapped = snapStart(first, iv);
    const n = countTicks(snapped <= first ? snapped : first, last, iv);
    if (n <= desired) {
      chosen = iv;
      break;
    }
  }

  const tickDates: Date[] = [];
  const start = snapStart(first, chosen);
  let cursor = start;
  while (cursor <= last) {
    if (cursor >= first) tickDates.push(cursor);
    cursor = stepDate(cursor, chosen);
  }

  const minGapDays = intervalDays(chosen) * 0.6;

  if (tickDates.length === 0) {
    tickDates.push(first);
  } else if (differenceInDays(tickDates[0], first) > minGapDays) {
    tickDates.unshift(first);
  }
  const lastTick = tickDates[tickDates.length - 1];
  if (differenceInDays(last, lastTick) > minGapDays) {
    tickDates.push(last);
  }

  const ticks = tickDates.map((td) => findClosest(td, dates, rawStrings));
  const unique = [...new Set(ticks)];

  const crossesYear = first.getFullYear() !== last.getFullYear();
  const formatter = (value: string) => {
    const d = parseDate(value);
    return formatTickLabel(d, spanDays, crossesYear, chosen);
  };

  const deduped = unique.filter((t, i) => i === 0 || formatter(t) !== formatter(unique[i - 1]));

  return { ticks: deduped, formatTick: formatter };
}

// --- Tick formatting ---

function formatTickLabel(d: Date, spanDays: number, crossesYear: boolean, iv: Interval): string {
  if (iv.kind === 'year' || spanDays > 365 * 3) {
    if (iv.kind === 'year' && iv.count >= 1) return format(d, 'yyyy');
    return format(d, "MMM ''yy");
  }

  if (iv.kind === 'day') {
    return crossesYear ? format(d, "MMM d ''yy") : format(d, 'MMM d');
  }

  if (crossesYear) {
    return format(d, "MMM ''yy");
  }

  return format(d, 'MMM');
}

function formatShort(d: Date, spanDays: number): string {
  if (spanDays <= 90) return format(d, 'MMM d');
  return format(d, "MMM ''yy");
}

// --- Tooltip label formatter ---

export function formatDateLabel(dateStr: unknown): string {
  const s = String(dateStr ?? '');
  if (s.length === 10) return format(parseISO(s), 'MMM d, yyyy');
  if (s.length === 7) return format(parseISO(`${s}-01`), 'MMMM yyyy');
  return s;
}

// --- Date string helpers ---

export function parseDate(s: string): Date {
  if (s.length === 10) return parseISO(s);
  return parseISO(`${s}-01`);
}

export function parseDates(rawDates: string[]): Date[] {
  return rawDates.map(parseDate);
}

function findClosest(target: Date, dates: Date[], strs: string[]): string {
  let best = 0;
  let bestDist = Math.abs(differenceInDays(target, dates[0]));
  for (let i = 1; i < dates.length; i++) {
    const dist = Math.abs(differenceInDays(target, dates[i]));
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return strs[best];
}

// --- useChartWidth hook ---

export function useChartWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
