import { useState } from 'react';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import type { CreatedServiceToken, Scope, ServiceToken } from '../../api/serviceTokens';
import { useCanSave } from '../../hooks/useConnection';
import { useFormReset } from '../../hooks/useFormReset';
import {
  useAppMode,
  useAuthUser,
  useCreateServiceToken,
  useRevokeServiceToken,
  useServiceTokens,
} from '../../hooks/useServer';
import { SavingPausedHint } from '../connection/SavingPausedHint';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';
import RowMenu from '../ui/RowMenu';

const inputClass =
  'w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600';

const SCOPES: { value: Scope; description: string }[] = [
  { value: 'service', description: 'Read and write the budget from another program.' },
  { value: 'ingest', description: 'Upload documents, such as receipts from paperless.' },
];

/**
 * Settings → Server → API tokens. Bearer tokens for machine callers (the paperless
 * webhook, the sidecar), for admins only: a member sees nothing here. Same gating as
 * UsersSection: server mode and an admin role, both read from the auth-status query.
 */
export function ApiTokensSection() {
  const mode = useAppMode();
  const me = useAuthUser();
  const isAdmin = mode === 'server' && me?.role === 'admin';
  const { data: tokens = [], isLoading, isError } = useServiceTokens(isAdmin);
  const revoke = useRevokeServiceToken();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedServiceToken | null>(null);
  const [revoking, setRevoking] = useState<ServiceToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isAdmin) return null;

  async function copyToken() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      // No clipboard (a plain-HTTP page, or permission denied): the token is on screen
      setCopied(false);
    }
  }

  const confirmRevoke = (token: ServiceToken) => {
    setError(null);
    revoke.mutate(token.id, {
      onError: (err) => setError((err as Error).message),
    });
  };

  return (
    <section className="pt-6 border-t border-border-light">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text">API tokens</h2>
          <p className="text-xs text-text-tertiary mt-1">
            Bearer tokens for machine callers, such as the paperless webhook and the sidecar. Each
            token is shown once, stored hashed, and works until it is revoked.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <KeyRound size={13} /> Create token
        </Button>
      </div>

      {created && (
        <div
          role="status"
          className="mt-3 p-4 rounded-lg border border-caution/40 bg-caution-subtle"
        >
          <p className="text-sm font-medium text-text">
            Copy this token now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border bg-surface font-mono text-xs text-text break-all select-all">
              {created.token}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copyToken()}>
              <Copy size={13} /> Copy
            </Button>
            {copied && <span className="text-xs text-positive">Copied</span>}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-xs text-text-tertiary">
              Send it as an <code className="font-mono">Authorization: Bearer …</code> header.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-negative mt-3">{error}</p>}
      {isLoading && <Loader2 size={16} className="animate-spin text-text-tertiary mt-3" />}
      {isError && <p className="text-xs text-negative mt-3">Couldn't load the tokens.</p>}
      {!isLoading && !isError && tokens.length === 0 && (
        <p className="text-xs text-text-tertiary mt-3">No API tokens yet.</p>
      )}

      {tokens.length > 0 && (
        <div className="mt-3 rounded-lg border border-border-light overflow-hidden max-md:overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-alt border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-tertiary">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-tertiary">
                  Scopes
                </th>
                <th className="w-12 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {tokens.map((token) => (
                <tr key={token.id} className="hover:bg-hover transition-colors">
                  <td className="px-4 py-2.5 text-sm text-text">
                    <span
                      className={`font-medium ${token.revokedAt ? 'text-text-tertiary line-through' : ''}`}
                    >
                      {token.name}
                    </span>
                    {token.revokedAt && (
                      <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-surface-alt text-text-secondary">
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1.5">
                      {token.scopes.map((scope) => (
                        <Badge
                          key={scope}
                          variant={scope === 'service' ? 'investment' : 'checking'}
                          label={scope}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="w-12 px-4 py-2.5">
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${token.name}`}
                        items={[
                          {
                            label: 'Revoke',
                            danger: true,
                            onClick: () => setRevoking(token),
                            hidden: token.revokedAt !== null,
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTokenModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreated={(token) => {
          setCopied(false);
          setCreated(token);
        }}
      />
      <ConfirmModal
        isOpen={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && confirmRevoke(revoking)}
        title="Revoke token?"
        message={`${revoking?.name ?? 'This token'} will stop working immediately. Apps using it can't call the API any more.`}
        confirmLabel="Revoke"
        danger
      />
    </section>
  );
}

function CreateTokenModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (token: CreatedServiceToken) => void;
}) {
  const createToken = useCreateServiceToken();
  const canSave = useCanSave();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['service']);
  const [error, setError] = useState<string | null>(null);

  // Filled once per opening: a refetch of the tokens behind the dialog must not wipe typing
  useFormReset(isOpen ? 'create-token' : null, () => {
    setName('');
    setScopes(['service']);
    setError(null);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!scopes.length) return setError('Choose at least one scope.');
    try {
      const token = await createToken.mutateAsync({ name: name.trim(), scopes });
      onClose();
      onCreated(token);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create token" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-token-name" className="block text-sm font-medium text-text mb-1.5">
            Name
          </label>
          <input
            id="new-token-name"
            autoComplete="off"
            spellCheck={false}
            placeholder="paperless-sidecar"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-text-tertiary mt-1">Names the caller in the token list.</p>
        </div>
        <div>
          <span className="block text-sm font-medium text-text mb-1.5">Scopes</span>
          <div className="space-y-2">
            {SCOPES.map((scope) => (
              <label
                key={scope.value}
                className="flex items-start gap-3 p-3 rounded-md border border-border cursor-pointer hover:bg-hover transition-colors"
              >
                <input
                  type="checkbox"
                  aria-label={scope.value}
                  checked={scopes.includes(scope.value)}
                  onChange={(e) =>
                    setScopes((current) =>
                      e.target.checked
                        ? [...current, scope.value]
                        : current.filter((s) => s !== scope.value),
                    )
                  }
                  className="mt-0.5 h-4 w-4 max-md:h-5 max-md:w-5 accent-brand-600"
                />
                <span>
                  <span className="block text-sm text-text">{scope.value}</span>
                  <span className="block text-xs text-text-tertiary">{scope.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
        <SavingPausedHint className="text-right" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || scopes.length === 0 || createToken.isPending || !canSave}
          >
            {createToken.isPending ? 'Creating…' : 'Create token'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
