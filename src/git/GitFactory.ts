import GitAdapter from './GitAdapter';
import SimpleGitAdapter from './SimpleGitAdapter';

/**
 * Factory for creating Git adapter instances
 */
export class GitFactory {
  /**
   * Create and open a Git adapter instance
   * @param repoPath - Path to the git repository
   * @param backend - Backend to use: 'simple-git' or 'es-git'
   * @returns Git adapter instance (already opened)
   */
  static async createAdapter(repoPath: string, backend: string = 'simple-git'): Promise<GitAdapter> {
    let adapter: GitAdapter;

    switch (backend.toLowerCase()) {
      case 'simple-git':
      case 'simplegit':
        adapter = new SimpleGitAdapter(repoPath);
        break;

      case 'es-git':
      case 'esgit':
        // EsGitAdapter would be imported here when available
        // const { default: EsGitAdapter } = await import('./EsGitAdapter');
        // adapter = new EsGitAdapter(repoPath);
        console.warn(`es-git backend not yet implemented, falling back to simple-git`);
        adapter = new SimpleGitAdapter(repoPath);
        break;

      default:
        console.warn(`Unknown git backend: ${backend}, defaulting to simple-git`);
        adapter = new SimpleGitAdapter(repoPath);
        break;
    }

    // Open/initialize the adapter
    await adapter.open();
    return adapter;
  }

  /**
   * Get list of available backends
   * @returns List of available backend names
   */
  static getAvailableBackends(): string[] {
    return ['simple-git', 'es-git'];
  }
}

export default GitFactory;