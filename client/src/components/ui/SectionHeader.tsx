interface Props {
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, count, action, className = '' }: Props) {
  return (
    <div className={`flex items-center justify-between py-2 ${className}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
          {title}
        </h3>
        {count !== undefined && <span className="text-xs text-text-disabled">{count}</span>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
