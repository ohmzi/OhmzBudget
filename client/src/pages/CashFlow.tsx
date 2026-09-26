import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { ResponsiveContainer, Sankey } from 'recharts';
import { useSpendingByCategory, useIncomeByCategory } from '../hooks/useReports';
import { formatCurrency, formatCentsAxis } from '../utils/currency';
import { downloadCsv } from '../utils/exportCsv';
import { usePreferencesStore } from '../store/preferencesStore';
import { chartColors, CATEGORY_COLORS } from '../utils/chartColors';
import { Button } from '../components/ui/Button';
import { Download, X } from 'lucide-react';
import { TransactionTable } from '../components/transactions/TransactionTable';
import {
  ChartSkeleton,
  EmptyState,
  StatCardRow,
  EXPENSE_COLORS,
} from '../components/reports/ChartHelpers';
import type { StatCard } from '../components/reports/ChartHelpers';

type Preset = '1m' | '3m' | '6m' | 'ytd' | 'last-year' | 'custom';
type NodeType = 'income' | 'hub' | 'expense-group' | 'subcategory' | 'savings';

const PRESETS: { id: Preset; label: string }[] = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'This Year' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'custom', label: 'Custom' },
];

const MIN_SAVINGS_CENTS = 500;

interface SankeyNode {
  name: string;
  nodeType: NodeType;
  amount: number;
  color: string;
  categoryId?: string | null;
  groupId?: string | null;
  groupName?: string;
  percentage?: number;
}

interface SelectedNode {
  categoryId?: string | null;
  groupId?: string | null;
  name: string;
  nodeType: NodeType;
}

interface SankeyDiagramProps {
  from: string;
  to: string;
  selectedNode: SelectedNode | null;
  onNodeClick: (node: SelectedNode | null) => void;
}

function SankeyDiagram({ from, to, selectedNode, onNodeClick }: SankeyDiagramProps) {
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
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

    const totalIncome = incomeData.reduce((sum, c) => sum + c.totalReceived, 0);
    const totalExpenses = spendingData.reduce((sum, c) => sum + c.totalSpent, 0);
    const savings = totalIncome - totalExpenses;

    // Column 1: Income sources
    const incomeNodes: SankeyNode[] = incomeData.map((c) => ({
      name: `${showCategoryIcons && c.categoryIcon ? c.categoryIcon + ' ' : ''}${c.categoryName ?? 'Income'}`,
      nodeType: 'income',
      amount: c.totalReceived,
      color: chartColors.positive,
      percentage: totalIncome > 0 ? (c.totalReceived / totalIncome) * 100 : 0,
    }));

    const hubIdx = incomeNodes.length;

    // Build group data with colors
    const groupTotals = new Map<string, { total: number; groupId: string | null }>();
    for (const item of spendingData) {
      const key = item.groupName ?? 'Uncategorized';
      const existing = groupTotals.get(key);
      groupTotals.set(key, {
        total: (existing?.total ?? 0) + item.totalSpent,
        groupId: existing?.groupId ?? item.groupId,
      });
    }
    const sortedGroups = [...groupTotals.entries()].sort((a, b) => b[1].total - a[1].total);

    // Map group names to colors for inheritance
    const groupColorMap = new Map<string, string>();
    sortedGroups.forEach(([name], i) => {
      groupColorMap.set(name, EXPENSE_COLORS[i % EXPENSE_COLORS.length]);
    });

    // Column 3: Expense groups
    const expenseGroupNodes: SankeyNode[] = sortedGroups.map(([name, { total, groupId }], i) => ({
      name,
      nodeType: 'expense-group',
      amount: total,
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
      groupId,
      groupName: name,
      percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
    }));

    // Column 4: Subcategories (sorted by group, then by amount within group)
    const subcategoryNodes: SankeyNode[] = [];
    const groupCategoryMap = new Map<string, typeof spendingData>();
    for (const item of spendingData) {
      const key = item.groupName ?? 'Uncategorized';
      if (!groupCategoryMap.has(key)) groupCategoryMap.set(key, []);
      groupCategoryMap.get(key)!.push(item);
    }

    // Build subcategories in group order (matching sortedGroups order)
    for (const [groupName] of sortedGroups) {
      const items = groupCategoryMap.get(groupName) ?? [];
      const sorted = [...items].sort((a, b) => b.totalSpent - a.totalSpent);
      for (const item of sorted) {
        subcategoryNodes.push({
          name: `${showCategoryIcons && item.categoryIcon ? item.categoryIcon + ' ' : ''}${item.categoryName ?? 'Uncategorized'}`,
          nodeType: 'subcategory',
          amount: item.totalSpent,
          color: groupColorMap.get(groupName) ?? chartColors.axis,
          categoryId: item.categoryId,
          groupName,
          percentage: totalExpenses > 0 ? (item.totalSpent / totalExpenses) * 100 : 0,
        });
      }
    }

    const savingsNode: SankeyNode[] =
      savings > MIN_SAVINGS_CENTS
        ? [{
            name: 'Savings',
            nodeType: 'savings',
            amount: savings,
            color: '#8b5cf6',
            percentage: totalIncome > 0 ? (savings / totalIncome) * 100 : 0,
          }]
        : [];

    // Column 2: Hub
    const hubNode: SankeyNode = {
      name: 'Total Income',
      nodeType: 'hub',
      amount: totalIncome,
      color: chartColors.brand,
    };

    const nodes: SankeyNode[] = [
      ...incomeNodes,
      hubNode,
      ...expenseGroupNodes,
      ...subcategoryNodes,
      ...savingsNode,
    ];

    // Links
    const groupStartIdx = hubIdx + 1;
    const subcatStartIdx = groupStartIdx + expenseGroupNodes.length;

    // Income -> Hub
    const incomeLinks = incomeNodes.map((_, i) => ({
      source: i,
      target: hubIdx,
      value: incomeData[i].totalReceived,
    }));

    // Hub -> Groups
    const groupLinks = sortedGroups.map(([, { total }], i) => ({
      source: hubIdx,
      target: groupStartIdx + i,
      value: total,
    }));

    // Groups -> Subcategories
    const subcatLinks: { source: number; target: number; value: number }[] = [];
    let subcatIdx = subcatStartIdx;
    for (let gi = 0; gi < sortedGroups.length; gi++) {
      const groupName = sortedGroups[gi][0];
      const items = groupCategoryMap.get(groupName) ?? [];
      const sorted = [...items].sort((a, b) => b.totalSpent - a.totalSpent);
      for (const item of sorted) {
        subcatLinks.push({
          source: groupStartIdx + gi,
          target: subcatIdx,
          value: item.totalSpent,
        });
        subcatIdx++;
      }
    }

    // Hub -> Savings
    const savingsLinks = savingsNode.length
      ? [{ source: hubIdx, target: nodes.length - 1, value: savings }]
      : [];

    const links = [...incomeLinks, ...groupLinks, ...subcatLinks, ...savingsLinks].filter(
      (l) => l.value > 0,
    );

    return links.length ? { nodes, links } : null;
  }, [incomeData, spendingData, showCategoryIcons]);

  const isNodeSelected = useCallback(
    (node: SankeyNode) => {
      if (!selectedNode) return false;
      if (selectedNode.nodeType === 'subcategory' && node.nodeType === 'subcategory') {
        return node.categoryId === selectedNode.categoryId;
      }
      if (selectedNode.nodeType === 'expense-group' && node.nodeType === 'expense-group') {
        return node.groupName === selectedNode.name;
      }
      return false;
    },
    [selectedNode],
  );

  const isNodeRelated = useCallback(
    (node: SankeyNode) => {
      if (!selectedNode) return true;
      if (isNodeSelected(node)) return true;
      if (selectedNode.nodeType === 'expense-group') {
        return node.groupName === selectedNode.name && node.nodeType === 'subcategory';
      }
      if (selectedNode.nodeType === 'subcategory') {
        return node.nodeType === 'expense-group' && node.groupName === selectedNode.groupId;
      }
      return false;
    },
    [selectedNode, isNodeSelected],
  );

  const renderNode = useCallback(
    (props: any) => {
      const { x, y, width, height, payload } = props;
      if (!payload || height < 1) return null;

      const node = payload as SankeyNode;
      const { name, nodeType, amount, color, percentage } = node;
      const isClickable = nodeType === 'subcategory' || nodeType === 'expense-group';
      const isLeft = nodeType === 'income';
      const labelX = isLeft ? x - 8 : x + width + 8;
      const anchor = isLeft ? 'end' : 'start';
      const midY = y + height / 2;

      const dimmed = selectedNode && !isNodeSelected(node) && !isNodeRelated(node);
      const nodeOpacity = dimmed ? 0.3 : 1;

      const handleClick = () => {
        if (!isClickable) return;
        if (isNodeSelected(node)) {
          onNodeClick(null);
        } else {
          onNodeClick({
            categoryId: node.categoryId,
            groupId: node.groupId,
            name: node.name,
            nodeType: node.nodeType,
          });
        }
      };

      const pctStr = percentage != null && percentage > 0 ? ` (${percentage.toFixed(1)}%)` : '';
      const amountLabel = `${formatCurrency(amount)}${pctStr}`;

      return (
        <g
          onMouseEnter={(e: React.MouseEvent) =>
            setTooltip({ x: e.clientX, y: e.clientY, title: name, value: formatCurrency(amount) })
          }
          onMouseLeave={() => setTooltip(null)}
          onClick={handleClick}
          style={{ cursor: isClickable ? 'pointer' : 'default', opacity: nodeOpacity }}
        >
          <rect x={x} y={y} width={width} height={height} fill={color} rx={3} />
          {/* Colored indicator square for subcategories */}
          {nodeType === 'subcategory' && (
            <rect
              x={labelX + (isLeft ? -9 : 0)}
              y={midY - 3}
              width={7}
              height={7}
              fill={color}
              rx={1.5}
            />
          )}
          <text
            x={nodeType === 'subcategory' ? labelX + 12 : labelX}
            y={height > 18 ? midY - 5 : midY + 1}
            textAnchor={anchor}
            fontSize={10}
            fill={chartColors.label}
            fontWeight="500"
          >
            {name}
          </text>
          {height > 18 && (
            <text
              x={nodeType === 'subcategory' ? labelX + 12 : labelX}
              y={midY + 8}
              textAnchor={anchor}
              fontSize={9}
              fill={chartColors.axis}
            >
              {amountLabel}
            </text>
          )}
        </g>
      );
    },
    [setTooltip, selectedNode, isNodeSelected, isNodeRelated, onNodeClick],
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

      const srcNode = payload?.source as SankeyNode | undefined;
      const tgtNode = payload?.target as SankeyNode | undefined;
      const srcName = srcNode?.name ?? '';
      const tgtName = tgtNode?.name ?? '';
      const value = payload?.value ?? 0;

      let linkOpacity = 0.2;
      if (selectedNode) {
        const srcRelated = srcNode ? isNodeSelected(srcNode) || isNodeRelated(srcNode) : false;
        const tgtRelated = tgtNode ? isNodeSelected(tgtNode) || isNodeRelated(tgtNode) : false;
        linkOpacity = srcRelated && tgtRelated ? 0.35 : 0.05;
      }

      return (
        <path
          d={d}
          fill={color}
          fillOpacity={linkOpacity}
          stroke={color}
          strokeWidth={0.5}
          strokeOpacity={selectedNode ? linkOpacity : 0.4}
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
    [setTooltip, selectedNode, isNodeSelected, isNodeRelated],
  );

  if (il || sl) return <ChartSkeleton />;
  if (!sankeyData) return <EmptyState />;

  const maxCol = Math.max(
    incomeData.length,
    1,
    new Set(spendingData.map((d) => d.groupName ?? 'Uncategorized')).size +
      (sankeyData.nodes.some((n) => n.nodeType === 'savings') ? 1 : 0),
    spendingData.length,
  );
  const nodePad = maxCol > 15 ? 6 : maxCol > 10 ? 8 : 10;

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={sankeyData}
          nodePadding={nodePad}
          nodeWidth={12}
          linkCurvature={0.5}
          iterations={0}
          margin={{ top: 16, right: 200, left: 180, bottom: 16 }}
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
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
  const today = new Date();
  const [preset, setPreset] = useState<Preset>('6m');
  const [from, setFrom] = useState(() => format(subMonths(today, 5), 'yyyy-MM'));
  const [to, setTo] = useState(() => format(today, 'yyyy-MM'));
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const txSectionRef = useRef<HTMLDivElement>(null);

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

  // Clear selection when date range changes
  useEffect(() => {
    setSelectedNode(null);
  }, [from, to]);

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

  const sankeyHeight = useMemo(() => {
    const groupCount = new Set(spData.map((d) => d.groupName ?? 'Uncategorized')).size;
    const maxCol = Math.max(incData.length, groupCount + 1, spData.length);
    return Math.max(420, maxCol * 28 + 60);
  }, [incData, spData]);

  const handleNodeClick = useCallback((node: SelectedNode | null) => {
    setSelectedNode(node);
    if (node) {
      setTimeout(() => {
        txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, []);

  function handleExport() {
    const filename = `cash-flow-${from}-${to}.csv`;
    downloadCsv(
      filename,
      spData.map((d) => ({
        category: `${showCategoryIcons && d.categoryIcon ? d.categoryIcon + ' ' : ''}${d.categoryName ?? 'Uncategorized'}`,
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
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-b-2 cursor-pointer ${
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
        <div className="w-full" style={{ height: sankeyHeight }}>
          <SankeyDiagram
            from={from}
            to={to}
            selectedNode={selectedNode}
            onNodeClick={handleNodeClick}
          />
        </div>

        {selectedNode && (
          <div ref={txSectionRef} className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text">
                Transactions: {selectedNode.name}
              </h2>
              <button
                onClick={() => setSelectedNode(null)}
                className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors"
              >
                <X size={14} />
                Clear
              </button>
            </div>
            <div className="bg-surface rounded-lg shadow-card border border-border-light overflow-hidden">
              <TransactionTable
                categoryId={
                  selectedNode.nodeType === 'subcategory' && selectedNode.categoryId
                    ? selectedNode.categoryId
                    : undefined
                }
                categoryGroupId={
                  selectedNode.nodeType === 'expense-group' && selectedNode.groupId
                    ? selectedNode.groupId
                    : undefined
                }
                overlayDetail
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
