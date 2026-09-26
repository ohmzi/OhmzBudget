import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { MinusCircle, PlusCircle, ChevronDown } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { useAccounts } from '../../hooks/useAccounts';
import { usePayees } from '../../hooks/usePayees';
import { useCategories } from '../../hooks/useCategories';
import { useCreateTransaction } from '../../hooks/useTransactions';
import { payeeColor } from '../../utils/transactionColors';
import type { CategoryGroup } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  'block w-full rounded-md border border-border px-3 py-2 text-sm text-text bg-surface placeholder-text-disabled focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

const selectClass =
  'block w-full rounded-md border border-border px-3 py-2 text-sm text-text bg-surface focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 appearance-none cursor-pointer';

export function AddTransactionModal({ isOpen, onClose }: Props) {
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState(0);
  const [payeeName, setPayeeName] = useState('');
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeQuery, setPayeeQuery] = useState('');
  const [showPayeeList, setShowPayeeList] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const payeeRef = useRef<HTMLDivElement>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: payees = [] } = usePayees();
  const { data: groups = [] } = useCategories();
  const createTransaction = useCreateTransaction();

  const openAccounts = accounts.filter((a) => !a.closedAt);

  const filteredPayees = payeeQuery
    ? payees
        .filter((p) => p.name.toLowerCase().includes(payeeQuery.toLowerCase()))
        .slice(0, 8)
    : payees.slice(0, 8);

  const isValid = amount > 0 && payeeName.trim() !== '' && date !== '' && accountId !== '';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (payeeRef.current && !payeeRef.current.contains(e.target as Node)) {
        setShowPayeeList(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setType('debit');
      setAmount(0);
      setPayeeName('');
      setPayeeId(null);
      setPayeeQuery('');
      setShowPayeeList(false);
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setAccountId('');
      setCategoryId(null);
      setNotes('');
    }
  }, [isOpen]);

  function handleSubmit() {
    if (!isValid) return;
    const finalAmount = type === 'debit' ? -amount : amount;
    createTransaction.mutate(
      {
        accountId,
        date,
        amount: finalAmount,
        payeeId,
        payeeName: payeeName || null,
        categoryId,
        notes: notes || null,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add transaction" size="md">
      <div className="space-y-5">
        {/* Debit / Credit toggle */}
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1">
          <button
            type="button"
            onClick={() => setType('debit')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${
              type === 'debit'
                ? 'bg-surface text-text shadow-xs ring-1 ring-brand-400'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <MinusCircle size={15} />
            Debit
          </button>
          <button
            type="button"
            onClick={() => setType('credit')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${
              type === 'credit'
                ? 'bg-surface text-text shadow-xs ring-1 ring-brand-400'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <PlusCircle size={15} />
            Credit
          </button>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Amount *</label>
          <CurrencyInput value={amount} onChange={setAmount} placeholder="$0.00" />
        </div>

        {/* Merchant */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Merchant *</label>
          <div ref={payeeRef} className="relative">
            <input
              type="text"
              value={payeeQuery}
              onChange={(e) => {
                const name = e.target.value;
                setPayeeQuery(name);
                setPayeeName(name);
                setPayeeId(null);
                setShowPayeeList(true);
              }}
              onFocus={() => setShowPayeeList(true)}
              placeholder="Search merchants..."
              className={inputClass}
            />
            {showPayeeList && (filteredPayees.length > 0 || payeeQuery) && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                {filteredPayees.map((p) => {
                  const color = payeeColor(p.name);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setPayeeName(p.name);
                        setPayeeId(p.id);
                        setPayeeQuery(p.name);
                        setShowPayeeList(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-hover"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
                {payeeQuery &&
                  !payees.find(
                    (p) => p.name.toLowerCase() === payeeQuery.toLowerCase(),
                  ) && (
                    <div className="px-3 py-2 text-xs text-text-tertiary border-t border-border-light">
                      New merchant: &ldquo;{payeeQuery}&rdquo;
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Date *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Account */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Account *</label>
          <div className="relative">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={`${selectClass} ${accountId === '' ? 'text-text-disabled' : ''}`}
            >
              <option value="">Select account...</option>
              {openAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Category</label>
          <div className="relative">
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className={`${selectClass} ${categoryId === null ? 'text-text-disabled' : ''}`}
            >
              <option value="">Uncategorized</option>
              {(groups as CategoryGroup[]).map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ''}
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note..."
            className={inputClass}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            onClick={handleSubmit}
            disabled={!isValid || createTransaction.isPending}
          >
            {createTransaction.isPending ? 'Adding...' : 'Add transaction'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
