interface Props {
  label: string;
  value: string;
  sub?: string;
  accent?: 'positive' | 'negative' | 'caution' | 'brand';
  valueColor?: string;
  className?: string;
}

const accentBorders: Record<string, string> = {
  positive: 'border-l-[3px] border-l-positive',
  negative: 'border-l-[3px] border-l-negative',
  caution: 'border-l-[3px] border-l-caution',
  brand: 'border-l-[3px] border-l-brand-600',
};

export function StatCard({ label, value, sub, accent, valueColor, className = '' }: Props) {
  return (
    <div
      className={`bg-surface-alt rounded-lg px-4 py-3 border border-border-light ${
        accent ? accentBorders[accent] : ''
      } ${className}`}
    >
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p className={`text-lg font-semibold tabular-nums mt-0.5 ${valueColor || 'text-text'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-text-tertiary mt-0.5">{sub}</p>}
    </div>
  );
}
