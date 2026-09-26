import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTransactions } from '../../hooks/useTransactions';
import { useCategories } from '../../hooks/useCategories';
import { useAccounts } from '../../hooks/useAccounts';
import { usePayees } from '../../hooks/usePayees';
import { TransactionRow } from '../transactions/TransactionRow';
import { Card } from '../ui/Card';
import type { CategoryGroup } from '../../types';

export default function RecentTransactions() {
  const { data: transactions = [], isLoading } = useTransactions({ limit: 5 });
  const { data: groups = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: payees = [] } = usePayees();
  const navigate = useNavigate();

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string | null }>();
    for (const g of groups as CategoryGroup[]) {
      for (const c of g.categories) map.set(c.id, { name: c.name, icon: c.icon });
    }
    return map;
  }, [groups]);

  const accountInfoMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, { name: a.name, type: a.type }])),
    [accounts],
  );

  if (isLoading) {
    return (
      <Card>
        <div className="h-5 w-40 bg-surface-alt rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-alt rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-text">Recent Transactions</h3>
        <Link
          to="/transactions"
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          View all
        </Link>
      </div>

      {transactions.length === 0 ? (
        <p className="text-sm text-text-disabled py-4 text-center">No transactions yet.</p>
      ) : (
        <div>
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              categoryEntry={tx.categoryId ? (categoryMap.get(tx.categoryId) ?? null) : null}
              categoryMap={categoryMap}
              groups={groups as CategoryGroup[]}
              payees={payees}
              accountName={accountInfoMap.get(tx.accountId)?.name}
              accountType={accountInfoMap.get(tx.accountId)?.type}
              isSelected={false}
              onOpenDetail={() => navigate('/transactions')}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
