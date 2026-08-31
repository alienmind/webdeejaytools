import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppSettings, RedactedAccount } from '../../shared/types.js';
import { api } from '../services/api.js';
import { useToast } from '../components/Toast.js';

/**
 * Owns the two pieces of state every view needs: accounts and settings.
 *
 * Previously App.tsx fetched both once, prop-drilled them into all four pages, and threaded an
 * onAccountsUpdated callback back up to force a full reload - with failures swallowed into
 * console.warn, so an unreachable backend rendered as a silently empty UI.
 */

interface AppDataValue {
  accounts: RedactedAccount[];
  settings: AppSettings;
  loading: boolean;
  /** Set when the last load failed; the UI shows this rather than pretending the data is empty. */
  loadError: string | null;
  refreshAccounts: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshAll: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Applies a settings object already returned by the server, without another round trip. */
  setSettingsLocal: (settings: AppSettings) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultDownloadDir: './downloads',
  defaultLibraryDir: './library',
  defaultQuality: 6,
  embedArtwork: true,
  createM3u: true,
  folderFormat: '{artist} - {album} ({year})',
  trackFormat: '{trackNumber} - {title}',
  djMode: true,
};

const AppDataContext = createContext<AppDataValue | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    const next = await api.getAccounts();
    setAccounts(next);
  }, []);

  const refreshSettings = useCallback(async () => {
    const next = await api.getSettings();
    setSettings(next);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, sets] = await Promise.all([api.getAccounts(), api.getSettings()]);
      setAccounts(accs);
      setSettings(sets);
      setLoadError(null);
    } catch (err: any) {
      const message = err?.message || 'Could not reach the local server';
      setLoadError(message);
      toast.error('Failed to load application data', message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
    },
    []
  );

  useEffect(() => {
    void refreshAll();
    // refreshAll is stable apart from the toast helper, which never changes identity in practice.
  }, [refreshAll]);

  const value = useMemo<AppDataValue>(
    () => ({
      accounts,
      settings,
      loading,
      loadError,
      refreshAccounts,
      refreshSettings,
      refreshAll,
      updateSettings,
      setSettingsLocal: setSettings,
    }),
    [accounts, settings, loading, loadError, refreshAccounts, refreshSettings, refreshAll, updateSettings]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used inside an AppDataProvider');
  }
  return ctx;
}
