import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal } from '../hooks/useGoals';
import { GoalFormModal } from '../components/goals/GoalFormModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/currency';
import { usePreferencesStore } from '../store/preferencesStore';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Goal } from '../types';

function GoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  onEdit: (g: Goal) => void;
  onDelete: (id: string) => void;
}) {
  const showCategoryIcons = usePreferencesStore((s) => s.showCategoryIcons);
  const pct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
      : 0;
  const remaining = goal.targetAmount - goal.currentAmount;
  const isComplete = goal.currentAmount >= goal.targetAmount;

  let dateLabel: string | null = null;
  if (goal.targetDate) {
    const days = differenceInDays(parseISO(goal.targetDate), new Date());
    if (days < 0) dateLabel = 'Past due';
    else if (days === 0) dateLabel = 'Due today';
    else if (days <= 30) dateLabel = `${days} day${days !== 1 ? 's' : ''} left`;
    else dateLabel = format(parseISO(goal.targetDate), 'MMM d, yyyy');
  }

  return (
    <div className="bg-surface rounded-lg border border-border-light shadow-card hover:shadow-hover transition-shadow group">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {showCategoryIcons && <span className="text-2xl leading-none">{goal.icon}</span>}
            <div>
              <h3 className="text-sm font-semibold text-text">{goal.name}</h3>
              {dateLabel && (
                <p
                  className={`text-xs mt-0.5 ${goal.targetDate && differenceInDays(parseISO(goal.targetDate), new Date()) < 0 ? 'text-negative' : 'text-text-tertiary'}`}
                >
                  {dateLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(goal)}
              className="p-1 text-text-tertiary hover:text-brand-600 rounded transition-colors"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(goal.id)}
              className="p-1 text-text-tertiary hover:text-negative rounded transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-lg font-semibold text-text tabular-nums">
              {formatCurrency(goal.currentAmount)}
            </span>
            <span className="text-sm text-text-tertiary tabular-nums">
              of {formatCurrency(goal.targetAmount)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: isComplete ? '#059669' : goal.color,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-medium ${isComplete ? 'text-positive' : 'text-text-secondary'}`}
          >
            {isComplete ? 'Goal reached!' : `${formatCurrency(remaining)} to go`}
          </span>
          <span
            className={`text-xs font-semibold tabular-nums ${isComplete ? 'text-positive' : 'text-text-tertiary'}`}
          >
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [addOpen, setAddOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0);
  const overallPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text">Goals</h1>
            {goals.length > 0 && (
              <p className="text-xs text-text-tertiary mt-0.5">
                {formatCurrency(totalCurrent)} saved of {formatCurrency(totalTarget)} total (
                {overallPct}%)
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={13} /> Add Goal
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">
            Loading...
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="text-4xl">🎯</span>
            <p className="text-sm text-text-secondary">
              No goals yet. Set a savings target to get started.
            </p>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-md hover:bg-brand-50 transition-colors"
            >
              <Plus size={13} /> Add your first goal
            </button>
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onEdit={(g) => setEditGoal(g)}
                  onDelete={(id) => setDeleteId(id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <GoalFormModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(data) => createGoal.mutate(data)}
      />

      {editGoal && (
        <GoalFormModal
          isOpen={!!editGoal}
          onClose={() => setEditGoal(null)}
          onSave={(data) => updateGoal.mutate({ id: editGoal.id, data })}
          editGoal={editGoal}
        />
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteGoal.mutate(deleteId);
        }}
        title="Delete Goal"
        message="Delete this goal? This cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
