/**
 * Abstract base class for Git operations
 * Defines the interface that all Git adapters must implement
 */

export interface GitStatus {
  current: string;
  files: Array<{
    path: string;
    working_dir: string;
    index: string;
  }>;
}

export interface BranchInfo {
  all: string[];
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export interface StashInfo {
  stashRef: string;
  index: number;
  output: string;
  files: string[];
  fileDiffs: Map<string, string>;
  totalFiles: number;

  hash: string;
  author: string;
  date: string;
  merge: string;
  message: string;
}

export interface StashListResponse {
  all: StashInfo[];
}

export interface FileDiffOptions {
  filePath: string;
  isStaged?: boolean;
}

export interface CommandStateCallback {
  (isRunning: boolean, id: number, command: string, startTime: number): void;
}

export interface CommitFile {
  status: string;
  path: string;
}

export interface Commit {
  hash: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
  body: string;
  onOrigin: boolean;
}

export abstract class GitAdapter {
  public repoPath: string;
  public currentBranch: string | null = null;
  public commandStateCallback: CommandStateCallback | null = null;
  public isOpen: boolean = false;

  protected _id: number = 0;
  protected _pendingCommands: Map<number, string> = new Map();

  constructor(repoPath: string, commandStateCallback: CommandStateCallback | null = null) {
    this.repoPath = repoPath;
    this.commandStateCallback = commandStateCallback;
  }

  protected _startCommand(command: string, startTime: number): number {
    this._pendingCommands.set(this._id, command);
    if (this.commandStateCallback) {
      // Defer callback to avoid state updates during render
      var _id = this._id;
      var _command = command;
      var _startTime = startTime;
      setTimeout(() => {
        this.commandStateCallback(true, _id, _command, _startTime);
      }, 0);
    }
    return this._id++;
  }

  protected _endCommand(id: number, startTime: number): void {
    const deltaTime = performance.now() - startTime;
    const command = this._pendingCommands.get(id);
    if (command) {
      this._logCommand(command, deltaTime);
      this._pendingCommands.delete(id);
    }
    if (this.commandStateCallback) {
      // Defer callback to avoid state updates during render
      var _id = id;
      var _command = command;
      var _deltaTime = deltaTime;
      setTimeout(() => {
        this.commandStateCallback(false, _id, _command || '', _deltaTime);
      }, 0);
    }
  }

  /**
   * Open/initialize the repository
   * This should be called after construction before using any other methods
   */
  async open(): Promise<void> {
    // Default implementation - subclasses can override if needed
    this.isOpen = true;
  }

  /**
   * Log a git command with timing information
   * @param command - The git command being executed
   * @param deltaTime - Time taken in milliseconds
   */
  protected _logCommand(command: string, deltaTime: number): void {
    const duration = (deltaTime * 0.001).toFixed(2);
    console.log(`[git] ${command} (${duration}s)`);
  }

  /**
   * Get repository status including current branch and file changes
   * @param path - Optional file path to limit status to that file
   */
  abstract status(path?: string): Promise<GitStatus>;

  /**
   * Get list of local branches
   */
  abstract branchLocal(): Promise<BranchInfo>;

  /**
   * Create a new branch
   * @param branchName - Name of the new branch to create
   * @param startPoint - Optional starting point (commit hash, branch name, or tag). Defaults to current HEAD
   */
  abstract createBranch(branchName: string, startPoint?: string | null): Promise<void>;

  /**
   * Get ahead/behind count for a branch relative to its remote
   * @param localBranch - Local branch name
   * @param remoteBranch - Remote branch name (e.g., 'origin/main')
   */
  abstract getAheadBehind(localBranch: string, remoteBranch: string): Promise<AheadBehind>;

  /**
   * Get remote origin URL
   */
  abstract getOriginUrl(): Promise<string>;

  /**
   * Set remote URL
   * @param remoteName - Name of the remote (e.g., 'origin')
   * @param url - New URL for the remote
   */
  abstract setRemoteUrl(remoteName: string, url: string): Promise<void>;

  /**
   * Add a new remote
   * @param remoteName - Name of the remote to add (e.g., 'origin')
   * @param url - URL for the remote
   */
  abstract addRemote(remoteName: string, url: string): Promise<void>;

  /**
   * Remove a remote
   * @param remoteName - Name of the remote to remove (e.g., 'origin')
   */
  abstract removeRemote(remoteName: string): Promise<void>;

  /**
   * Edit a remote URL
   * @param remoteName - Name of the remote to edit (e.g., 'origin')
   * @param newUrl - New URL for the remote
   */
  abstract editRemote(remoteName: string, newUrl: string): Promise<void>;

  /**
   * Hard reset local branch to match origin
   * @param branch - Branch name to reset
   */
  abstract resetToOrigin(branch: string): Promise<void>;

  /**
   * Get list of stashes
   */
  abstract stashList(): Promise<StashListResponse>;

  /**
   * Fetch from remote
   * @param remote - Remote name (e.g., 'origin')
   */
  abstract fetch(remote: string): Promise<void>;

  /**
   * Pull from remote branch
   * @param remote - Remote name (e.g., 'origin')
   * @param branch - Branch name
   */
  abstract pull(remote: string, branch: string): Promise<void>;

  /**
   * Push to remote branch
   * @param remote - Remote name (e.g., 'origin')
   * @param refspec - Refspec (e.g., 'main:main')
   * @param options - Additional options (e.g., ['--tags'])
   */
  abstract push(remote: string, refspec: string, options?: string[]): Promise<void>;

  /**
   * Create a stash
   * @param message - Stash message
   * @param filePaths - Optional array of file paths to stash (if not provided, stashes all changes)
   */
  abstract stashPush(message: string, filePaths?: string[] | null): Promise<void>;

  /**
   * Apply and remove most recent stash
   */
  abstract stashPop(): Promise<void>;

  /**
   * Apply most recent stash without removing it
   */
  abstract stashApply(): Promise<void>;

  /**
   * Stage files
   * @param filePaths - Path to file or array of file paths
   */
  abstract add(filePaths: string | string[]): Promise<void>;

  /**
   * Unstage files
   * @param filePaths - Path to file or array of file paths
   */
  abstract reset(filePaths: string | string[]): Promise<void>;

  /**
   * Commit staged changes
   * @param message - Commit message
   */
  abstract commit(message: string): Promise<void>;

  /**
   * Get a list of files changed in a commit
   * @param commitHash string
   */
  abstract getCommitFiles(commitHash: string): Promise<Array<CommitFile>>;

  /**
   * Get diff for a file
   * @param filePath - Path to file
   * @param isStaged - Whether to get staged diff
   */
  abstract diff(filePath: string, isStaged: boolean): Promise<string>;

  /**
   * Show file contents from a specific commit
   * @param commitHash - The commit hash
   * @param filePath - Path to the file
   */
  abstract show(commitHash: string, filePath: string): Promise<string>;

  /**
   * Get detailed information about a git stash entry
   * @param stashIndex - The stash index (default: 0 for most recent)
   * @param repoPath - Path to the git repository (default: current directory)
   */
  abstract getStashInfo(stashIndex: number): Promise<StashInfo>;

  /**
   * Get diff for a specific file in a stash
   * @param stashIndex - The stash index
   * @param filePath - Path to the file
   */
  abstract getStashFileDiff(stashIndex: number, filePath: string): Promise<string>;
   
  /**
   * Discard changes for files (restore to HEAD)
   * @param filePaths - Array of file paths to discard
   */
  abstract discard(filePaths: string[]): Promise<void>;

  /**
   * Checkout a branch
   * @param branchName - Name of the branch to checkout
   */
  abstract checkoutBranch(branchName: string): Promise<void>;

  /**
   * List the commit log for a branch
   * @param branchName - Name of the branch
   * @param maxCount - Maximum number of commits to retrieve
   */
  abstract log(branchName: string, maxCount: number): Promise<any[]>;

  /**
   * Create a patch file from changes
   * @param filePaths - Array of file paths to include in patch
   * @param outputPath - Path where to save the patch file
   * @param isStaged - Whether to create patch from staged changes
   */
  abstract createPatch(filePaths: string[], outputPath: string, isStaged?: boolean): Promise<void>;

  /**
   * Clone a repository
   * @param repoUrl - Repository URL to clone
   * @param parentFolder - Parent directory where repository should be cloned
   * @param repoName - Name of the directory to create
   */
  abstract clone(repoUrl: string, parentFolder: string, repoName: string): Promise<void>;

  /**
   * Execute raw git command (fallback for operations not in the abstraction)
   * @param args - Git command arguments
   */
  abstract raw(args: string[]): Promise<string>;
}

export default GitAdapter;