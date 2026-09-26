import { useState } from 'react';
import { Plus, Trash2, FlaskConical } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useCategories } from '../../hooks/useCategories';
import { usePayees } from '../../hooks/usePayees';
import { testConditions } from '../../api/rules';
import { formatCurrency } from '../../utils/currency';
import { format, parseISO } from 'date-fns';
import type { Rule, RuleCondition, RuleAction } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (conditions: RuleCondition[], actions: RuleAction[]) => void;
  editRule?: Rule;
}

const FIELD_LABELS: Record<RuleCondition['field'], string> = {
  payee_name: 'Payee Name',
  amount: 'Amount',
  notes: 'Notes',
};

const OP_LABELS: Record<RuleCondition['op'], string> = {
  contains: 'contains',
  starts_with: 'starts with',
  ends_with: 'ends with',
  exact: 'is exactly',
  regex: 'matches regex',
};

const ACTION_LABELS: Record<RuleAction['field'], string> = {
  category_id: 'Set Category',
  payee_id: 'Set Payee',
  notes: 'Set Notes',
};

const emptyCondition = (): RuleCondition => ({ field: 'payee_name', op: 'contains', value: '' });
const emptyAction = (): RuleAction => ({ field: 'category_id', value: '' });

export function AddRuleModal({ isOpen, onClose, onSave, editRule }: Props) {
  const [conditions, setConditions] = useState<RuleCondition[]>(
    editRule?.conditions.length ? editRule.conditions : [emptyCondition()],
  );
  const [actions, setActions] = useState<RuleAction[]>(
    editRule?.actions.length ? editRule.actions : [emptyAction()],
  );
  const [testResults, setTestResults] = useState<Array<{
    id: string;
    date: string;
    payeeName: string | null;
    amount: number;
  }> | null>(null);
  const [testCount, setTestCount] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: groups = [] } = useCategories();
  const { data: payees = [] } = usePayees();

  const expenseCategories = (groups as any[])
    .filter((g: any) => g.isIncome === 0)
    .flatMap((g: any) => g.categories.map((c: any) => ({ ...c, groupName: g.name })));
  const allCategories = (groups as any[]).flatMap((g: any) =>
    g.categories.map((c: any) => ({ ...c, groupName: g.name })),
  );

  function updateCondition(i: number, patch: Partial<RuleCondition>) {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setTestResults(null);
  }

  function updateAction(i: number, patch: Partial<RuleAction>) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function handleTest() {
    if (conditions.some((c) => !c.value.trim())) return;
    setTesting(true);
    try {
      const results = await testConditions(conditions);
      setTestResults(results.slice(0, 5));
      setTestCount(results.length);
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    if (!conditions.every((c) => c.value.trim()) || !actions.every((a) => a.value.trim())) return;
    onSave(conditions, actions);
    onClose();
  }

  function handleClose() {
    setConditions(editRule?.conditions.length ? editRule.conditions : [emptyCondition()]);
    setActions(editRule?.actions.length ? editRule.actions : [emptyAction()]);
    setTestResults(null);
    setTestCount(null);
    onClose();
  }

  const canSave = conditions.every((c) => c.value.trim()) && actions.every((a) => a.value.trim());
  const canTest = conditions.every((c) => c.value.trim()) && conditions.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editRule ? 'Edit Rule' : 'Add Rule'}
      size="lg"
    >
      <div className="space-y-5">
        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-text-secondary">
              Conditions{' '}
              <span className="text-xs text-text-tertiary font-normal">(all must match)</span>
            </p>
          </div>
          <div className="space-y-2">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={c.field}
                  onChange={(e) =>
                    updateCondition(i, {
                      field: e.target.value as RuleCondition['field'],
                      value: '',
                    })
                  }
                  className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {(Object.entries(FIELD_LABELS) as [RuleCondition['field'], string][]).map(
                    ([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ),
                  )}
                </select>
                <select
                  value={c.op}
                  onChange={(e) =>
                    updateCondition(i, { op: e.target.value as RuleCondition['op'] })
                  }
                  className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {(Object.entries(OP_LABELS) as [RuleCondition['op'], string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder={c.field === 'amount' ? 'e.g. 5000 (cents)' : 'value…'}
                  className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                {conditions.length > 1 && (
                  <button
                    onClick={() => {
                      setConditions((prev) => prev.filter((_, idx) => idx !== i));
                      setTestResults(null);
                    }}
                    className="p-1 text-text-tertiary hover:text-negative transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
            className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <Plus size={12} /> Add Condition
          </button>
        </div>

        {/* Actions */}
        <div>
          <p className="text-sm font-medium text-text-secondary mb-2">Actions</p>
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={a.field}
                  onChange={(e) =>
                    updateAction(i, { field: e.target.value as RuleAction['field'], value: '' })
                  }
                  className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {(Object.entries(ACTION_LABELS) as [RuleAction['field'], string][]).map(
                    ([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ),
                  )}
                </select>
                {a.field === 'category_id' ? (
                  <select
                    value={a.value}
                    onChange={(e) => updateAction(i, { value: e.target.value })}
                    className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="">Select category…</option>
                    {allCategories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.groupName} → {c.icon ? `${c.icon} ` : ''}
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : a.field === 'payee_id' ? (
                  <select
                    value={a.value}
                    onChange={(e) => updateAction(i, { value: e.target.value })}
                    className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="">Select payee…</option>
                    {payees.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={a.value}
                    onChange={(e) => updateAction(i, { value: e.target.value })}
                    placeholder="Notes text…"
                    className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                )}
                {actions.length > 1 && (
                  <button
                    onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-1 text-text-tertiary hover:text-negative transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setActions((prev) => [...prev, emptyAction()])}
            className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <Plus size={12} /> Add Action
          </button>
        </div>

        {/* Test Rule */}
        <div>
          <button
            onClick={handleTest}
            disabled={!canTest || testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded-lg hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FlaskConical size={13} />
            {testing ? 'Testing…' : 'Test Rule'}
          </button>

          {testResults !== null && (
            <div className="mt-2 rounded-lg border border-border-light overflow-hidden">
              <div className="px-3 py-2 bg-surface-alt border-b border-border-light">
                <p className="text-xs text-text-secondary font-medium">
                  {testCount === 0
                    ? 'No matching transactions'
                    : `Matches ${testCount} transaction${testCount === 1 ? '' : 's'}`}
                  {testCount !== null && testCount > 5 ? ` — showing 5` : ''}
                </p>
              </div>
              {testResults.length > 0 && (
                <div className="divide-y divide-border-light">
                  {testResults.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-tertiary">
                          {format(parseISO(tx.date), 'MMM d')}
                        </span>
                        <span className="text-xs text-text-secondary">{tx.payeeName ?? '—'}</span>
                      </div>
                      <span className="text-xs font-medium text-text">
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-1 border-t border-border-light">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {editRule ? 'Save Changes' : 'Save Rule'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
