import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth';
import * as serverApi from '../api/server';
import * as serviceTokensApi from '../api/serviceTokens';
import * as usersApi from '../api/users';
import type { Scope } from '../api/serviceTokens';
import type { Role } from '../api/users';
import { clearOutbox } from '../offline/outbox';
import { clearOfflineCopy } from '../offline/snapshot';

/** Login status (server mode). Shared with AuthGate, which fetched it on startup. */
const useAuthStatus = () =>
  useQuery({ queryKey: ['auth-status'], queryFn: authApi.getAuthStatus, staleTime: Infinity });

/**
 * The signed-in account (server mode), from the auth-status query. Null in the desktop
 * app and dev, and while signed out: server-mode settings read their role from here.
 */
export const useAuthUser = () => useAuthStatus().data?.user ?? null;

export const useServerInfo = () =>
  useQuery({ queryKey: ['server-info'], queryFn: serverApi.getServerInfo, staleTime: 5 * 60_000 });

export type AppMode = 'desktop' | 'server' | 'dev';

/**
 * How OhmzBudget runs, as far as this page can tell: the desktop app (its preload sets
 * __API_BASE__), a self-hosted server (login enabled), or a local dev server. Before the
 * server has answered, a production web build is assumed to be a self-hosted server.
 */
export function appModeFrom(auth: authApi.AuthStatus | undefined): AppMode {
  if (window.__API_BASE__) return 'desktop';
  if (auth) return auth.enabled ? 'server' : 'dev';
  return import.meta.env.DEV ? 'dev' : 'server';
}

export const useAppMode = () => appModeFrom(useAuthStatus().data);

/** Signs this browser out (server mode) and shows the login screen. */
export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    await authApi.logout().catch(() => {});
    // Nothing of this budget stays on the device after signing out
    await Promise.all([clearOfflineCopy(), clearOutbox()]);
    // Drop the signed-in data, then re-check the status so the login screen shows. Not
    // qc.clear(): it detaches the auth-status query the app is watching, so nothing changed.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth-status' });
    await qc.invalidateQueries({ queryKey: ['auth-status'] });
  };
}

export const useSessions = (enabled: boolean) =>
  useQuery({ queryKey: ['auth-sessions'], queryFn: serverApi.getSessions, enabled });

export function useSignOutSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: serverApi.signOutSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  });
}

export function useSignOutOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: serverApi.signOutOtherSessions,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  });
}

// Accounts and API tokens (Settings → Server). Both are admin-only on the server, so the
// query is disabled (and never sent) for members; the sections also hide themselves.

export const useUsers = (enabled: boolean) =>
  useQuery({ queryKey: ['users'], queryFn: usersApi.getUsers, enabled });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      username,
      password,
      role,
    }: {
      username: string;
      password: string;
      role: Role;
    }) => usersApi.createUser(username, password, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => usersApi.setUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      usersApi.resetUserPassword(id, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export const useServiceTokens = (enabled: boolean) =>
  useQuery({ queryKey: ['service-tokens'], queryFn: serviceTokensApi.getServiceTokens, enabled });

export function useCreateServiceToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, scopes }: { name: string; scopes: Scope[] }) =>
      serviceTokensApi.createServiceToken(name, scopes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-tokens'] }),
  });
}

export function useRevokeServiceToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: serviceTokensApi.revokeServiceToken,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-tokens'] }),
  });
}
