import { Loader2 } from 'lucide-react';
import type { PlaidSyncStatus } from '../../types';

interface Props {
  status: PlaidSyncStatus;
  className?: string;
}

const statusConfig: Record<PlaidSyncStatus, { dot: string; label: string }> = {
  good: { dot: 'bg-positive', label: 'Synced' },
  syncing: { dot: '', label: 'Syncing...' },
  error: { dot: 'bg-negative', label: 'Error' },
  login_required: { dot: 'bg-caution', label: 'Login Required' },
};

export function SyncStatusBadge({ status, className = '' }: Props) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary ${className}`}
    >
      {status === 'syncing' ? (
        <Loader2 size={12} className="animate-spin text-brand-500" />
      ) : (
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
      )}
      {config.label}
    </span>
  );
}
