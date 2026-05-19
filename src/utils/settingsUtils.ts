import { ipcRenderer } from 'electron';
import { AppSettings, DEFAULT_SETTINGS, isBranchLocked } from './settings';

/**
 * Utility functions for working with settings in non-React contexts
 */
export class SettingsUtils {
  private static cachedSettings: AppSettings | null = null;
  private static cacheExpiry: number = 0;
  private static readonly CACHE_DURATION = 60000; // 1 minute

  /**
   * Get current settings (with caching)
   */
  static async getSettings(): Promise<AppSettings> {
    const now = Date.now();

    // Return cached settings if still valid
    if (this.cachedSettings && now < this.cacheExpiry) {
      return this.cachedSettings;
    }

    try {
      const settings = await ipcRenderer.invoke('get-settings');
      this.cachedSettings = settings;
      this.cacheExpiry = now + this.CACHE_DURATION;
      return settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Return default settings on error
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Check if a branch is locked for commits.
   * @param branchName - Name of the branch to check
   * @returns True if commits should be prevented on this branch
   */
  static async isBranchLocked(branchName: string): Promise<boolean> {
    const settings = await this.getSettings();
    return isBranchLocked(branchName, settings.lockedBranchPatterns);
  }

  /**
   * Get the local file refresh time
   * @returns Refresh time in seconds
   */
  static async getLocalFileRefreshTime(): Promise<number> {
    const settings = await this.getSettings();
    return settings.localFileRefreshTime;
  }

  /**
   * Clear the settings cache (useful after updating settings)
   */
  static clearCache(): void {
    this.cachedSettings = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get all locked branch patterns
   * @returns Array of locked branch patterns
   */
  static async getLockedBranchPatterns(): Promise<string[]> {
    const settings = await this.getSettings();
    return [...settings.lockedBranchPatterns];
  }
}
