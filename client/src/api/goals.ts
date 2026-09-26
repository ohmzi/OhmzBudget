import { apiFetch } from './client';
import type { Goal } from '../types';

export const getGoals = () => apiFetch<Goal[]>('/goals');

export const createGoal = (data: {
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string | null;
  accountId?: string | null;
  icon?: string;
  color?: string;
}) => apiFetch<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) });

export const updateGoal = (
  id: string,
  data: Partial<{
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string | null;
    accountId: string | null;
    icon: string;
    color: string;
  }>,
) => apiFetch<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteGoal = (id: string) => apiFetch<void>(`/goals/${id}`, { method: 'DELETE' });
