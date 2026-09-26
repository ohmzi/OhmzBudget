import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { CurrencyInput } from '../ui/CurrencyInput';
import { useCreateAccount } from '../../hooks/useAccounts';
import { ACCOUNT_TYPES, type AccountType } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AddAccountModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [startingBalance, setStartingBalance] = useState(0);
  const createAccount = useCreateAccount();

  function handleClose() {
    setName('');
    setType('checking');
    setStartingBalance(0);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createAccount.mutateAsync({ name: name.trim(), type, startingBalance });
    handleClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Account" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Account Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chase Checking"
            autoFocus
            className="block w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text placeholder-text-tertiary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Account Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="block w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Current Balance
          </label>
          <CurrencyInput value={startingBalance} onChange={setStartingBalance} placeholder="0.00" />
          <p className="mt-1 text-xs text-text-secondary">Enter your balance as of today.</p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createAccount.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createAccount.isPending ? 'Adding…' : 'Add Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
