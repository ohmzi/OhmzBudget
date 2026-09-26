import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as rulesApi from '../api/rules';
import { useUndoStore } from '../store/undoStore';
import type { Rule, RuleCondition, RuleAction } from '../types';

const QK = ['rules'];

export function useRules() {
  return useQuery({ queryKey: QK, queryFn: rulesApi.getRules });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      conditions: RuleCondition[];
      actions: RuleAction[];
      sortOrder?: number;
    }) => rulesApi.createRule(data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: QK });
      useUndoStore.getState().push({
        description: `Create rule`,
        undo: async () => {
          await rulesApi.deleteRule(created.id);
          qc.invalidateQueries({ queryKey: QK });
        },
        redo: async () => {
          await rulesApi.createRule({
            conditions: created.conditions,
            actions: created.actions,
            sortOrder: created.sortOrder,
          });
          qc.invalidateQueries({ queryKey: QK });
        },
      });
    },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      conditions?: RuleCondition[];
      actions?: RuleAction[];
    }) => rulesApi.updateRule(id, data),
    onMutate: async ({ id }) => {
      const rules = qc.getQueryData<Rule[]>(QK);
      return { old: rules?.find((r) => r.id === id) };
    },
    onSuccess: (_, { id, ...data }, ctx) => {
      qc.invalidateQueries({ queryKey: QK });
      if (!ctx?.old) return;
      const snapshot = ctx.old;
      useUndoStore.getState().push({
        description: `Edit rule`,
        undo: async () => {
          await rulesApi.updateRule(id, {
            conditions: snapshot.conditions,
            actions: snapshot.actions,
          });
          qc.invalidateQueries({ queryKey: QK });
        },
        redo: async () => {
          await rulesApi.updateRule(id, data);
          qc.invalidateQueries({ queryKey: QK });
        },
      });
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const rules = qc.getQueryData<Rule[]>(QK);
      const snapshot = rules?.find((r) => r.id === id);
      return rulesApi.deleteRule(id).then(() => snapshot);
    },
    onSuccess: (snapshot) => {
      qc.invalidateQueries({ queryKey: QK });
      if (!snapshot) return;
      useUndoStore.getState().push({
        description: `Delete rule`,
        undo: async () => {
          await rulesApi.createRule({
            conditions: snapshot.conditions,
            actions: snapshot.actions,
            sortOrder: snapshot.sortOrder,
          });
          qc.invalidateQueries({ queryKey: QK });
        },
        redo: async () => {
          qc.invalidateQueries({ queryKey: QK });
        },
      });
    },
  });
}

export function useReorderRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => {
      const rules = qc.getQueryData<Rule[]>(QK);
      const oldIds = rules?.map((r) => r.id) ?? [];
      return rulesApi.reorderRules(ids).then(() => oldIds);
    },
    onSuccess: (oldIds, newIds) => {
      qc.invalidateQueries({ queryKey: QK });
      useUndoStore.getState().push({
        description: `Reorder rules`,
        undo: async () => {
          await rulesApi.reorderRules(oldIds);
          qc.invalidateQueries({ queryKey: QK });
        },
        redo: async () => {
          await rulesApi.reorderRules(newIds);
          qc.invalidateQueries({ queryKey: QK });
        },
      });
    },
  });
}

export function useRunRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rulesApi.runRules,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}
