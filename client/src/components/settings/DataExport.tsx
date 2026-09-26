import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../ui/Button';

const API_BASE = '/api/export';

export function DataExport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function downloadCsv() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    window.location.href = `${API_BASE}/transactions/csv${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-text">Data Export</h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          Download your data for backup or analysis.
        </p>
      </div>

      <div className="bg-surface-alt rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-text">Export Transactions</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Download all transactions as a CSV file. Optionally filter by date range.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-text-tertiary mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-tertiary mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600"
            />
          </div>
          <Button onClick={downloadCsv} size="sm">
            <Download size={14} /> Download CSV
          </Button>
        </div>
      </div>

      <div className="bg-surface-alt rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-text">Full Backup</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Download a complete JSON backup of all your data — accounts, categories, transactions,
            budgets, payees, and rules.
          </p>
        </div>
        <button
          onClick={() => {
            window.location.href = `${API_BASE}/backup`;
          }}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-text-secondary rounded-md hover:opacity-90 transition-colors"
        >
          <Download size={14} /> Download Backup
        </button>
      </div>
    </div>
  );
}
