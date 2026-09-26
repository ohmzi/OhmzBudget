import { apiFetch } from './client';
import type { BudgetGroup, BudgetSummary } from '../types';

export const getBudget = (month: string) => apiFetch<BudgetGroup[]>(`/budget/${month}`);

export const getBudgetSummary = (month: string) =>
  apiFetch<BudgetSummary>(`/budget/${month}/summary`);

export const setBudget = (month: string, categoryId: string, budgeted: number) =>
  apiFetch<{ month: string; categoryId: string; budgeted: number }>(
    `/budget/${month}/${categoryId}`,
    { method: 'PUT', body: JSON.stringify({ budgeted }) },
  );

export interface CategoryHistory {
  categoryId: string;
  isIncome: boolean;
  lastMonth: number;
  average: number;
  history: { month: string; amount: number }[];
}

export const getCategoryHistory = (categoryId: string, currentMonth?: string, months?: number) => {
  const params = new URLSearchParams();
  if (currentMonth) params.set('currentMonth', currentMonth);
  if (months) params.set('months', String(months));
  const qs = params.toString();
  return apiFetch<CategoryHistory>(`/budget/category/${categoryId}/history${qs ? `?${qs}` : ''}`);
};

export const setBudgetBulk = (categoryId: string, budgeted: number, fromMonth: string) =>
  apiFetch<{ categoryId: string; budgeted: number; months: string[] }>(
    `/budget/category/${categoryId}/bulk`,
    { method: 'PUT', body: JSON.stringify({ budgeted, fromMonth }) },
  );
