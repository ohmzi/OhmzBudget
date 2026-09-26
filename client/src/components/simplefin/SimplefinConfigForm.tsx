import { useState } from 'react';
import { Link2, ExternalLink, Loader2 } from 'lucide-react';
import { useSetupSimplefin } from '../../hooks/useSimplefin';
import { Button } from '../ui/Button';
import type { SimplefinSetupResult } from '../../types';

interface Props {
  onSetupComplete: (result: SimplefinSetupResult) => void;
}

export function SimplefinConfigForm({ onSetupComplete }: Props) {
  const [token, setToken] = useState('');
  const setup = useSetupSimplefin();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    try {
      const result = await setup.mutateAsync(token.trim());
      setToken('');
      onSetupComplete(result);
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-brand-50 border border-brand-100 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <Link2 size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Set Up Bank Sync</h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              Connect your bank accounts to automatically import transactions using SimpleFIN
              Bridge. The service costs $1.50/month paid directly to SimpleFIN.
            </p>
            <a
              href="https://beta-bridge.simplefin.org/simplefin/create"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium mt-2"
            >
              Get a SimpleFIN token <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-alt rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-tertiary mb-1">Setup Token</label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your SimpleFIN setup token"
            className="w-full text-sm border border-border rounded-md px-3 py-2 bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600 font-mono"
          />
        </div>
        <Button type="submit" disabled={!token.trim() || setup.isPending}>
          {setup.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Connecting...
            </>
          ) : (
            'Connect'
          )}
        </Button>
        {setup.isError && (
          <p className="text-xs text-negative">
            Failed to connect. Check your setup token and try again.
          </p>
        )}
      </form>
    </div>
  );
}
