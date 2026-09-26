import { apiFetch } from './client';
import type { Rule, RuleCondition, RuleAction, RunRulesPreviewItem } from '../types';

type RulePayload = { conditions: RuleCondition[]; actions: RuleAction[]; sortOrder?: number };

export const getRules = () => apiFetch<Rule[]>('/rules');
export const createRule = (data: RulePayload) =>
  apiFetch<Rule>('/rules', { method: 'POST', body: JSON.stringify(data) });
export const updateRule = (id: string, data: Partial<RulePayload>) =>
  apiFetch<Rule>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRule = (id: string) => apiFetch<void>(`/rules/${id}`, { method: 'DELETE' });
export const reorderRules = (ids: string[]) =>
  apiFetch<{ ok: boolean }>('/rules/reorder', { method: 'PUT', body: JSON.stringify({ ids }) });
export const previewRules = () => apiFetch<RunRulesPreviewItem[]>('/rules/preview');
export const runRules = () => apiFetch<{ updated: number }>('/rules/run', { method: 'POST' });
export const testConditions = (conditions: RuleCondition[]) =>
  apiFetch<
    Array<{
      id: string;
      date: string;
      payeeName: string | null;
      amount: number;
      categoryId: string | null;
    }>
  >('/rules/test', { method: 'POST', body: JSON.stringify({ conditions }) });
