const fs = require('fs');
const path = require('path');

/**
 * Manages persistent cache for repository data
 */
class CacheManager {
  constructor() {
    this.cacheDir = null;
  }

  /**
   * Set cache directory (must be called from main process)
   * @param {string} userDataPath - User data path from app.getPath('userData')
   */
  setCacheDir(userDataPath) {
    this.cacheDir = path.join(userDataPath, 'repo-cache');

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get cache directory
   */
  getCacheDir() {
    if (!this.cacheDir) {
      throw new Error('Cache directory not initialized. Call setCacheDir first.');
    }
    return this.cacheDir;
  }

  /**
   * Get cache file path for a repository
   * @param {string} repoPath - Repository path
   * @returns {string} Cache file path
   */
  getCacheFilePath(repoPath) {
    // Create a safe filename from the repo path
    const safeName = repoPath.replace(/[^a-zA-Z0-9]/g, '_');
    const hash = this.hashString(repoPath);
    return path.join(this.getCacheDir(), `${safeName}_${hash}.json`);
  }

  /**
   * Simple hash function for strings
   * @param {string} str - String to hash
   * @returns {string} Hash
   */
  hashString(str) {
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
   * @param {string} repoPath - Repository path
   * @param {object} data - Data to cache
   */
  saveCache(repoPath, data) {
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
   * @param {string} repoPath - Repository path
   * @returns {object|null} Cached data or null if not found/invalid
   */
  loadCache(repoPath) {
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
   * @param {string} repoPath - Repository path
   */
  clearCache(repoPath) {
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
  clearAllCaches() {
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
module.exports = new CacheManager();
