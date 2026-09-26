import { format, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import ChartTypeSelector from './ChartTypeSelector';
import AccountMultiSelect from './AccountMultiSelect';
import CategoryTreePicker from './CategoryTreePicker';
import type {
  CustomReportConfig,
  ReportMode,
  ReportGroupBy,
  BalanceType,
  DatePresetCustom,
} from '../../types';

interface Props {
  config: CustomReportConfig;
  onChange: (config: CustomReportConfig) => void;
}

const MODE_OPTIONS: { id: ReportMode; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'time', label: 'Over Time' },
];

const GROUP_BY_OPTIONS: { id: ReportGroupBy; label: string; modes: ReportMode[] }[] = [
  { id: 'category', label: 'Category', modes: ['total', 'time'] },
  { id: 'categoryGroup', label: 'Category Group', modes: ['total', 'time'] },
  { id: 'payee', label: 'Payee', modes: ['total', 'time'] },
  { id: 'account', label: 'Account', modes: ['total', 'time'] },
  { id: 'month', label: 'Month', modes: ['total'] },
];

const BALANCE_OPTIONS: { id: BalanceType; label: string }[] = [
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'net', label: 'Net' },
];

const DATE_PRESETS: { id: DatePresetCustom; label: string }[] = [
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '12m', label: '12M' },
  { id: 'ytd', label: 'YTD' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

function computeDateRange(preset: DatePresetCustom): { from: string; to: string } {
  const now = new Date();
  const to = format(now, 'yyyy-MM');
  switch (preset) {
    case '3m':
      return { from: format(subMonths(now, 2), 'yyyy-MM'), to };
    case '6m':
      return { from: format(subMonths(now, 5), 'yyyy-MM'), to };
    case '12m':
      return { from: format(subMonths(now, 11), 'yyyy-MM'), to };
    case 'ytd':
      return { from: format(startOfYear(now), 'yyyy-MM'), to };
    case 'last-year':
      return {
        from: format(startOfYear(subYears(now, 1)), 'yyyy-MM'),
        to: format(endOfYear(subYears(now, 1)), 'yyyy-MM'),
      };
    case 'all':
      return { from: '2020-01', to };
    default:
      return { from: format(subMonths(now, 5), 'yyyy-MM'), to };
  }
}

function set<K extends keyof CustomReportConfig>(
  config: CustomReportConfig,
  key: K,
  value: CustomReportConfig[K],
): CustomReportConfig {
  return { ...config, [key]: value };
}

export default function ReportBuilderSidebar({ config, onChange }: Props) {
  function handleModeChange(mode: ReportMode) {
    let next = set(config, 'mode', mode);
    const validGroups = GROUP_BY_OPTIONS.filter((g) => g.modes.includes(mode));
    if (!validGroups.find((g) => g.id === next.groupBy)) {
      next = set(next, 'groupBy', validGroups[0].id);
    }
    if (mode === 'time' && next.chartType === 'donut') {
      next = set(next, 'chartType', 'bar');
    }
    if (mode === 'total' && next.chartType === 'stacked-bar') {
      next = set(next, 'chartType', 'bar');
    }
    onChange(next);
  }

  function handlePresetChange(preset: DatePresetCustom) {
    if (preset === 'custom') {
      onChange(set(config, 'dateRange', { ...config.dateRange, preset: 'custom' }));
    } else {
      const range = computeDateRange(preset);
      onChange(set(config, 'dateRange', { preset, ...range }));
    }
  }

  return (
    <div className="w-72 shrink-0 bg-surface border-r border-border overflow-y-auto p-4 space-y-5">
      <Section label="Chart Type">
        <ChartTypeSelector
          value={config.chartType}
          mode={config.mode}
          onChange={(ct) => onChange(set(config, 'chartType', ct))}
        />
      </Section>

      <Section label="Mode">
        <div className="flex gap-1">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                config.mode === m.id
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-text-secondary hover:bg-hover border border-transparent'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Group By">
        <select
          value={config.groupBy}
          onChange={(e) => onChange(set(config, 'groupBy', e.target.value as ReportGroupBy))}
          className="w-full rounded-md border border-border text-sm py-1.5 px-2 bg-surface text-text focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none"
        >
          {GROUP_BY_OPTIONS.filter((g) => g.modes.includes(config.mode)).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </Section>

      <Section label="Balance Type">
        <div className="flex gap-1">
          {BALANCE_OPTIONS.map((b) => (
            <button
              key={b.id}
              onClick={() => onChange(set(config, 'balanceType', b.id))}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                config.balanceType === b.id
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-text-secondary hover:bg-hover border border-transparent'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Date Range">
        <div className="flex flex-wrap gap-1 mb-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p.id)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                config.dateRange.preset === p.id
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-text-secondary hover:bg-hover border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {config.dateRange.preset === 'custom' && (
          <div className="flex gap-2">
            <input
              type="month"
              value={config.dateRange.from}
              onChange={(e) =>
                onChange(set(config, 'dateRange', { ...config.dateRange, from: e.target.value }))
              }
              className="flex-1 rounded-md border border-border text-xs py-1 px-2 bg-surface text-text focus:border-brand-600 focus:outline-none"
            />
            <input
              type="month"
              value={config.dateRange.to}
              onChange={(e) =>
                onChange(set(config, 'dateRange', { ...config.dateRange, to: e.target.value }))
              }
              className="flex-1 rounded-md border border-border text-xs py-1 px-2 bg-surface text-text focus:border-brand-600 focus:outline-none"
            />
          </div>
        )}
      </Section>

      <Section label="Accounts">
        <AccountMultiSelect
          selected={config.filters.accountIds}
          onChange={(ids) =>
            onChange(set(config, 'filters', { ...config.filters, accountIds: ids }))
          }
        />
      </Section>

      <Section label="Categories">
        <CategoryTreePicker
          selectedCategoryIds={config.filters.categoryIds}
          selectedGroupIds={config.filters.categoryGroupIds}
          onCategoryChange={(ids) =>
            onChange(set(config, 'filters', { ...config.filters, categoryIds: ids }))
          }
          onGroupChange={(ids) =>
            onChange(set(config, 'filters', { ...config.filters, categoryGroupIds: ids }))
          }
        />
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-tertiary mb-2">{label}</p>
      {children}
    </div>
  );
}
