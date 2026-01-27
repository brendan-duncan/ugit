/**
 * Abstract base class for Git operations
 * Defines the interface that all Git adapters must implement
 */
class GitAdapter {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.isOpen = false;
  }

  /**
   * Open/initialize the repository
   * This should be called after construction before using any other methods
   * @returns {Promise<void>}
   */
  async open() {
    // Default implementation - subclasses can override if needed
    this.isOpen = true;
  }

  /**
   * Log a git command with timing information
   * @param {string} command - The git command being executed
   * @param {number} startTime - Start time from performance.now()
   */
  _logCommand(command, startTime) {
    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`[git] ${command} (${duration}ms)`);
  }

  /**
   * Get repository status including current branch and file changes
   * @returns {Promise<{current: string, files: Array<{path: string, working_dir: string, index: string}>}>}
   */
  async status() {
    throw new Error('status() must be implemented');
  }

  /**
   * Get list of local branches
   * @returns {Promise<{all: string[]}>}
   */
  async branchLocal() {
    throw new Error('branchLocal() must be implemented');
  }

  /**
   * Create a new branch
   * @param {string} branchName - Name of the new branch to create
   * @param {string} startPoint - Optional starting point (commit hash, branch name, or tag). Defaults to current HEAD
   * @returns {Promise<void>}
   */
  async createBranch(branchName, startPoint = null) {
    throw new Error('createBranch() must be implemented');
  }

  /**
   * Get ahead/behind count for a branch relative to its remote
   * @param {string} localBranch - Local branch name
   * @param {string} remoteBranch - Remote branch name (e.g., 'origin/main')
   * @returns {Promise<{ahead: number, behind: number}>}
   */
  async getAheadBehind(localBranch, remoteBranch) {
    throw new Error('getAheadBehind() must be implemented');
  }

  /**
   * Get remote origin URL
   * @returns {Promise<string>}
   */
  async getOriginUrl() {
    throw new Error('getOriginUrl() must be implemented');
  }

  /**
   * Hard reset local branch to match origin
   * @param {string} branch - Branch name to reset
   * @returns {Promise<void>}
   */
  async resetToOrigin(branch) {
    throw new Error('resetToOrigin() must be implemented');
  }

  /**
   * Get list of stashes
   * @returns {Promise<{all: Array<{hash: string, message: string}>}>}
   */
  async stashList() {
    throw new Error('stashList() must be implemented');
  }

  /**
   * Fetch from remote
   * @param {string} remote - Remote name (e.g., 'origin')
   * @returns {Promise<void>}
   */
  async fetch(remote) {
    throw new Error('fetch() must be implemented');
  }

  /**
   * Pull from remote branch
   * @param {string} remote - Remote name (e.g., 'origin')
   * @param {string} branch - Branch name
   * @returns {Promise<void>}
   */
  async pull(remote, branch) {
    throw new Error('pull() must be implemented');
  }

  /**
   * Push to remote branch
   * @param {string} remote - Remote name (e.g., 'origin')
   * @param {string} refspec - Refspec (e.g., 'main:main')
   * @param {string[]} options - Additional options (e.g., ['--tags'])
   * @returns {Promise<void>}
   */
  async push(remote, refspec, options = []) {
    throw new Error('push() must be implemented');
  }

  /**
   * Create a stash
   * @param {string} message - Stash message
   * @param {string[]} filePaths - Optional array of file paths to stash (if not provided, stashes all changes)
   * @returns {Promise<void>}
   */
  async stashPush(message, filePaths = null) {
    throw new Error('stashPush() must be implemented');
  }

/**
    * Apply and remove most recent stash
    * @returns {Promise<void>}
    */
  async stashPop() {
    throw new Error('stashPop() must be implemented');
  }

  /**
    * Apply most recent stash without removing it
    * @returns {Promise<void>}
    */
  async stashApply() {
    throw new Error('stashApply() must be implemented');
  }

  /**
   * Stage files
   * @param {string|string[]} filePaths - Path to file or array of file paths
   * @returns {Promise<void>}
   */
  async add(filePaths) {
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    throw new Error('add() must be implemented');
  }

  /**
   * Unstage files
   * @param {string|string[]} filePaths - Path to file or array of file paths
   * @returns {Promise<void>}
   */
  async reset(filePaths) {
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    throw new Error('reset() must be implemented');
  }

  /**
   * Commit staged changes
   * @param {string} message - Commit message
   * @returns {Promise<void>}
   */
  async commit(message) {
    throw new Error('commit() must be implemented');
  }

  /**
   * Get diff for a file
   * @param {string} filePath - Path to file
   * @param {boolean} isStaged - Whether to get staged diff
   * @returns {Promise<string>}
   */
  async diff(filePath, isStaged) {
    throw new Error('diff() must be implemented');
  }

  /**
   * Show file contents from a specific commit
   * @param {string} commitHash - The commit hash
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>}
   */
  async show(commitHash, filePath) {
    throw new Error('show() must be implemented');
  }

  /**
   * Get detailed information about a git stash entry
   * @param {number} stashIndex - The stash index (default: 0 for most recent)
   * @param {string} repoPath - Path to the git repository (default: current directory)
   * @returns {Promise<Object>} Object containing stash information
   */
  async getStashInfo(stashIndex) {
    throw new Error('getStashInfo() must be implemented');
  }

  /**
   * Get diff for a specific file in a stash
   * @param {number} stashIndex - The stash index
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>}
   */
  async getStashFileDiff(stashIndex, filePath) {
    throw new Error('getStashFileDiff() must be implemented');
  }
  
  /**
   * Discard changes for files (restore to HEAD)
   * @param {string[]} filePaths - Array of file paths to discard
   * @returns {Promise<void>}
   */
  async discard(filePaths) {
    throw new Error('discard() must be implemented');
  }

  /**
   * Create a patch file from changes
   * @param {string[]} filePaths - Array of file paths to include in patch
   * @param {string} outputPath - Path where to save the patch file
   * @param {boolean} isStaged - Whether to create patch from staged changes
   * @returns {Promise<void>}
   */
  async createPatch(filePaths, outputPath, isStaged = false) {
    throw new Error('createPatch() must be implemented');
  }

/**
    * Clone a repository
    * @param {string} repoUrl - Repository URL to clone
    * @param {string} parentFolder - Parent directory where repository should be cloned
    * @param {string} repoName - Name of the directory to create
    * @returns {Promise<void>}
    */
  async clone(repoUrl, parentFolder, repoName) {
    throw new Error('clone() must be implemented');
  }

  /**
    * Execute raw git command (fallback for operations not in the abstraction)
    * @param {string[]} args - Git command arguments
    * @returns {Promise<string>}
    */
  async raw(args) {
    throw new Error('raw() must be implemented');
  }
}

module.exports = GitAdapter;
