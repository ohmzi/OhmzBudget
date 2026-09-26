interface Props {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  accentLeft?: 'positive' | 'negative' | 'caution' | 'brand';
  className?: string;
}

const paddings = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6' };

const accents: Record<string, string> = {
  positive: 'border-l-[3px] border-l-positive',
  negative: 'border-l-[3px] border-l-negative',
  caution: 'border-l-[3px] border-l-caution',
  brand: 'border-l-[3px] border-l-brand-600',
};

export function Card({
  children,
  padding = 'md',
  hover = false,
  accentLeft,
  className = '',
}: Props) {
  return (
    <div
      className={`bg-surface rounded-lg shadow-card border border-border-light ${
        hover ? 'hover:shadow-hover transition-shadow' : ''
      } ${paddings[padding]} ${accentLeft ? accents[accentLeft] : ''} ${className}`}
    >
      {children}
    </div>
  );
}
