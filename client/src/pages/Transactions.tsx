import { useState } from 'react';
import { Plus } from 'lucide-react';
import { TransactionTable } from '../components/transactions/TransactionTable';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { Button } from '../components/ui/Button';

export default function TransactionsPage() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold text-text">All Transactions</h1>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={13} /> Add
        </Button>
      </div>
      <TransactionTable />
      <AddTransactionModal isOpen={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
