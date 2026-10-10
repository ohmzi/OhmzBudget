import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import type { Role, User } from '../../api/users';
import { useCanSave } from '../../hooks/useConnection';
import { useFormReset } from '../../hooks/useFormReset';
import {
  useAppMode,
  useAuthUser,
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useSetUserRole,
  useUsers,
} from '../../hooks/useServer';
import { MIN_PASSWORD_LENGTH } from '../auth/passwordRules';
import { SavingPausedHint } from '../connection/SavingPausedHint';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';
import RowMenu from '../ui/RowMenu';

const inputClass =
  'w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600';

/**
 * Server error tokens (routes/users.ts) as sentences: the raw token would mean nothing on
 * screen. Anything else (a validation message, a network failure) already reads fine.
 */
function userErrorMessage(err: unknown): string {
  switch ((err as Error).message) {
    case 'username_taken':
      return 'That username is taken.';
    case 'last_admin':
      return "The last admin can't be removed or demoted.";
    case 'self':
      return "You can't remove your own account.";
    default:
      return (err as Error).message;
  }
}

/**
 * Settings → Server → Users. The accounts that can sign in to this server, for admins
 * only: a member sees nothing here. The role comes from the auth-status query (the same
 * one useAppMode reads), and both the role and server-mode checks switch the whole
 * section off, so nothing is even loaded for a member.
 */
export function UsersSection() {
  const mode = useAppMode();
  const me = useAuthUser();
  const isAdmin = mode === 'server' && me?.role === 'admin';
  const { data: users = [], isLoading, isError } = useUsers(isAdmin);
  const setRole = useSetUserRole();
  const removeUser = useDeleteUser();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isAdmin) return null;

  /** Admins become members and members become admins; the server refuses the last admin. */
  const toggleRole = (user: User) => {
    const role: Role = user.role === 'admin' ? 'member' : 'admin';
    setMessage(null);
    setRole.mutate(
      { id: user.id, role },
      {
        onSuccess: () =>
          setMessage({
            ok: true,
            text: `${user.username} is now ${role === 'admin' ? 'an admin' : 'a member'}.`,
          }),
        onError: (err) => setMessage({ ok: false, text: userErrorMessage(err) }),
      },
    );
  };

  const confirmRemove = (user: User) => {
    setMessage(null);
    removeUser.mutate(user.id, {
      onSuccess: () => setMessage({ ok: true, text: `${user.username} was removed.` }),
      onError: (err) => setMessage({ ok: false, text: userErrorMessage(err) }),
    });
  };

  return (
    <section className="pt-6 border-t border-border-light">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text">Users</h2>
          <p className="text-xs text-text-tertiary mt-1">
            Everyone who can sign in to this server. Admins can manage accounts, API tokens and
            server settings; members use the budget.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus size={13} /> Add user
        </Button>
      </div>

      {message && (
        <p className={`text-xs mt-3 ${message.ok ? 'text-positive' : 'text-negative'}`}>
          {message.text}
        </p>
      )}
      {isLoading && <Loader2 size={16} className="animate-spin text-text-tertiary mt-3" />}
      {isError && <p className="text-xs text-negative mt-3">Couldn't load the users.</p>}

      <div className="mt-3 rounded-lg border border-border-light overflow-hidden max-md:overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-alt border-b border-border">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-tertiary">
                Username
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-tertiary">Role</th>
              <th className="w-12 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-hover transition-colors">
                <td className="px-4 py-2.5 text-sm text-text">
                  <span className="font-medium">{user.username}</span>
                  {user.id === me?.id && (
                    <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">
                      You
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={user.role === 'admin' ? 'positive' : 'cash'} label={user.role} />
                </td>
                <td className="w-12 px-4 py-2.5">
                  <div className="flex justify-end">
                    <RowMenu
                      label={`Actions for ${user.username}`}
                      items={[
                        { label: 'Reset password', onClick: () => setResetting(user) },
                        {
                          label: user.role === 'admin' ? 'Make member' : 'Make admin',
                          onClick: () => toggleRole(user),
                        },
                        { label: 'Remove user', danger: true, onClick: () => setRemoving(user) },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddUserModal
        isOpen={adding}
        onClose={() => setAdding(false)}
        onAdded={(username) => setMessage({ ok: true, text: `${username} can now sign in.` })}
      />
      <ResetPasswordModal
        user={resetting}
        onClose={() => setResetting(null)}
        onReset={(username) =>
          setMessage({ ok: true, text: `Password reset. ${username} was signed out everywhere.` })
        }
      />
      <ConfirmModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && confirmRemove(removing)}
        title="Remove user?"
        message={`${removing?.username ?? 'This account'} will be removed and signed out everywhere. This can't be undone.`}
        confirmLabel="Remove user"
        danger
      />
    </section>
  );
}

function AddUserModal({
  isOpen,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (username: string) => void;
}) {
  const createUser = useCreateUser();
  const canSave = useCanSave();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);

  // Filled once per opening: a refetch of the users behind the dialog must not wipe typing
  useFormReset(isOpen ? 'add-user' : null, () => {
    setUsername('');
    setPassword('');
    setRole('member');
    setError(null);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    try {
      await createUser.mutateAsync({ username: username.trim(), password, role });
      onClose();
      onAdded(username.trim());
    } catch (err) {
      setError(userErrorMessage(err));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add user" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-user-username" className="block text-sm font-medium text-text mb-1.5">
            Username
          </label>
          <input
            id="new-user-username"
            autoComplete="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-text-tertiary mt-1">
            Letters, digits, dots, dashes and underscores.
          </p>
        </div>
        <div>
          <label htmlFor="new-user-password" className="block text-sm font-medium text-text mb-1.5">
            Password
          </label>
          <input
            id="new-user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-user-role" className="block text-sm font-medium text-text mb-1.5">
            Role
          </label>
          <select
            id="new-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={inputClass}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <p className="text-xs text-text-tertiary mt-1">
            Admins can manage accounts, API tokens and server settings.
          </p>
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
        <SavingPausedHint className="text-right" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              !username.trim() ||
              password.length < MIN_PASSWORD_LENGTH ||
              createUser.isPending ||
              !canSave
            }
          >
            {createUser.isPending ? 'Adding…' : 'Add user'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: {
  user: User | null;
  onClose: () => void;
  onReset: (username: string) => void;
}) {
  const resetPassword = useResetUserPassword();
  const canSave = useCanSave();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFormReset(user?.id ?? null, () => {
    setPassword('');
    setConfirm('');
    setError(null);
  });

  if (!user) return null;
  // Captured after the check so the closures below see it as non-null
  const target = user;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (password !== confirm) return setError("The passwords don't match.");
    try {
      await resetPassword.mutateAsync({ id: target.id, password });
      onClose();
      onReset(target.username);
    } catch (err) {
      setError(userErrorMessage(err));
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Reset password for ${user.username}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-text-tertiary">
          Sets a new password and signs this account out everywhere.
        </p>
        <div>
          <label
            htmlFor="reset-user-password"
            className="block text-sm font-medium text-text mb-1.5"
          >
            New password
          </label>
          <input
            id="reset-user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="reset-user-confirm"
            className="block text-sm font-medium text-text mb-1.5"
          >
            Confirm new password
          </label>
          <input
            id="reset-user-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
        <SavingPausedHint className="text-right" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={resetPassword.isPending || !canSave}>
            {resetPassword.isPending ? 'Saving…' : 'Reset password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
