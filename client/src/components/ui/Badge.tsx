type Variant = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'positive' | 'negative';

interface Props {
  variant: Variant;
  label?: string;
}

const styles: Record<Variant, string> = {
  checking: 'bg-brand-100 text-brand-700',
  savings: 'bg-positive-subtle text-positive',
  credit: 'bg-caution-subtle text-caution',
  cash: 'bg-surface-alt text-text-secondary',
  investment: 'bg-invest-bg text-invest-text',
  positive: 'bg-positive-subtle text-positive',
  negative: 'bg-negative-subtle text-negative',
};

const labels: Record<Variant, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit',
  cash: 'Cash',
  investment: 'Investment',
  positive: 'Positive',
  negative: 'Negative',
};

export function Badge({ variant, label }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[variant]}`}
    >
      {label ?? labels[variant]}
    </span>
  );
}
