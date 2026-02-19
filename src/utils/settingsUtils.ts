import { ipcRenderer } from 'electron';
import { AppSettings, DEFAULT_SETTINGS } from './settings';

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
   * Check if a branch should be blocked for commits
   * @param branchName - Name of the branch to check
   * @returns True if commits should be blocked on this branch
   */
  static async shouldBlockCommit(branchName: string): Promise<boolean> {
    const settings = await this.getSettings();

    // Check each blocked branch pattern
    for (const pattern of settings.blockCommitBranches) {
      if (this.matchesPattern(branchName, pattern)) {
        return true;
      }
    }

    return false;
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
   * Check if a branch name matches a pattern
   * @param branchName - Branch name to check
   * @param pattern - Pattern (supports wildcards)
   * @returns True if the branch matches the pattern
   */
  private static matchesPattern(branchName: string, pattern: string): boolean {
    // Simple wildcard matching (supports * at the end)
    if (pattern.endsWith('/*') || pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      return branchName.startsWith(prefix);
    }

    // Simple glob-like pattern matching
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(branchName);
    }

    // Exact match
    return branchName === pattern;
  }

  /**
   * Get all blocked branch patterns
   * @returns Array of blocked branch patterns
   */
  static async getBlockedBranchPatterns(): Promise<string[]> {
    const settings = await this.getSettings();
    return [...settings.blockCommitBranches];
  }
}
