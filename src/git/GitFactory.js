/**
 * Factory for creating Git adapter instances
 */
class GitFactory {
  /**
   * Create and open a Git adapter instance
   * @param {string} repoPath - Path to the git repository
   * @param {string} backend - Backend to use: 'simple-git' or 'es-git'
   * @returns {Promise<GitAdapter>} Git adapter instance (already opened)
   */
  static async createAdapter(repoPath, backend = 'simple-git') {
    let adapter;

    switch (backend.toLowerCase()) {
      case 'simple-git':
      case 'simplegit':
        const SimpleGitAdapter = require('./SimpleGitAdapter');
        adapter = new SimpleGitAdapter(repoPath);
        break;

      case 'es-git':
      case 'esgit':
        const EsGitAdapter = require('./EsGitAdapter');
        adapter = new EsGitAdapter(repoPath);
        break;



      default:
        console.warn(`Unknown git backend: ${backend}, defaulting to simple-git`);
        const SimpleGitAdapterDefault = require('./SimpleGitAdapter');
        adapter = new SimpleGitAdapterDefault(repoPath);
        break;
    }

    // Open/initialize the adapter
    await adapter.open();
    return adapter;
  }

  /**
   * Get list of available backends
   * @returns {string[]} List of available backend names
   */
  static getAvailableBackends() {
    return ['simple-git', 'es-git'];
  }
}

module.exports = GitFactory;
