import { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import { AppSettings } from '../components/types';

/**
 * React hook for accessing and updating application settings
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const result = await ipcRenderer.invoke('get-settings');
      setSettings(result);
      setSettingsError(null);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setSettingsError('Failed to load settings');
    } finally {
      setLoadingSettings(false);
    }
  };

  const updateSetting = async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<boolean> => {
    try {
      await ipcRenderer.invoke('update-setting', key, value);
      // Reload settings after update
      await loadSettings();
      return true;
    } catch (err) {
      console.error('Failed to update setting:', err);
      setSettingsError('Failed to update setting');
      return false;
    }
  };

  const updateSettings = async (updates: Partial<AppSettings>): Promise<boolean> => {
    try {
      await ipcRenderer.invoke('update-settings', updates);
      // Reload settings after update
      await loadSettings();
      return true;
    } catch (err) {
      console.error('Failed to update settings:', err);
      setSettingsError('Failed to update settings');
      return false;
    }
  };

  const resetSettings = async (): Promise<boolean> => {
    try {
      await ipcRenderer.invoke('reset-settings');
      // Reload settings after reset
      await loadSettings();
      return true;
    } catch (err) {
      console.error('Failed to reset settings:', err);
      setSettingsError('Failed to reset settings');
      return false;
    }
  };

  const getSetting = <K extends keyof AppSettings>(key: K): AppSettings[K] | undefined => {
    return settings ? settings[key] : undefined;
  };

  return {
    settings,
    loadingSettings,
    settingsError,
    updateSetting,
    updateSettings,
    resetSettings,
    getSetting,
    refreshSettings: loadSettings
  };
}