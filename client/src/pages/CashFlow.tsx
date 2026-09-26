import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { ResponsiveContainer, Sankey } from 'recharts';
import { useSpendingByCategory, useIncomeByCategory } from '../hooks/useReports';
import { formatCurrency, formatCentsAxis } from '../utils/currency';
import { downloadCsv } from '../utils/exportCsv';
import { chartColors, CATEGORY_COLORS } from '../utils/chartColors';
import { Button } from '../components/ui/Button';
import { Download } from 'lucide-react';
import {
  ChartSkeleton,
  EmptyState,
  StatCardRow,
  EXPENSE_COLORS,
} from '../components/reports/ChartHelpers';
import type { StatCard } from '../components/reports/ChartHelpers';

type Preset = '1m' | '3m' | '6m' | 'ytd' | 'last-year' | 'custom';
type NodeType = 'income' | 'hub' | 'expense' | 'savings';

const PRESETS: { id: Preset; label: string }[] = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'This Year' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'custom', label: 'Custom' },
];

const MIN_SAVINGS_CENTS = 500;

function SankeyDiagram({ from, to }: { from: string; to: string }) {
  const { data: incomeData = [], isLoading: il } = useIncomeByCategory(from, to);
  const { data: spendingData = [], isLoading: sl } = useSpendingByCategory(from, to);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    value: string;
  } | null>(null);

  const sankeyData = useMemo(() => {
    if (!incomeData.length && !spendingData.length) return null;

    const groupTotals = new Map<string, number>();
    for (const item of spendingData) {
      const key = item.groupName ?? 'Uncategorized';
      groupTotals.set(key, (groupTotals.get(key) ?? 0) + item.totalSpent);
    }
    const sortedGroups = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]);

    const totalIncome = incomeData.reduce((sum, c) => sum + c.totalReceived, 0);
    const totalExpenses = sortedGroups.reduce((sum, [, v]) => sum + v, 0);
    const savings = totalIncome - totalExpenses;

    const incomeNodes = incomeData.map((c) => ({
      name: `${c.categoryIcon ? c.categoryIcon + ' ' : ''}${c.categoryName ?? 'Income'}`,
      nodeType: 'income' as NodeType,
      amount: c.totalReceived,
      color: chartColors.positive,
    }));

    const hubIdx = incomeNodes.length;

    const expenseNodes = sortedGroups.map(([name, amount], i) => ({
      name,
      nodeType: 'expense' as NodeType,
      amount,
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));

    const savingsNode =
      savings > MIN_SAVINGS_CENTS
        ? [{ name: 'Savings', nodeType: 'savings' as NodeType, amount: savings, color: '#8b5cf6' }]
        : [];

    const nodes = [
      ...incomeNodes,
      {
        name: 'Total Income',
        nodeType: 'hub' as NodeType,
        amount: totalIncome,
        color: chartColors.brand,
      },
      ...expenseNodes,
      ...savingsNode,
    ];

    const links = [
      ...incomeNodes.map((_, i) => ({
        source: i,
        target: hubIdx,
        value: incomeData[i].totalReceived,
      })),
      ...sortedGroups.map(([, amount], i) => ({
        source: hubIdx,
        target: hubIdx + 1 + i,
        value: amount,
      })),
      ...(savingsNode.length ? [{ source: hubIdx, target: nodes.length - 1, value: savings }] : []),
    ].filter((l) => l.value > 0);

    return links.length ? { nodes, links } : null;
  }, [incomeData, spendingData]);

  const renderNode = useCallback(
    (props: any) => {
      const { x, y, width, height, payload } = props;
      if (!payload || height < 1) return null;

      const { name, nodeType, amount, color } = payload;
      const isLeft = nodeType === 'income';
      const labelX = isLeft ? x - 8 : x + width + 8;
      const anchor = isLeft ? 'end' : 'start';
      const midY = y + height / 2;

      return (
        <g
          onMouseEnter={(e: React.MouseEvent) =>
            setTooltip({ x: e.clientX, y: e.clientY, title: name, value: formatCurrency(amount) })
          }
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: 'default' }}
        >
          <rect x={x} y={y} width={width} height={height} fill={color} rx={3} />
          <text
            x={labelX}
            y={height > 22 ? midY - 6 : midY + 1}
            textAnchor={anchor}
            fontSize={11}
            fill={chartColors.label}
            fontWeight="500"
          >
            {name}
          </text>
          {height > 22 && (
            <text x={labelX} y={midY + 9} textAnchor={anchor} fontSize={10} fill={chartColors.axis}>
              {formatCentsAxis(amount)}
            </text>
          )}
        </g>
      );
    },
    [setTooltip],
  );

  const renderLink = useCallback(
    (props: any) => {
      const {
        sourceX,
        sourceY,
        sourceControlX,
        targetX,
        targetY,
        targetControlX,
        linkWidth,
        payload,
      } = props;
      if (!linkWidth || linkWidth < 1) return null;

      const halfW = linkWidth / 2;
      const color = payload?.target?.color ?? chartColors.axis;
      const d = [
        `M${sourceX},${sourceY - halfW}`,
        `C${sourceControlX},${sourceY - halfW} ${targetControlX},${targetY - halfW} ${targetX},${targetY - halfW}`,
        `L${targetX},${targetY + halfW}`,
        `C${targetControlX},${targetY + halfW} ${sourceControlX},${sourceY + halfW} ${sourceX},${sourceY + halfW}`,
        'Z',
      ].join(' ');

      const srcName = payload?.source?.name ?? '';
      const tgtName = payload?.target?.name ?? '';
      const value = payload?.value ?? 0;

      return (
        <path
          d={d}
          fill={color}
          fillOpacity={0.2}
          stroke={color}
          strokeWidth={0.5}
          strokeOpacity={0.4}
          onMouseEnter={(e: React.MouseEvent) =>
            setTooltip({
              x: e.clientX,
              y: e.clientY,
              title: `${srcName} → ${tgtName}`,
              value: formatCurrency(value),
            })
          }
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: 'default' }}
        />
      );
    },
    [setTooltip],
  );

  if (il || sl) return <ChartSkeleton />;
  if (!sankeyData) return <EmptyState />;

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={sankeyData}
          nodePadding={14}
          nodeWidth={18}
          linkCurvature={0.5}
          margin={{ top: 20, right: 180, left: 180, bottom: 20 }}
          node={renderNode as any}
          link={renderLink as any}
        />
      </ResponsiveContainer>
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-surface rounded-md shadow-hover border border-border px-3 py-2"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="text-xs font-medium text-text">{tooltip.title}</p>
          <p className="text-xs text-positive font-medium">{tooltip.value}</p>
        </div>
      )}
    </div>
  );
}

export default function CashFlowPage() {
  const today = new Date();
  const [preset, setPreset] = useState<Preset>('6m');
  const [from, setFrom] = useState(() => format(subMonths(today, 5), 'yyyy-MM'));
  const [to, setTo] = useState(() => format(today, 'yyyy-MM'));

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

  const { data: incData = [] } = useIncomeByCategory(from, to);
  const { data: spData = [] } = useSpendingByCategory(from, to);

  const statCards = useMemo((): StatCard[] => {
    const totalIncome = incData.reduce((s, d) => s + d.totalReceived, 0);
    const totalExpenses = spData.reduce((s, d) => s + d.totalSpent, 0);
    const savings = totalIncome - totalExpenses;
    return [
      { label: 'Total Income', value: formatCurrency(totalIncome) },
      { label: 'Total Expenses', value: formatCurrency(totalExpenses) },
      { label: 'Savings', value: formatCurrency(Math.max(savings, 0)) },
    ];
  }, [incData, spData]);

  function handleExport() {
    const filename = `cash-flow-${from}-${to}.csv`;
    downloadCsv(
      filename,
      spData.map((d) => ({
        category: `${d.categoryIcon ? d.categoryIcon + ' ' : ''}${d.categoryName ?? 'Uncategorized'}`,
        group: d.groupName ?? '',
        total_cents: d.totalSpent,
      })),
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-text shrink-0">Cash Flow</h1>
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
              <>
                <span className="text-xs text-text-tertiary">From</span>
                <input
                  type="month"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="text-sm border border-border rounded-md px-2 py-1 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600"
                />
                <span className="text-xs text-text-tertiary">to</span>
                <input
                  type="month"
                  value={to}
                  min={from}
                  max={format(today, 'yyyy-MM')}
                  onChange={(e) => setTo(e.target.value)}
                  className="text-sm border border-border rounded-md px-2 py-1 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600"
                />
              </>
            )}
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download size={13} /> Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <StatCardRow cards={statCards} />
        <div className="w-full h-[540px]">
          <SankeyDiagram from={from} to={to} />
        </div>
      </div>
    </div>
  );
}
