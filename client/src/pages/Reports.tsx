import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format, subMonths, parseISO, startOfYear, endOfYear, subYears } from 'date-fns';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  useNetWorth,
  useIncomeVsExpenses,
  useSpendingByCategory,
  useSpendingTrends,
} from '../hooks/useReports';
import { useCategories } from '../hooks/useCategories';
import { usePreferencesStore } from '../store/preferencesStore';
import { formatCurrency, formatCentsAxis } from '../utils/currency';
import { downloadCsv } from '../utils/exportCsv';
import { chartColors, CATEGORY_COLORS } from '../utils/chartColors';
import { computeChartTicks, parseDates, formatDateLabel, useChartWidth } from '../utils/chartTicks';
import { Button } from '../components/ui/Button';
import { MonthRangePicker } from '../components/ui/MonthRangePicker';
import { Download, Plus } from 'lucide-react';
import {
  CurrencyTooltip,
  ChartSkeleton,
  EmptyState,
  StatCardRow,
  EXPENSE_COLORS,
  monthLabel,
} from '../components/reports/ChartHelpers';
import type { StatCard } from '../components/reports/ChartHelpers';

type Tab = 'all' | 'net-worth' | 'income' | 'spending' | 'trends';
type Preset = '1m' | '3m' | '6m' | 'ytd' | 'last-year' | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'net-worth', label: 'Net Worth' },
  { id: 'income', label: 'Income & Expenses' },
  { id: 'spending', label: 'Spending by Category' },
  { id: 'trends', label: 'Spending Trends' },
];

const PRESETS: { id: Preset; label: string }[] = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'This Year' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'custom', label: 'Custom' },
];

const CHART_HEIGHT: Record<Tab, string> = {
  all: 'h-auto',
  'net-worth': 'h-72',
  income: 'h-72',
  spending: 'h-96',
  trends: 'h-80',
};

function NetWorthChart({ from, to }: { from: string; to: string }) {
  const { data = [], isLoading } = useNetWorth(from, to);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartWidth = useChartWidth(chartRef);

  const rawMonths = useMemo(() => data.map((d) => d.month), [data]);
  const dates = useMemo(() => parseDates(rawMonths), [rawMonths]);
  const tickResult = useMemo(
    () =>
      computeChartTicks({
        dates,
        rawStrings: rawMonths,
        chartWidth,
        labelSpacingPx: 140,
        minTicks: 4,
        maxTicks: 12,
      }),
    [dates, rawMonths, chartWidth],
  );

  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 'auto'] as [number, string];
    const allValues = data.flatMap((d) => [d.assets, d.liabilities, d.netWorth]);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || Math.abs(max) || 10000;
    const pad = range * 0.05;
    return [Math.floor((min - pad) / 100) * 100, Math.ceil((max + pad) / 100) * 100] as [
      number,
      number,
    ];
  }, [data]);

  if (isLoading) return <ChartSkeleton />;
  const hasData =
    data.length > 0 && data.some((d) => d.assets !== 0 || d.liabilities !== 0 || d.netWorth !== 0);
  if (!hasData) return <EmptyState />;

  return (
    <div ref={chartRef} className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 24, left: 16, bottom: 4 }}>
          <defs>
            <linearGradient id="gAssets" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.positive} stopOpacity={0.15} />
              <stop offset="95%" stopColor={chartColors.positive} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gLiab" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.negative} stopOpacity={0.15} />
              <stop offset="95%" stopColor={chartColors.negative} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.brand} stopOpacity={0.2} />
              <stop offset="95%" stopColor={chartColors.brand} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="month"
            ticks={tickResult.ticks}
            tickFormatter={tickResult.formatTick}
            tick={{ fontSize: 11, fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            tickFormatter={formatCentsAxis}
            tick={{ fontSize: 11, fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            width={60}
            domain={yDomain}
          />
          <Tooltip content={<CurrencyTooltip />} labelFormatter={formatDateLabel} />
          <Area
            type="monotone"
            dataKey="assets"
            name="Assets"
            stroke={chartColors.positiveLight}
            strokeWidth={2}
            fill="url(#gAssets)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="liabilities"
            name="Liabilities"
            stroke={chartColors.negativeLight}
            strokeWidth={2}
            fill="url(#gLiab)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            name="Net Worth"
            stroke={chartColors.brand}
            strokeWidth={2}
            fill="url(#gNet)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function IncomeExpensesChart({ from, to }: { from: string; to: string }) {
  const { data = [], isLoading } = useIncomeVsExpenses(from, to);
  const chartData = useMemo(() => data.map((d) => ({ ...d, month: monthLabel(d.month) })), [data]);

  if (isLoading) return <ChartSkeleton />;
  const hasData = chartData.length > 0 && data.some((d) => d.income !== 0 || d.expenses !== 0);
  if (!hasData) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: chartColors.axis }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCentsAxis}
          tick={{ fontSize: 11, fill: chartColors.axis }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CurrencyTooltip />} />
        <Bar
          dataKey="income"
          name="Income"
          fill={chartColors.positive}
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
        />
        <Bar
          dataKey="expenses"
          name="Expenses"
          fill={chartColors.negativeLight}
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpendingChart({ from, to }: { from: string; to: string }) {
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
  const { data = [], isLoading } = useSpendingByCategory(from, to);
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10)
        .map((d) => {
          const full = `${showCategoryIcons && d.categoryIcon ? d.categoryIcon + ' ' : ''}${d.categoryName ?? 'Uncategorized'}`;
          return { name: full.length > 22 ? full.slice(0, 21) + '…' : full, value: d.totalSpent };
        }),
    [data, showCategoryIcons],
  );

  if (isLoading) return <ChartSkeleton />;
  if (!chartData.length) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={formatCentsAxis}
          tick={{ fontSize: 11, fill: chartColors.axis }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: chartColors.axis }}
          axisLine={false}
          tickLine={false}
          width={160}
          interval={0}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="bg-surface border border-border rounded-md shadow-hover px-3 py-2">
                <p className="text-xs text-text-tertiary mb-0.5">{label}</p>
                <p className="text-xs font-medium text-brand-600">
                  {formatCurrency(payload[0].value as number)}
                </p>
              </div>
            ) : null
          }
        />
        <Bar dataKey="value" name="Spent" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpendingTrendsChart({
  from,
  to,
  compact,
  topCategoryIds,
}: {
  from: string;
  to: string;
  compact?: boolean;
  topCategoryIds?: string[];
}) {
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const activeIds = compact && topCategoryIds?.length ? topCategoryIds : selectedIds;
  const { data: groups = [] } = useCategories();
  const { data: trendData = [], isLoading } = useSpendingTrends(activeIds, from, to);

  const expenseCategories = useMemo(
    () => (groups as any[]).filter((g: any) => g.isIncome === 0).flatMap((g: any) => g.categories),
    [groups],
  );

  const chartData = useMemo(() => {
    if (!trendData.length) return [];
    const monthSet = new Set(trendData.map((r) => r.month));
    const months = [...monthSet].sort();
    return months.map((month) => {
      const row: Record<string, string | number> = { month: monthLabel(month) };
      for (const point of trendData) {
        if (point.month === month) {
          const key = point.categoryName
            ? `${showCategoryIcons && point.categoryIcon ? point.categoryIcon + ' ' : ''}${point.categoryName}`
            : point.categoryId;
          row[key] = point.total;
        }
      }
      return row;
    });
  }, [trendData, showCategoryIcons]);

  const selectedNames = useMemo(() => {
    return activeIds.map((id) => {
      const cat = expenseCategories.find((c: any) => c.id === id);
      return cat ? `${showCategoryIcons && cat.icon ? cat.icon + ' ' : ''}${cat.name}` : id;
    });
  }, [activeIds, expenseCategories, showCategoryIcons]);

  function toggleCategory(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev,
    );
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {expenseCategories.map((cat: any) => {
            const checked = selectedIds.includes(cat.id);
            const disabled = !checked && selectedIds.length >= 5;
            return (
              <button
                key={cat.id}
                onClick={() => !disabled && toggleCategory(cat.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  checked
                    ? 'bg-brand-50 border-brand-500 text-brand-700'
                    : disabled
                      ? 'bg-surface-alt border-border-light text-text-disabled cursor-not-allowed'
                      : 'bg-surface border-border text-text-secondary hover:border-text-tertiary'
                }`}
              >
                {showCategoryIcons && cat.icon ? `${cat.icon} ` : ''}
                {cat.name}
              </button>
            );
          })}
          {expenseCategories.length === 0 && (
            <span className="text-xs text-text-tertiary">No expense categories found.</span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {activeIds.length === 0 ? (
          <EmptyState message="Select categories above to compare trends." />
        ) : isLoading ? (
          <ChartSkeleton />
        ) : !chartData.length ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCentsAxis}
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {selectedNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={EXPENSE_COLORS[i % EXPENSE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const OVERVIEW_CHARTS: { id: Exclude<Tab, 'all'>; label: string }[] = [
  { id: 'net-worth', label: 'Net Worth' },
  { id: 'income', label: 'Income & Expenses' },
  { id: 'spending', label: 'Spending by Category' },
  { id: 'trends', label: 'Spending Trends' },
];

function OverviewGrid({
  from,
  to,
  onSelectTab,
}: {
  from: string;
  to: string;
  onSelectTab: (tab: Tab) => void;
}) {
  const { data: spData = [] } = useSpendingByCategory(from, to);
  const topCategoryIds = useMemo(
    () =>
      [...spData]
        .filter((d) => d.categoryId)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 3)
        .map((d) => d.categoryId!),
    [spData],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {OVERVIEW_CHARTS.map((chart) => (
        <button
          key={chart.id}
          onClick={() => onSelectTab(chart.id)}
          className="bg-surface-alt rounded-lg border border-border-light p-3 hover:shadow-hover hover:border-brand-200 transition-all text-left cursor-pointer group"
        >
          <p className="text-sm font-semibold text-text mb-2 group-hover:text-brand-600 transition-colors">
            {chart.label}
          </p>
          <div className="h-64 pointer-events-none">
            {chart.id === 'net-worth' && <NetWorthChart from={from} to={to} />}
            {chart.id === 'income' && <IncomeExpensesChart from={from} to={to} />}
            {chart.id === 'spending' && <SpendingChart from={from} to={to} />}
            {chart.id === 'trends' && (
              <SpendingTrendsChart from={from} to={to} compact topCategoryIds={topCategoryIds} />
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
  const today = new Date();
  const [preset, setPreset] = useState<Preset>('6m');
  const [from, setFrom] = useState(() => format(subMonths(today, 5), 'yyyy-MM'));
  const [to, setTo] = useState(() => format(today, 'yyyy-MM'));
  const [activeTab, setActiveTab] = useState<Tab>('all');

  useEffect(() => {
    if (preset === 'custom') return;
    const now = new Date();
    const ranges: Record<string, { from: string; to: string }> = {
      '1m': { from: format(now, 'yyyy-MM'), to: format(now, 'yyyy-MM') },
      '3m': { from: format(subMonths(now, 2), 'yyyy-MM'), to: format(now, 'yyyy-MM') },
      '6m': { from: format(subMonths(now, 5), 'yyyy-MM'), to: format(now, 'yyyy-MM') },
      ytd: { from: format(startOfYear(now), 'yyyy-MM'), to: format(now, 'yyyy-MM') },
      'last-year': {
        from: format(startOfYear(subYears(now, 1)), 'yyyy-MM'),
        to: format(endOfYear(subYears(now, 1)), 'yyyy-MM'),
      },
    };
    const r = ranges[preset];
    setFrom(r.from);
    setTo(r.to);
  }, [preset]);

  const { data: nwData = [] } = useNetWorth(from, to);
  const { data: ieData = [] } = useIncomeVsExpenses(from, to);
  const { data: spData = [] } = useSpendingByCategory(from, to);

  const statCards = useMemo((): StatCard[] => {
    switch (activeTab) {
      case 'all': {
        // Signed totals, colored by sign like Actual Budget: >0 green, <0 red, 0 neutral.
        // Values display as absolute amounts.
        const totalInc = ieData.reduce((s, d) => s + d.income, 0);
        const expNet = ieData.reduce((s, d) => s + d.expenseNet, 0);
        const txCount = ieData.reduce((s, d) => s + d.expenseCount, 0);
        const monthCount = Math.max(ieData.length, 1);
        const fmtMonth = (m: string) => format(parseISO(`${m}-01`), 'MMM yyyy');
        const range = from === to ? fmtMonth(from) : `${fmtMonth(from)} – ${fmtMonth(to)}`;
        const signedCard = (label: string, cents: number): StatCard => {
          const v = Math.round(cents);
          return {
            label, sub: range, value: formatCurrency(Math.abs(v)),
            tone: v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral',
          };
        };
        return [
          signedCard('Total Income', totalInc),
          signedCard('Total Expenses', expNet),
          signedCard('Avg Per Month', expNet / monthCount),
          signedCard('Avg Per Transaction', txCount > 0 ? expNet / txCount : 0),
        ];
      }
      case 'net-worth': {
        if (!nwData.length) return [];
        const latest = nwData[nwData.length - 1].netWorth;
        const change = nwData.length > 1 ? latest - nwData[0].netWorth : 0;
        const sign = change >= 0 ? '+' : '';
        return [
          { label: 'Net Worth', value: formatCurrency(latest) },
          { label: 'Period Change', value: `${sign}${formatCurrency(change)}` },
        ];
      }
      case 'income': {
        const totalIncome = ieData.reduce((s, d) => s + d.income, 0);
        const totalExpenses = ieData.reduce((s, d) => s + d.expenses, 0);
        const net = totalIncome - totalExpenses;
        const rate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;
        return [
          { label: 'Total Income', value: formatCurrency(totalIncome) },
          { label: 'Total Expenses', value: formatCurrency(totalExpenses) },
          { label: 'Net Savings', value: formatCurrency(net) },
          { label: 'Savings Rate', value: `${rate}%` },
        ];
      }
      case 'spending': {
        const totalSpent = spData.reduce((s, d) => s + d.totalSpent, 0);
        return [
          { label: 'Total Spent', value: formatCurrency(totalSpent) },
          { label: 'Categories', value: String(spData.length) },
        ];
      }
      case 'trends':
        return [];
    }
  }, [activeTab, nwData, ieData, spData, from, to]);

  function handleExport() {
    if (activeTab === 'all') return;
    const filename = `reports-${activeTab}-${from}-${to}.csv`;
    switch (activeTab) {
      case 'net-worth':
        downloadCsv(
          filename,
          nwData.map((d) => ({
            month: d.month,
            assets_cents: d.assets,
            liabilities_cents: d.liabilities,
            net_worth_cents: d.netWorth,
          })),
        );
        break;
      case 'income':
        downloadCsv(
          filename,
          ieData.map((d) => ({
            month: d.month,
            income_cents: d.income,
            expenses_cents: d.expenses,
            net_cents: d.net,
          })),
        );
        break;
      case 'spending':
        downloadCsv(
          filename,
          spData.map((d) => ({
            category: `${showCategoryIcons && d.categoryIcon ? d.categoryIcon + ' ' : ''}${d.categoryName ?? 'Uncategorized'}`,
            group: d.groupName ?? '',
            total_cents: d.totalSpent,
          })),
        );
        break;
      case 'trends':
        break;
    }
  }

  const chartHeight = CHART_HEIGHT[activeTab];

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-text shrink-0">Reports</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-0">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-b-2 ${
                    preset === p.id
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <MonthRangePicker
                from={from}
                to={to}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                }}
                defaultOpen
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={activeTab === 'all'}
            >
              <Download size={13} /> Export CSV
            </Button>
            <Link
              to="/reports/custom"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-md hover:bg-brand-50 transition-colors"
            >
              <Plus size={13} />
              Custom Report
            </Link>
          </div>
        </div>
        <div className="flex gap-0 mt-3 border-b border-border-light -mb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <StatCardRow cards={statCards} variant={activeTab === 'all' ? 'hero' : 'default'} />
        {activeTab === 'all' ? (
          <OverviewGrid from={from} to={to} onSelectTab={setActiveTab} />
        ) : (
          <div className={`w-full ${chartHeight}`}>
            {activeTab === 'net-worth' && <NetWorthChart from={from} to={to} />}
            {activeTab === 'income' && <IncomeExpensesChart from={from} to={to} />}
            {activeTab === 'spending' && <SpendingChart from={from} to={to} />}
            {activeTab === 'trends' && <SpendingTrendsChart from={from} to={to} />}
          </div>
        )}
      </div>
    </div>
  );
}
