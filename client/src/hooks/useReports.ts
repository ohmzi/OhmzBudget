import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../api/reports';

export const useNetWorth = (from: string, to: string, granularity?: 'daily' | 'monthly') =>
  useQuery({
    queryKey: ['reports', 'net-worth', from, to, granularity],
    queryFn: () => reportsApi.getNetWorth(from, to, granularity),
  });

export const useIncomeVsExpenses = (from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'income-expenses', from, to],
    queryFn: () => reportsApi.getIncomeVsExpenses(from, to),
  });

export const useCashFlow = (from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'cash-flow', from, to],
    queryFn: () => reportsApi.getCashFlow(from, to),
  });

export const useSpendingByCategory = (from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'spending-by-category', from, to],
    queryFn: () => reportsApi.getSpendingByCategory(from, to),
  });

export const useIncomeByCategory = (from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'income-by-category', from, to],
    queryFn: () => reportsApi.getIncomeByCategory(from, to),
  });

export const useSpendingTrends = (categoryIds: string[], from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'spending-trends', categoryIds.join(','), from, to],
    queryFn: () => reportsApi.getSpendingTrends(categoryIds, from, to),
    enabled: categoryIds.length > 0,
  });

export const useSpendingComparison = (mode: string) =>
  useQuery({
    queryKey: ['reports', 'spending-comparison', mode],
    queryFn: () => reportsApi.getSpendingComparison(mode),
  });
