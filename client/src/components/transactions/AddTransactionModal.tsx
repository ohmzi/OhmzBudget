import { useState, useRef, useEffect, useMemo } from 'react';
import { format, isValid as isValidDate, parseISO } from 'date-fns';
import { MinusCircle, PlusCircle, ChevronDown, CreditCard, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { formatCurrency } from '../../utils/currency';
import { useAccounts } from '../../hooks/useAccounts';
import { usePayees } from '../../hooks/usePayees';
import { useCreatePayee } from '../../hooks/usePayees';
import { useCategories } from '../../hooks/useCategories';
import { useCreateTransaction } from '../../hooks/useTransactions';
import { CategoryPicker } from './CategoryPicker';
import { payeeColor, ACCOUNT_TYPE_COLORS } from '../../utils/transactionColors';
import type { CategoryGroup } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  'block w-full rounded-md border border-border px-3 py-2 text-sm text-text bg-surface placeholder-text-disabled focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

const selectClass =
  'block w-full rounded-md border border-border px-3 py-2 text-sm bg-surface focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 appearance-none cursor-pointer';

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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [notes, setNotes] = useState('');

  const payeeRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: payees = [] } = usePayees();
  const { data: groups = [] } = useCategories();
  const createTransaction = useCreateTransaction();
  const createPayee = useCreatePayee();

  const openAccounts = accounts.filter((a) => !a.closedAt);
  const onBudgetAccounts = openAccounts.filter((a) => !a.isOffBudget);
  const offBudgetAccounts = openAccounts.filter((a) => a.isOffBudget);
  const selectedAccount = openAccounts.find((a) => a.id === accountId);

  const sortedPayees = useMemo(
    () => [...payees].sort((a, b) => b.transactionCount - a.transactionCount),
    [payees],
  );

  const filteredPayees = payeeQuery
    ? sortedPayees
        .filter((p) => p.name.toLowerCase().includes(payeeQuery.toLowerCase()))
        .slice(0, 8)
    : sortedPayees.slice(0, 8);

  const exactMatch = payees.find(
    (p) => p.name.toLowerCase() === payeeQuery.trim().toLowerCase(),
  );

  const categoryEntry = useMemo(() => {
    if (!categoryId) return null;
    for (const g of groups as CategoryGroup[]) {
      const cat = g.categories.find((c) => c.id === categoryId);
      if (cat) return { name: cat.name, icon: cat.icon };
    }
    return null;
  }, [categoryId, groups]);

  const hasConfirmedMerchant = payeeId !== null;
  const dateValid = date !== '' && /^\d{4}-\d{2}-\d{2}$/.test(date) && isValidDate(parseISO(date));
  const isValid = amount > 0 && hasConfirmedMerchant && dateValid && accountId !== '';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (payeeRef.current && !payeeRef.current.contains(e.target as Node)) {
        setShowPayeeList(false);
        if (!payeeId) {
          setPayeeQuery('');
          setPayeeName('');
        }
      }
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setShowAccountPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [payeeId]);

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
      setShowAccountPicker(false);
      setCategoryId(null);
      setShowCategoryPicker(false);
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
        payeeName,
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
                setPayeeName('');
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
                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-hover cursor-pointer"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate flex-1">{p.name}</span>
                      <span className="flex items-center gap-1 text-xs text-text-tertiary shrink-0">
                        <CreditCard size={11} />
                        {p.transactionCount}
                      </span>
                    </button>
                  );
                })}
                {payeeQuery.trim() && !exactMatch && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const name = payeeQuery.trim();
                      createPayee.mutate(
                        { name },
                        {
                          onSuccess: (created) => {
                            setPayeeName(created.name);
                            setPayeeId(created.id);
                            setPayeeQuery(created.name);
                            setShowPayeeList(false);
                          },
                        },
                      );
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-brand-600 font-medium flex items-center gap-1.5 hover:bg-surface-alt cursor-pointer border-t border-border-light"
                  >
                    <Plus size={14} />
                    Create new merchant: &ldquo;{payeeQuery.trim()}&rdquo;
                  </button>
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
          <div ref={accountRef} className="relative">
            <button
              type="button"
              onClick={() => setShowAccountPicker(!showAccountPicker)}
              className={`${inputClass} text-left flex items-center justify-between cursor-pointer`}
            >
              <span className="flex items-center gap-2 truncate">
                {selectedAccount ? (
                  <>
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: ACCOUNT_TYPE_COLORS[selectedAccount.type] || '#6B7280' }}
                    >
                      {selectedAccount.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text">{selectedAccount.name}</span>
                  </>
                ) : (
                  <span className="text-text-disabled">Select account...</span>
                )}
              </span>
              <ChevronDown size={14} className="text-text-tertiary shrink-0" />
            </button>
            {showAccountPicker && (
              <div
                className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {onBudgetAccounts.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary bg-surface-alt">
                      On Budget
                    </div>
                    {onBudgetAccounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAccountId(a.id);
                          setShowAccountPicker(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-hover cursor-pointer ${
                          accountId === a.id ? 'bg-brand-50 text-brand-700' : 'text-text'
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: ACCOUNT_TYPE_COLORS[a.type] || '#6B7280' }}
                        >
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate flex-1">{a.name}</span>
                        <span className={`text-xs tabular-nums shrink-0 ${a.balance >= 0 ? 'text-text-tertiary' : 'text-negative'}`}>
                          {formatCurrency(a.balance)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {offBudgetAccounts.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary bg-surface-alt">
                      Off Budget
                    </div>
                    {offBudgetAccounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAccountId(a.id);
                          setShowAccountPicker(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-hover cursor-pointer ${
                          accountId === a.id ? 'bg-brand-50 text-brand-700' : 'text-text'
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: ACCOUNT_TYPE_COLORS[a.type] || '#6B7280' }}
                        >
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate flex-1">{a.name}</span>
                        <span className={`text-xs tabular-nums shrink-0 ${a.balance >= 0 ? 'text-text-tertiary' : 'text-negative'}`}>
                          {formatCurrency(a.balance)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">Category</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              className={`${inputClass} text-left flex items-center justify-between cursor-pointer`}
            >
              <span className="flex items-center gap-2 truncate">
                {categoryEntry ? (
                  <>
                    {categoryEntry.icon && <span className="text-base">{categoryEntry.icon}</span>}
                    <span className="text-text">{categoryEntry.name}</span>
                  </>
                ) : (
                  <span className="text-text-disabled">Search categories...</span>
                )}
              </span>
              <ChevronDown size={14} className="text-text-tertiary shrink-0" />
            </button>
            {showCategoryPicker && (
              <CategoryPicker
                value={categoryId}
                onChange={(id) => {
                  setCategoryId(id);
                  setShowCategoryPicker(false);
                }}
                groups={groups as CategoryGroup[]}
                onClose={() => setShowCategoryPicker(false)}
                position="above"
              />
            )}
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
