interface Props {
  className?: string;
  /** Color of "Budget": the page's text color by default (black, or white in dark mode) */
  budgetClassName?: string;
  /** Color of "Ohmz" */
  ohmzClassName?: string;
}

/** The OhmzBudget wordmark: "Ohmz" in the brand blue, "Budget" in the text color */
export function BrandName({
  className = '',
  budgetClassName = 'text-text',
  ohmzClassName = 'text-brand-600',
}: Props) {
  return (
    <span className={className}>
      <span className={ohmzClassName}>Ohmz</span>
      <span className={budgetClassName}>Budget</span>
    </span>
  );
}
