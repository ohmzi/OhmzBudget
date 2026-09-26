import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckSquare, ChevronRight } from 'lucide-react';
import { useAccounts } from '../hooks/useAccounts';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/currency';
import { TransactionTable } from '../components/transactions/TransactionTable';

export default function AccountTransactionsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const account = accounts.find((a) => a.id === id);

  if (!account) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-1">
          <Link to="/accounts" className="hover:text-brand-600 transition-colors">
            Accounts
          </Link>
          <ChevronRight size={11} />
          <span className="text-text-secondary">{account.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold text-text">{account.name}</h1>
            <Badge variant={account.type} />
            <span
              className={`text-base font-medium tabular-nums ${account.balance < 0 ? 'text-negative' : 'text-text-secondary'}`}
            >
              {formatCurrency(account.balance)}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/accounts/${account.id}/reconcile`)}
          >
            <CheckSquare size={13} /> Reconcile
          </Button>
        </div>
      </div>
      <TransactionTable accountId={account.id} />
    </div>
  );
}
