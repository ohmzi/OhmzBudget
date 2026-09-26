import { useState } from 'react';
import { formatCurrency, parseCents } from '../../utils/currency';

interface Props {
  value: number;
  onChange: (cents: number) => void;
  placeholder?: string;
  className?: string;
  allowNegative?: boolean;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  allowNegative = false,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  function handleFocus() {
    setFocused(true);
    setRaw(value === 0 ? '' : String(value / 100));
  }

  function handleBlur() {
    setFocused(false);
    const cents = parseCents(raw);
    onChange(allowNegative ? cents : Math.abs(cents));
  }

  return (
    <input
      type={focused ? 'number' : 'text'}
      value={focused ? raw : value === 0 ? '' : formatCurrency(value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(e) => setRaw(e.target.value)}
      placeholder={placeholder}
      step="0.01"
      className={`block w-full rounded-md border border-border px-3 py-2 text-sm text-text placeholder-text-disabled focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${className}`}
    />
  );
}
