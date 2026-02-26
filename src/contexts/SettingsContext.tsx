import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ipcRenderer } from 'electron';
import { AppSettings, DEFAULT_SETTINGS } from '../utils/settings';

interface SettingsContextValue {
  settings: AppSettings | null;
  loadingSettings: boolean;
  settingsError: string | null;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<boolean>;
  resetSettings: () => Promise<boolean>;
  getSetting: <K extends keyof AppSettings>(key: K) => AppSettings[K] | undefined;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const result = await ipcRenderer.invoke('get-settings');
      setSettings(result);
      setSettingsError(null);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setSettingsError('Failed to load settings');
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = useCallback(async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<boolean> => {
    try {
      await ipcRenderer.invoke('update-setting', key, value);
      await loadSettings();
      return true;
    } catch (err) {
      console.error('Failed to update setting:', err);
      setSettingsError('Failed to update setting');
      return false;
    }
  }, [loadSettings]);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>): Promise<boolean> => {
    try {
      await ipcRenderer.invoke('update-settings', updates);
      await loadSettings();
      return true;
    } catch (err) {
      console.error('Failed to update settings:', err);
      setSettingsError('Failed to update settings');
      return false;
    }
  }, [loadSettings]);

  const resetSettings = useCallback(async (): Promise<boolean> => {
    try {
      await ipcRenderer.invoke('reset-settings');
      await loadSettings();
      return true;
    } catch (err) {
      console.error('Failed to reset settings:', err);
      setSettingsError('Failed to reset settings');
      return false;
    }
  }, [loadSettings]);

  const getSetting = useCallback(<K extends keyof AppSettings>(key: K): AppSettings[K] | undefined => {
    return settings ? settings[key] : undefined;
  }, [settings]);

  const value: SettingsContextValue = {
    settings,
    loadingSettings,
    settingsError,
    updateSetting,
    updateSettings,
    resetSettings,
    getSetting,
    refreshSettings: loadSettings
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
