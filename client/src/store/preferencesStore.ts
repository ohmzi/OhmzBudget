import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type DateFormatOption = 'MMM d, yyyy' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';
export type SidebarMode = 'persistent' | 'auto-hide';

interface PreferencesState {
  theme: Theme;
  currencySymbol: string;
  dateFormat: DateFormatOption;
  savingsGoal: number;
  sidebarMode: SidebarMode;
  showMerchantIcons: boolean;
  showCategoryIcons: boolean;
  showAccountIcons: boolean;
  setTheme: (theme: Theme) => void;
  setCurrencySymbol: (symbol: string) => void;
  setDateFormat: (format: DateFormatOption) => void;
  setSavingsGoal: (goal: number) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setShowMerchantIcons: (show: boolean) => void;
  setShowCategoryIcons: (show: boolean) => void;
  setShowAccountIcons: (show: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'light',
      currencySymbol: '$',
      dateFormat: 'MMM d, yyyy',
      savingsGoal: 20,
      sidebarMode: 'persistent',
      showMerchantIcons: true,
      showCategoryIcons: true,
      showAccountIcons: true,
      setTheme: (theme) => set({ theme }),
      setCurrencySymbol: (currencySymbol) => set({ currencySymbol }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setSavingsGoal: (savingsGoal) => set({ savingsGoal }),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setShowMerchantIcons: (showMerchantIcons) => set({ showMerchantIcons }),
      setShowCategoryIcons: (showCategoryIcons) => set({ showCategoryIcons }),
      setShowAccountIcons: (showAccountIcons) => set({ showAccountIcons }),
    }),
    { name: 'budget-preferences' },
  ),
);
