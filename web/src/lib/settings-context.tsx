import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { settings as settingsApi } from './api';
import { useAsync } from './useAsync';
import type { Settings } from './types';

export const DEFAULT_WARN_MINUTES = [10, 5, 1];

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

/**
 * Loaded once per authenticated app load (specs/sessions.md §3): `rules.warnMinutes`,
 * `payments.methods` and the money rules are read from here, never hardcoded.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useAsync(() => settingsApi.get(), []);
  const value = useMemo<SettingsState>(
    () => ({ settings: data, loading, error, reload }),
    [data, loading, error, reload],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

/** Timer thresholds are the one setting nearly every screen needs. */
export function useWarnMinutes(): number[] {
  const { settings } = useSettings();
  return settings?.rules.warnMinutes?.length ? settings.rules.warnMinutes : DEFAULT_WARN_MINUTES;
}
