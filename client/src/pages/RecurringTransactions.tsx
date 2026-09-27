import { useState } from 'react';
import { Plus } from 'lucide-react';
import MonthlyTab from '../components/recurring/MonthlyTab';
import AllTab from '../components/recurring/AllTab';
import RecurringFormModal from '../components/recurring/RecurringFormModal';
import MatchSuggestionsPanel from '../components/recurring/MatchSuggestionsPanel';
import OccurrenceMatchModal from '../components/recurring/OccurrenceMatchModal';
import { Button } from '../components/ui/Button';
import {
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useScheduleOccurrences,
} from '../hooks/useSchedules';
import type { Schedule, ScheduleOccurrence } from '../types';
import { format, subDays, addDays } from 'date-fns';

const tabs = [
  { id: 'monthly' as const, label: 'Monthly' },
  { id: 'all' as const, label: 'All recurring' },
];

type TabId = (typeof tabs)[number]['id'];

export default function RecurringTransactionsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('monthly');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Schedule | null>(null);
  const [matchOccurrenceId, setMatchOccurrenceId] = useState<string | null>(null);

  const { data: allRecurring = [] } = useSchedules();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();

  const matchFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const matchTo = format(addDays(new Date(), 90), 'yyyy-MM-dd');
  const { data: allOccurrences = [] } = useScheduleOccurrences(matchFrom, matchTo);
  const matchOccurrence = matchOccurrenceId
    ? (allOccurrences.find((o) => o.id === matchOccurrenceId) ?? null)
    : null;

  function handleEdit(item: Schedule) {
    setEditItem(item);
    setFormOpen(true);
  }

  function handleSave(data: any) {
    if (editItem) {
      updateSchedule.mutate(
        { id: editItem.id, ...data },
        {
          onSuccess: () => {
            setFormOpen(false);
            setEditItem(null);
          },
        },
      );
    } else {
      createSchedule.mutate(data, {
        onSuccess: () => {
          setFormOpen(false);
        },
      });
    }
  }

  function handleClose() {
    setFormOpen(false);
    setEditItem(null);
  }

  function handleAdd() {
    setEditItem(null);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-6 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold text-text py-4">Recurring</h1>
          <div className="flex gap-1 self-stretch">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 text-sm font-medium transition-colors border-b-2 -mb-px cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus size={13} /> Add recurring
        </Button>
      </div>

      <MatchSuggestionsPanel />

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'monthly' && (
          <MonthlyTab
            onEdit={handleEdit}
            onAdd={handleAdd}
            allRecurring={allRecurring}
            onMatchOccurrence={setMatchOccurrenceId}
          />
        )}
        {activeTab === 'all' && <AllTab allRecurring={allRecurring} onEdit={handleEdit} />}
      </div>

      <RecurringFormModal
        isOpen={formOpen}
        onClose={handleClose}
        onSave={handleSave}
        editItem={editItem}
      />

      <OccurrenceMatchModal
        isOpen={matchOccurrenceId !== null}
        onClose={() => setMatchOccurrenceId(null)}
        occurrence={matchOccurrence}
      />
    </div>
  );
}
