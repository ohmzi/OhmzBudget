interface Props {
  children: React.ReactNode;
  variant?: 'padded' | 'full';
  maxWidth?: string;
  className?: string;
}

export function PageLayout({
  children,
  variant = 'full',
  maxWidth = '1400px',
  className = '',
}: Props) {
  if (variant === 'padded') {
    return (
      <div className={`p-6 mx-auto ${className}`} style={{ maxWidth }}>
        {children}
      </div>
    );
  }

  return <div className={`flex flex-col h-full bg-surface ${className}`}>{children}</div>;
}
