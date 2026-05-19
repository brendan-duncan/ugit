export interface AppSettings {
  localFileRefreshTime: number;
  lockedBranchPatterns: string[];
  diffViewMode: 'side-by-side' | 'line-by-line';
  pushAllTags: boolean;
  maxCommits: number;
  externalEditor: string;
  theme: 'dark' | 'light';
}

export const DEFAULT_SETTINGS: AppSettings = {
  localFileRefreshTime: 5,
  lockedBranchPatterns: ['trunk', '*/staging'],
  diffViewMode: 'line-by-line',
  pushAllTags: false,
  maxCommits: 100,
  externalEditor: 'code',
  theme: 'dark'
};

/**
 * Returns true if `branchName` matches any of the provided lock patterns.
 * Patterns support `*` as a wildcard (e.g. `*` /staging` matches `release/staging`).
 */
export function isBranchLocked(branchName: string, patterns: ReadonlyArray<string> | undefined): boolean {
  if (!branchName || !patterns || patterns.length === 0)
    return false;
  return patterns.some(raw => {
    const pattern = raw.trim();
    if (!pattern)
      return false;
    if (pattern.includes('*')) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp('^' + escaped + '$').test(branchName);
    }
    return pattern === branchName;
  });
}

/**
 * Manages application settings with persistent storage
 */
export class SettingsManager {
  private cacheManager: any;
  private settings: AppSettings | null = null;
  private readonly SETTINGS_KEY = 'app-settings';

  constructor(cacheManager: any) {
    this.cacheManager = cacheManager;
  }

  /**
   * Load settings from persistent cache
   * @returns Loaded settings or default settings
   */
  loadSettings(): AppSettings {
    try {
      const cached = this.cacheManager.loadCache(this.SETTINGS_KEY);
      if (cached) {
        // Migrate legacy `blockCommitBranches` field to `lockedBranchPatterns`.
        if (cached.blockCommitBranches && !cached.lockedBranchPatterns) {
          cached.lockedBranchPatterns = cached.blockCommitBranches;
        }
        delete cached.blockCommitBranches;
        if (this.isValidSettings(cached)) {
          this.settings = { ...DEFAULT_SETTINGS, ...cached };
          return this.settings;
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }

    // Return default settings if loading fails
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings(); // Save defaults for next time
    return this.settings;
  }

  /**
   * Save current settings to persistent cache
   */
  saveSettings(): void {
    if (!this.settings) {
      console.warn('No settings to save');
      return;
    }

    try {
      this.cacheManager.saveCache(this.SETTINGS_KEY, this.settings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  /**
   * Get all current settings
   * @returns Current settings object
   */
  getSettings(): AppSettings {
    if (!this.settings) {
      return this.loadSettings();
    }
    return { ...this.settings };
  }

  /**
   * Get a specific setting value
   * @param key - Setting key
   * @returns Setting value or default
   */
  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    const settings = this.getSettings();
    return settings[key];
  }

  /**
   * Update a specific setting
   * @param key - Setting key
   * @param value - New value
   */
  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    if (!this.settings) {
      this.loadSettings();
    }

    if (this.settings) {
      this.settings[key] = value;
      this.saveSettings();
    }
  }

  /**
   * Update multiple settings at once
   * @param updates - Partial settings object
   */
  updateSettings(updates: Partial<AppSettings>): void {
    if (!this.settings) {
      this.loadSettings();
    }

    if (this.settings) {
      this.settings = { ...this.settings, ...updates };
      this.saveSettings();
    }
  }

  /**
   * Reset all settings to defaults
   */
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  /**
   * Validate that cached data is a valid settings object
   * @param data - Data to validate
   * @returns True if valid settings
   */
  private isValidSettings(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.localFileRefreshTime === 'number' &&
      Array.isArray(data.lockedBranchPatterns) &&
      data.lockedBranchPatterns.every((item: any) => typeof item === 'string') &&
      (data.diffViewMode === undefined ||
       data.diffViewMode === 'side-by-side' ||
       data.diffViewMode === 'line-by-line') &&
      (data.pushAllTags === undefined || typeof data.pushAllTags === 'boolean') &&
      (data.maxCommits === undefined || typeof data.maxCommits === 'number') &&
      (data.externalEditor === undefined || typeof data.externalEditor === 'string') &&
      (data.theme === undefined || data.theme === 'dark' || data.theme === 'light')
    );
  }

  /**
   * Get default settings (useful for UI display)
   * @returns Default settings object
   */
  static getDefaults(): AppSettings {
    return { ...DEFAULT_SETTINGS };
  }
}

// Export singleton instance that will be initialized with cache manager
let settingsManagerInstance: SettingsManager | null = null;

export function initializeSettings(cacheManager: any): SettingsManager {
  settingsManagerInstance = new SettingsManager(cacheManager);
  return settingsManagerInstance;
}

export function getSettingsManager(): SettingsManager {
  if (!settingsManagerInstance) {
    throw new Error('SettingsManager not initialized. Call initializeSettings first.');
  }
  return settingsManagerInstance;
}
