export const PAYEE_COLORS = [
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
];

export function payeeColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PAYEE_COLORS[Math.abs(hash) % PAYEE_COLORS.length];
}

export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  checking: '#3B82F6',
  savings: '#10B981',
  credit: '#F59E0B',
  cash: '#6B7280',
  investment: '#8B5CF6',
};
