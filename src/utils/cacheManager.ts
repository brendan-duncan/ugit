import * as fs from 'fs';
import * as path from 'path';

/**
 * Manages persistent cache for repository data
 */
export class CacheManager {
  private cacheDir: string | null = null;

  /**
   * Set cache directory (must be called from main process)
   * @param userDataPath - User data path from app.getPath('userData')
   */
  setCacheDir(userDataPath: string): void {
    this.cacheDir = path.join(userDataPath, 'repo-cache');

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir!)) {
      fs.mkdirSync(this.cacheDir!, { recursive: true });
    }
  }

  /**
   * Get cache directory
   */
  getCacheDir(): string {
    if (!this.cacheDir) {
      throw new Error('Cache directory not initialized. Call setCacheDir first.');
    }
    return this.cacheDir;
  }

  /**
   * Get cache file path for a repository
   * @param repoPath - Repository path
   * @returns Cache file path
   */
  getCacheFilePath(repoPath: string): string {
    // Create a safe filename from repo path
    const safeName = repoPath.replace(/[^a-zA-Z0-9]/g, '_');
    const hash = this.hashString(repoPath);
    return path.join(this.getCacheDir(), `${safeName}_${hash}.json`);
  }

  /**
   * Simple hash function for strings
   * @param str - String to hash
   * @returns Hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Save repository data to cache
   * @param repoPath - Repository path
   * @param data - Data to cache
   */
  saveCache(repoPath: string, data: any): void {
    try {
      const cacheFile = this.getCacheFilePath(repoPath);
      const cacheData = {
        repoPath,
        timestamp: Date.now(),
        version: 1,
        data
      };
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  /**
   * Load repository data from cache
   * @param repoPath - Repository path
   * @returns Cached data or null if not found/invalid
   */
  loadCache(repoPath: string): any {
    try {
      const cacheFile = this.getCacheFilePath(repoPath);

      if (!fs.existsSync(cacheFile)) {
        return null;
      }

      const fileContent = fs.readFileSync(cacheFile, 'utf8');
      const cacheData = JSON.parse(fileContent);

      // Verify version and repo path
      if (cacheData.version !== 1 || cacheData.repoPath !== repoPath) {
        return null;
      }

      // Optional: Check if cache is too old (e.g., more than 7 days)
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (Date.now() - cacheData.timestamp > maxAge) {
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Error loading cache:', error);
      return null;
    }
  }

  /**
   * Clear cache for a specific repository
   * @param repoPath - Repository path
   */
  clearCache(repoPath: string): void {
    try {
      const cacheFile = this.getCacheFilePath(repoPath);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    try {
      const cacheDir = this.getCacheDir();
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(cacheDir, file));
        }
      });
    } catch (error) {
      console.error('Error clearing all caches:', error);
    }
  }
}

// Export singleton instance
export default new CacheManager();