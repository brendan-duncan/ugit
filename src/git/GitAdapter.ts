export interface FileStatus {
  // Original location of the file, when the file has been moved or renamed
  from?: string;
  // Path to the file relative to the repository root
  path: string;
  // First digit of the status code of the file, e.g. 'M' = modified.
  // Represents the status of the index if no merge conflicts, otherwise represents
  // status of one side of the merge.
  index: string;
  // Second digit of the status code of the file. Represents status of the working directory
  // if no merge conflicts, otherwise represents status of other side of a merge.
  // See https://git-scm.com/docs/git-status#_short_format for full documentation of possible
  // values and their meanings.
  working_dir: string;
}

export interface RenamedFileStatus {
   from: string;
   to: string;
}

export interface GitStatus {
  notAdded: string[];
  conflicted: string[];
  created: string[];
  deleted: string[];
  ignored?: string[];
  modified: string[];
  renamed: RenamedFileStatus[];
  staged: string[];

  // Number of commits ahead of the tracked branch
  ahead: number;
  // Number of commits behind the tracked branch
  behind: number;
  // Current branch name (or null if in detached HEAD state)
  current: string | null;
  // Name of the remote branch being tracked (e.g., 'origin/main')
  tracking: string | null;
  // Detached status of the working copy, for more detail of what the working branch
  // is detached from use `git.branch()`
  detached: boolean;
  // List of changed files with their status codes
  files: Array<FileStatus>;
}

export interface BranchInfo {
  all: string[];
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export interface RebaseStatus {
  // Backend used by the in-progress rebase: 'merge' for .git/rebase-merge (the
  // default for `git rebase` and interactive rebases), 'apply' for the older
  // .git/rebase-apply backend.
  kind: 'merge' | 'apply';
  // Branch being rebased (e.g. 'feature'), or null if it can't be determined.
  branch: string | null;
  // Short label for the commit/branch the work is being replayed onto.
  onto: string | null;
  // 1-based index of the commit currently being applied.
  currentStep: number;
  // Total number of commits in the rebase.
  totalSteps: number;
  // Short hash of the commit the rebase is currently stopped on.
  currentCommitHash: string | null;
  // Subject line of the commit the rebase is currently stopped on.
  currentCommitSubject: string | null;
  // Paths of files with unresolved merge conflicts that block continuing.
  conflictedFiles: string[];
}

export interface StashInfo {
  stashRef: string;
  index: number;
  output: string;
  files: string[];
  fileStatuses: { [filePath: string]: string };
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
  tags: string[];
}

export interface SearchQuery {
  message?: string;
  author?: string;
  sha?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchLogResult {
  commits: Commit[];
  truncated: boolean;
}

export interface WorktreeInfo {
  // Absolute path to the worktree's working directory.
  path: string;
  // Short branch name checked out in the worktree (e.g. 'main'), or null when the
  // worktree is in a detached HEAD state.
  branch: string | null;
  // Commit hash the worktree's HEAD points at.
  head: string;
  // True for the repository's primary (main) worktree — the one holding the real
  // .git directory. Main worktrees can't be removed with `git worktree remove`.
  isMain: boolean;
  // True when this worktree's path matches the adapter's repoPath (the one ugit
  // currently has open in this view).
  isCurrent: boolean;
  // True when HEAD is detached rather than on a branch.
  detached: boolean;
  // True when the worktree is locked (protected from pruning/removal).
  locked: boolean;
  // Optional reason supplied when the worktree was locked.
  lockReason?: string;
  // True when the worktree's directory is missing/unreachable and git considers it
  // prunable (e.g. the folder was deleted outside ugit).
  prunable: boolean;
}

/**
 * Abstract base class for Git operations
 * Defines the interface that all Git adapters must implement
 */
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
   * Initialize a directory as a git repository.
   * @param branchName - Optional initial branch name (defaults to git's configured default)
   */
  abstract init(branchName?: string): Promise<void>;

  /**
   * Get repository status including current branch and file changes
   * @param path - Optional file path to limit status to that file
   * @param noLock - Optional flag to skip index refresh and avoid creating an index.lock
   */
  abstract status(path?: string, noLock?: boolean, skipNotification?: boolean): Promise<GitStatus>;

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
   * @param options - Additional fetch options (e.g., ['--prune'])
   */
  abstract fetch(remote: string, options?: string[]): Promise<void>;

  /**
   * Pull from remote branch
   * @param remote - Remote name (e.g., 'origin')
   * @param branch - Branch name
   * @param rebase - Whether to use rebase instead of merge
   */
  abstract pull(remote: string, branch: string, rebase?: boolean): Promise<void>;

  /**
   * Push to remote branch
   * @param remote - Remote name (e.g., 'origin')
   * @param refspec - Refspec (e.g., 'main:main')
   * @param options - Additional options (e.g., ['--tags'])
   * @returns Push result with stdout/stderr output
   */
  abstract push(remote: string, refspec: string, options?: string[]): Promise<string>;

  /**
   * Create a stash
   * @param message - Stash message
   * @param filePaths - Optional array of file paths to stash (if not provided, stashes all changes)
   * @param keepChanges - If true, keep the stashed changes in the working directory (re-applies the stash after creating it)
   */
  abstract stashPush(message: string, filePaths?: string[] | null, keepChanges?: boolean): Promise<void>;

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
   * Stage every change in the working tree (git add -A). Use for "stage all"
   * instead of enumerating individual paths — far faster and avoids hitting the
   * command-line length limit on large working trees.
   */
  abstract addAll(): Promise<void>;

  /**
   * Unstage files
   * @param filePaths - Path to file or array of file paths
   */
  abstract reset(filePaths: string | string[]): Promise<void>;

  /**
   * Unstage everything (git reset). Use for "unstage all" instead of enumerating
   * individual paths.
   */
  abstract resetAll(): Promise<void>;

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
   * Get raw file content at a specific revision
   * @param revision - The revision (e.g., 'HEAD', 'HEAD~1', 'commit hash')
   * @param filePath - Path to the file
   */
  abstract getFileContentAtRevision(revision: string, filePath: string): Promise<string>;

  /**
   * Read file from filesystem as binary
   * @param filePath - Path to the file relative to repo root
   */
  abstract readFileBinary(filePath: string): Promise<string>;

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
   * Checkout a branch or commit
   * @param ref - Branch name or commit hash
   */
  abstract checkout(ref: string): Promise<void>;

  /**
   * Checkout a branch
   * @param branchName - Name of the branch to checkout
   */
  abstract checkoutBranch(branchName: string): Promise<void>;

  /**
   * List the commit log for a branch
   * @param branchName - Name of the branch
   * @param maxCount - Maximum number of commits to retrieve
   * @param offset - Number of commits to skip from the start (for paging)
   */
  abstract log(branchName: string, maxCount: number, offset?: number): Promise<Commit[]>;

  /**
   * Count the total number of commits reachable from a branch tip.
   * @param branchName - Name of the branch
   */
  abstract getCommitCount(branchName: string): Promise<number>;

  /**
   * Search the commit log of a branch using server-side git filters.
   * `sha` is applied as a post-filter since `git log` doesn't take a SHA-prefix flag.
   * @param branchName - Name of the branch to search
   * @param query - Search criteria (message/author/sha/date range)
   * @param maxResults - Maximum number of results before truncation
   */
  abstract searchLog(branchName: string, query: SearchQuery, maxResults?: number): Promise<SearchLogResult>;

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

  /**
   * Get the merge base between two branches
   * @param branch1 - First branch
   * @param branch2 - Second branch
   */
  abstract getMergeBase(branch1: string, branch2: string): Promise<string | null>;

  /**
   * Check if Git LFS is initialized in the repository
   */
  abstract isLfsInitialized(): Promise<boolean>;

  /**
   * Initialize Git LFS in the repository
   */
  abstract lfsInstall(): Promise<void>;

  /**
   * Add a file pattern to track with Git LFS
   * @param pattern - File pattern to track (e.g., "*.psd")
   */
  abstract lfsTrack(pattern: string): Promise<void>;

  /**
   * Get Git LFS status
   */
  abstract lfsStatus(): Promise<string>;

  /**
   * Fetch Git LFS objects
   */
  abstract lfsFetch(): Promise<void>;

  /**
   * Pull Git LFS objects
   */
  abstract lfsPull(): Promise<void>;

  /**
   * Prune old Git LFS objects
   */
  abstract lfsPrune(): Promise<void>;

  /**
   * Uninstall Git LFS from the repository
   */
  abstract lfsUninstall(): Promise<void>;

  /**
   * Merge a branch into the current branch
   * @param branchName - Name of the branch to merge into current branch
   */
  abstract merge(branchName: string): Promise<void>;

  /**
   * Rebase current branch onto another branch
   * @param branchName - Name of the branch to rebase onto
   */
  abstract rebase(branchName: string): Promise<void>;

  /**
   * Add pattern to .gitignore file
   */
  abstract addToGitignore(pattern: string): Promise<void>;

  /**
   * Check if a file is already ignored by .gitignore
   */
  abstract isIgnored(filePath: string): Promise<boolean>;

  /**
   * Get contents of .gitignore file
   */
  abstract getGitignoreContents(): Promise<string>;

  /**
   * Get labels for conflict sources (ours/theirs) when in merge or rebase.
   * Returns null if not in a conflicted state.
   */
  abstract getConflictSources(): Promise<{ oursLabel: string; theirsLabel: string } | null>;

  /**
   * Get file content from conflict index (stage 2 = ours, stage 3 = theirs).
   */
  abstract getConflictVersionContent(filePath: string, version: 'ours' | 'theirs'): Promise<string>;

  /**
   * Resolve conflict by keeping one version and staging the file.
   */
  abstract resolveConflictWithVersion(filePath: string, version: 'ours' | 'theirs'): Promise<void>;

  /**
   * Run mergetool for path (or all conflicted files if path omitted).
   * @param filePath - Conflicted file path (optional)
   * @param tool - Mergetool name (e.g. 'vscode', 'cursor', 'winmerge')
   */
  abstract runMergetool(filePath?: string, tool?: string): Promise<void>;

  /**
   * Get the state of an in-progress rebase, or null if no rebase is active.
   */
  abstract getRebaseStatus(): Promise<RebaseStatus | null>;

  /**
   * Continue an in-progress rebase after conflicts have been resolved and staged.
   */
  abstract rebaseContinue(): Promise<void>;

  /**
   * Abort an in-progress rebase, restoring the branch to its pre-rebase state.
   */
  abstract rebaseAbort(): Promise<void>;

  /**
   * Skip the current commit of an in-progress rebase.
   */
  abstract rebaseSkip(): Promise<void>;

  /**
   * List all worktrees attached to this repository, including the main worktree.
   */
  abstract listWorktrees(): Promise<WorktreeInfo[]>;

  /**
   * Add a new worktree at the given path.
   * @param worktreePath - Absolute path where the new worktree directory is created
   * @param ref - Branch name or commit to check out in the worktree
   * @param options - newBranch: create `ref` as a new branch (git worktree add -b);
   *                   startPoint: when creating a new branch, the commit/branch to start from;
   *                   force: allow checking out a branch already checked out elsewhere, or
   *                   creating the worktree in a non-empty directory
   */
  abstract addWorktree(
    worktreePath: string,
    ref: string,
    options?: { newBranch?: boolean; startPoint?: string; force?: boolean }
  ): Promise<void>;

  /**
   * Remove a worktree.
   * @param worktreePath - Path of the worktree to remove
   * @param force - Pass --force to remove a worktree with uncommitted changes or that is locked
   */
  abstract removeWorktree(worktreePath: string, force?: boolean): Promise<void>;

  /**
   * Prune worktree administrative entries whose directories are gone.
   */
  abstract pruneWorktrees(): Promise<void>;

  /**
   * Lock a worktree so it can't be pruned or removed without --force.
   * @param worktreePath - Path of the worktree to lock
   * @param reason - Optional human-readable reason stored with the lock
   */
  abstract lockWorktree(worktreePath: string, reason?: string): Promise<void>;

  /**
   * Unlock a previously locked worktree.
   * @param worktreePath - Path of the worktree to unlock
   */
  abstract unlockWorktree(worktreePath: string): Promise<void>;

  /**
   * Move a worktree to a new location.
   * @param worktreePath - Current path of the worktree
   * @param newPath - Destination path
   */
  abstract moveWorktree(worktreePath: string, newPath: string): Promise<void>;
}

export default GitAdapter;