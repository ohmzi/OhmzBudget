import { BarChart3, LineChart, AreaChart, PieChart, Table2, Layers } from 'lucide-react';
import type { ChartType, ReportMode } from '../../types';

const MODE_LABELS: Record<ReportMode, string> = {
  total: 'Total',
  time: 'Over Time',
};

const CHART_TYPES: { id: ChartType; icon: typeof BarChart3; label: string; modes: ReportMode[] }[] = [
  { id: 'bar', icon: BarChart3, label: 'Bar', modes: ['total', 'time'] },
  { id: 'stacked-bar', icon: Layers, label: 'Stacked', modes: ['time'] },
  { id: 'line', icon: LineChart, label: 'Line', modes: ['total', 'time'] },
  { id: 'area', icon: AreaChart, label: 'Area', modes: ['total', 'time'] },
  { id: 'donut', icon: PieChart, label: 'Donut', modes: ['total'] },
  { id: 'table', icon: Table2, label: 'Table', modes: ['total', 'time'] },
];

interface Props {
  value: ChartType;
  mode: ReportMode;
  onChange: (type: ChartType) => void;
}

export default function ChartTypeSelector({ value, mode, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHART_TYPES.map(t => {
        const disabled = !t.modes.includes(mode);
        const active = t.id === value;
        return (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onChange(t.id)}
            title={disabled
              ? `${t.label} is only available in '${t.modes.map(m => MODE_LABELS[m]).join("' and '")}' mode`
              : t.label
            }
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
              active
                ? 'bg-brand-50 text-brand-700 border border-brand-200'
                : disabled
                  ? 'text-text-disabled cursor-not-allowed'
                  : 'text-text-secondary hover:bg-hover border border-transparent'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
