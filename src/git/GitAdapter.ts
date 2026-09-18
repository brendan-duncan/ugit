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

// Progress event emitted while a clone (or other transfer) is in flight.
export interface CloneProgress {
  // The git operation, e.g. 'clone', 'receiving', 'resolving'.
  method: string;
  // The current stage, e.g. 'receiving objects', 'resolving deltas'.
  stage: string;
  // Completion percentage for the current stage (0-100).
  progress: number;
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

  // True when the stash captured untracked files (they are stored in a third
  // parent commit). Only populated by `stashList`.
  hasUntracked?: boolean;
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
  // Signature status as `git log %G?` reports it: 'G' good, 'B' bad, 'U' good but
  // of unknown trust, 'X' good but expired, 'Y' made by an expired key, 'R' made
  // by a revoked key, 'E' couldn't be checked, 'N' unsigned. Absent when the log
  // that produced this commit didn't ask about signatures.
  signature?: string;
  // Who the signature says signed it, when git could tell.
  signer?: string;
}

/**
 * Thrown when git could only read part of a branch's history, for example when an
 * object referenced by the history is missing from the object database. `commits`
 * holds the commits that were read before git gave up, so the caller can still show
 * what history is available.
 */
export class IncompleteHistoryError extends Error {
  constructor(message: string, public readonly commits: Commit[]) {
    super(message);
    this.name = 'IncompleteHistoryError';
  }
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

/** One entry of `git reflog`: somewhere a ref used to point. */
export interface ReflogEntry {
  // The selector git accepts for this point, e.g. 'HEAD@{2}'.
  selector: string;
  hash: string;
  // The operation that moved the ref, e.g. 'commit', 'rebase (finish)', 'checkout'.
  action: string;
  // What git recorded about the move, e.g. 'moving from main to feature'.
  message: string;
  date: string;
  author: string;
  // Subject of the commit the entry points at.
  subject: string;
}

/** One entry of a tree listing at some revision. */
export interface TreeEntry {
  // Name within the directory that was listed.
  name: string;
  // Path from the repository root.
  path: string;
  // 'commit' is a submodule reference.
  type: 'blob' | 'tree' | 'commit';
  hash: string;
  mode: string;
  // Size in bytes for a blob; null for trees and submodules.
  size: number | null;
}

export interface SubmoduleInfo {
  // Path of the submodule within the superproject.
  path: string;
  url: string;
  // The commit the superproject records for it.
  hash: string;
  // Branch from .gitmodules, when one is configured.
  branch: string | null;
  // False when it has never been initialized or cloned, which git marks with '-'.
  initialized: boolean;
  // True when the checked-out commit isn't the recorded one ('+').
  modified: boolean;
  // True when the submodule is in a merge conflict ('U').
  conflicted: boolean;
  // The ref git names in parentheses, e.g. 'v1.2.0' or 'heads/main'.
  describe: string | null;
}

export interface BisectStatus {
  // The commit checked out for testing.
  currentHash: string | null;
  currentSubject: string | null;
  // The revision marked bad, when one has been.
  badRef: string | null;
  // Revisions marked good.
  goodRefs: string[];
  // The branch or commit bisect started from, restored by `git bisect reset`.
  startRef: string | null;
  // git's own note on what's left, e.g. '3 revisions left to test after this
  // (roughly 2 steps)'. Only known right after a start or a mark.
  progress: string | null;
  // True once git has named the first bad commit; bisect still needs resetting.
  finished: boolean;
  firstBadHash: string | null;
}

/** How this repository signs commits and tags. */
export interface SigningConfig {
  // git config commit.gpgsign
  signCommits: boolean;
  // git config tag.gpgsign
  signTags: boolean;
  // git config gpg.format: 'openpgp', 'ssh' or 'x509'.
  format: string;
  // git config user.signingkey
  key: string;
}

/** git-flow branch names and prefixes, as stored in the repository's config. */
export interface FlowConfig {
  // True when this repository has been set up for git-flow.
  initialized: boolean;
  // The long-lived branches.
  master: string;
  develop: string;
  // Prefixes for the short-lived ones, including the trailing separator.
  feature: string;
  release: string;
  hotfix: string;
  // Prefix put in front of a release's tag name.
  versionTag: string;
}

/** The kinds of git-flow branch ugit can start and finish. */
export type FlowKind = 'feature' | 'release' | 'hotfix';

/** A stash, as the commit it really is, so it can be placed in history. */
export interface StashCommit {
  // Position in the stash list; 0 is the most recent.
  index: number;
  // 'stash@{0}'
  selector: string;
  hash: string;
  // The commit the stash was made on top of - where it sits in history.
  parentHash: string;
  message: string;
  date: string;
}

/** What an interactive rebase should do with one commit. */
export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';

/** One line of an interactive rebase's todo list, in the order it should run. */
export interface RebaseTodoEntry {
  action: RebaseAction;
  hash: string;
  // The commit's subject, for the todo line's comment.
  subject: string;
  // For 'reword', the message to use instead. For 'squash', the message for the
  // commit the changes are folded into. Ignored for the other actions.
  message?: string;
}

/**
 * One line of `git blame` output, with the commit that last touched it.
 */
export interface BlameLine {
  // 1-based line number in the revision that was blamed.
  line: number;
  // Full hash of the commit that last touched this line. A hash of all zeroes
  // means the line is a local modification that isn't committed yet.
  hash: string;
  author: string;
  authorMail: string;
  // Author time as 'YYYY-MM-DD HH:mm:ss'.
  date: string;
  // Subject line of the commit.
  summary: string;
  // Line number this line had in `origPath` at `hash`.
  origLine: number;
  // Path the file had at `hash`, which differs from the blamed path when the
  // file has since been renamed.
  origPath: string;
  // The text of the line, without its newline.
  content: string;
  // True for the first line of each run of consecutive lines from the same
  // commit, so the view can draw one heading per run.
  isGroupStart: boolean;
  // The commit and path this line came from before `hash` touched it, when git
  // knows them. Lets "blame previous revision" follow renames exactly instead
  // of guessing at `hash^`.
  previousHash?: string;
  previousPath?: string;
}

/** A commit from a path-scoped log, plus how the path itself changed in it. */
export interface FileHistoryEntry {
  commit: Commit;
  // Status of the path in this commit ('M', 'A', 'D', 'R'...), or '' if unknown.
  status: string;
  // The path as it was named in this commit. Differs from the requested path for
  // commits from before a rename, when the log is following renames.
  path: string;
  // Where the path was renamed from, when this commit renamed it.
  renamedFrom?: string;
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

export interface TagComparison {
  // Tags the remote doesn't have at all. These can be pushed as-is.
  toPush: string[];
  // Tags the remote already has, but pointing at a different commit than the local
  // tag. Pushing these is rejected by git with "(already exists)" unless forced,
  // which would rewrite the remote tag, so they are skipped and reported instead.
  conflicting: string[];
  // Tags the remote already has at the same commit. Nothing to do for these.
  upToDate: string[];
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
   * Fetch from remote. Throws if git fails, so callers must handle failure rather
   * than assume the remote-tracking refs moved.
   * @param remote - Remote name (e.g., 'origin')
   * @param options - Additional fetch options (e.g., ['--prune'])
   */
  abstract fetch(remote: string, options?: string[]): Promise<void>;

  /**
   * Fetch unless another git command is already running against this repository,
   * in which case do nothing and return false. Use this for polling: a dropped
   * tick is cheaper than a queue of fetches behind a long-running command.
   */
  abstract fetchIfIdle(remote: string, options?: string[]): Promise<boolean>;

  /**
   * SHA a remote currently has for a branch, or null if it doesn't have it.
   * One round trip with no object transfer - use this, not a fetch, when the
   * answer only feeds an ahead/behind indicator.
   */
  abstract getRemoteHeadSha(remote: string, branch: string): Promise<string | null>;

  /** Whether this process has a git command queued or running for this repository. */
  abstract isRepoBusy(): Promise<boolean>;

  /**
   * Repack the object database and refresh the commit-graph. Can take minutes on a
   * large repository, and throws if git fails. Deliberately does not prune.
   */
  abstract gc(): Promise<void>;

  /**
   * Abandoned pack temporaries left behind by fetches that died mid-transfer, older
   * than `minAgeMs`. Git never reclaims these itself.
   */
  abstract findStalePackTemps(minAgeMs?: number): Promise<{ files: string[]; bytes: number }>;

  /** Delete the files reported by findStalePackTemps. */
  abstract removeStalePackTemps(minAgeMs?: number): Promise<{ removed: number; bytes: number }>;

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
   * @param refspec - Refspec (e.g., 'main:main'), or several to push in one command
   * @param options - Additional options (e.g., ['--tags'])
   * @returns Push result with stdout/stderr output
   */
  abstract push(remote: string, refspec: string | string[], options?: string[]): Promise<string>;

  /**
   * Compare local tags against the tags the remote already has, so a tag push can
   * skip the ones that would be rejected instead of failing the whole push.
   * Annotated tags are peeled, so a local annotated tag and a remote lightweight
   * tag on the same commit count as up to date.
   * @param remote - Remote name (e.g., 'origin')
   */
  abstract compareTags(remote: string): Promise<TagComparison>;

  /**
   * Push the named tags to a remote. Sent in batches so repositories with a large
   * number of tags don't overflow the OS command line length limit.
   * @param remote - Remote name (e.g., 'origin')
   * @param tags - Short tag names (e.g., ['v1.5.1', 'v1.6.0'])
   * @returns Combined push output of every batch
   */
  async pushTags(remote: string, tags: string[]): Promise<string> {
    const batchSize = 100;
    const output: string[] = [];
    for (let i = 0; i < tags.length; i += batchSize) {
      const batch = tags.slice(i, i + batchSize).map(tag => `refs/tags/${tag}`);
      output.push(await this.push(remote, batch));
    }
    return output.join('\n');
  }

  /**
   * Reset the named local tags to the commits the remote has them on. Tags are the
   * one ref type git refuses to update on a plain fetch, so a tag that was moved or
   * recreated on the remote stays stale locally forever without --force.
   *
   * Only the named refs are fetched, never every tag: a wildcard force fetch with
   * pruning would also delete local-only tags that have never been pushed.
   * Sent in batches for the same command line length reason as pushTags().
   *
   * @param remote - Remote name (e.g., 'origin')
   * @param tags - Short tag names (e.g., ['v1.5.1', 'v1.6.0'])
   */
  async syncTags(remote: string, tags: string[]): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < tags.length; i += batchSize) {
      const batch = tags.slice(i, i + batchSize)
        .map(tag => `refs/tags/${tag}:refs/tags/${tag}`);
      await this.fetch(remote, ['--force', ...batch]);
    }
  }

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
   * @throws IncompleteHistoryError when git failed part way through the log but had
   * already produced usable commits
   */
  abstract log(branchName: string, maxCount: number, offset?: number): Promise<Commit[]>;

  /**
   * Count the total number of commits reachable from a branch tip.
   * @param branchName - Name of the branch
   */
  abstract getCommitCount(branchName: string): Promise<number>;

  /**
   * Read the reflog: where a ref has pointed, newest first. Lets commits that
   * nothing references any more be found again.
   * @param ref - The ref to read, e.g. 'HEAD' (the default) or a branch name
   * @param maxCount - Maximum number of entries
   */
  abstract getReflog(ref?: string, maxCount?: number): Promise<ReflogEntry[]>;

  /**
   * List one directory of the tree at a revision, so a whole revision can be
   * browsed a level at a time.
   * @param revision - Commit, branch or tag to read the tree from
   * @param dirPath - Directory to list, or '' for the repository root
   */
  abstract getTreeAtRevision(revision: string, dirPath?: string): Promise<TreeEntry[]>;

  /**
   * Apply a patch with `git apply`, for staging or discarding part of a file.
   * @param patch - A unified diff
   * @param options - `cached` applies to the index only, `reverse` undoes the
   * patch instead of applying it
   * @throws when the patch doesn't apply
   */
  abstract applyPatch(patch: string, options?: { cached?: boolean; reverse?: boolean }): Promise<void>;

  /** List the submodules of this repository. */
  abstract listSubmodules(): Promise<SubmoduleInfo[]>;

  /**
   * Register submodules in .git/config so they can be updated.
   * @param submodulePath - One submodule, or every one when omitted
   */
  abstract submoduleInit(submodulePath?: string): Promise<void>;

  /**
   * Check out the commits the superproject records for its submodules.
   * @param submodulePath - One submodule, or every one when omitted
   * @param options - `init` registers submodules first, `recursive` descends into
   * submodules of submodules
   */
  abstract submoduleUpdate(submodulePath?: string,
                           options?: { init?: boolean; recursive?: boolean }): Promise<void>;

  /**
   * Copy the URLs from .gitmodules into .git/config, after a remote has moved.
   * @param submodulePath - One submodule, or every one when omitted
   */
  abstract submoduleSync(submodulePath?: string): Promise<void>;

  /** Read how this repository signs commits and tags. */
  abstract getSigningConfig(): Promise<SigningConfig>;

  /**
   * Change how this repository signs commits and tags. Only the fields present
   * are written; the repository's own config is used, not the global one.
   */
  abstract setSigningConfig(config: Partial<SigningConfig>): Promise<void>;

  /** The state of a bisect in progress, or null when there isn't one. */
  abstract getBisectStatus(): Promise<BisectStatus | null>;

  /**
   * Start bisecting.
   * @param badRef - A revision where the problem is present
   * @param goodRef - A revision where it isn't
   */
  abstract bisectStart(badRef?: string, goodRef?: string): Promise<BisectStatus | null>;

  /**
   * Mark the commit being tested, and check out the next one to test.
   * @param mark - 'good', 'bad', or 'skip' when it can't be tested
   */
  abstract bisectMark(mark: 'good' | 'bad' | 'skip'): Promise<BisectStatus | null>;

  /** End the bisect and go back to where it started. */
  abstract bisectReset(): Promise<void>;

  /** Read this repository's git-flow branch names and prefixes. */
  abstract getFlowConfig(): Promise<FlowConfig>;

  /**
   * Set up git-flow: store the branch names and prefixes, and create the
   * development branch when it doesn't exist yet.
   */
  abstract flowInit(config: Partial<FlowConfig>): Promise<void>;

  /**
   * Start a git-flow branch and check it out.
   * @param kind - Which kind of branch to start
   * @param name - The part after the prefix, e.g. 'login-form' or '1.4.0'
   * @returns The full name of the branch that was created
   */
  abstract flowStart(kind: FlowKind, name: string): Promise<string>;

  /**
   * Finish a git-flow branch: merge it where it belongs, tag a release or hotfix,
   * and delete the branch.
   *
   * Stops at the first merge that conflicts, leaving the repository mid-merge for
   * the conflict to be resolved by hand.
   *
   * @param kind - Which kind of branch is being finished
   * @param name - The part after the prefix
   * @param options - `tag` names the tag for a release or hotfix (defaults to the
   * version tag prefix plus `name`), `keepBranch` leaves the branch in place
   * @throws when the working directory isn't clean, or a merge conflicts
   */
  abstract flowFinish(kind: FlowKind, name: string,
                      options?: { tag?: string; tagMessage?: string; keepBranch?: boolean }): Promise<void>;

  /**
   * List the stashes as the commits they are, with the commit each was made on,
   * so they can be shown in the history they belong to.
   */
  abstract getStashCommits(): Promise<StashCommit[]>;

  /**
   * Read a file from the working directory as text.
   * @param filePath - Path relative to the repository root
   */
  abstract readWorkingFile(filePath: string): Promise<string>;

  /**
   * Write a file in the working directory, replacing what's there.
   * @param filePath - Path relative to the repository root
   * @param content - The new contents
   */
  abstract writeWorkingFile(filePath: string, content: string): Promise<void>;

  /**
   * List the commits in a range, newest first.
   * @param fromRef - Exclusive start of the range, or null for the root commit
   * (every commit reachable from `toRef`)
   * @param toRef - Inclusive end of the range. Defaults to HEAD.
   */
  abstract getCommitRange(fromRef: string | null, toRef?: string): Promise<Commit[]>;

  /**
   * Replay a range of commits with per-commit actions - an interactive rebase,
   * driven by `entries` instead of by an editor.
   *
   * Returns once git is done with the todo list it was given. A rebase that stops
   * for a conflict or an 'edit' step also returns normally, leaving the rebase in
   * progress for the caller to report; `getRebaseStatus` says whether that
   * happened.
   *
   * @param baseRef - The commit to replay onto, or null to rebase from the root
   * @param entries - Todo lines in the order they should run
   * @throws when the todo list can't be run at all, e.g. a leading squash
   */
  abstract rebaseInteractive(baseRef: string | null, entries: RebaseTodoEntry[]): Promise<void>;

  /**
   * List the commits that touched a single path, newest first.
   * @param filePath - Path relative to the repository root (file or directory)
   * @param maxCount - Maximum number of commits to retrieve
   * @param offset - Number of commits to skip from the start (for paging)
   * @param follow - Follow the path through renames. Only valid for a single
   * file; git rejects it for directories, so callers pass false for those.
   * @param startRef - Commit or branch to start the history from. Defaults to HEAD.
   */
  abstract fileLog(filePath: string, maxCount?: number, offset?: number,
                   follow?: boolean, startRef?: string): Promise<FileHistoryEntry[]>;

  /**
   * Count the commits that touched a single path.
   * @param filePath - Path relative to the repository root
   * @param follow - Follow the path through renames (single files only)
   * @param startRef - Commit or branch to count from. Defaults to HEAD.
   */
  abstract getFileCommitCount(filePath: string, follow?: boolean, startRef?: string): Promise<number>;

  /**
   * Blame a file: which commit last touched each line.
   * @param filePath - Path relative to the repository root
   * @param revision - Revision to blame. Defaults to the working tree, which
   * marks uncommitted lines with an all-zero hash.
   * @throws when the path doesn't exist at that revision, or is binary
   */
  abstract blame(filePath: string, revision?: string): Promise<BlameLine[]>;

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
   * Create a patch file from a stash entry
   * @param stashIndex - The stash index
   * @param outputPath - Path where to save the patch file
   * @param includeUntracked - Whether to include the stash's untracked files in the patch
   * @returns False if the stash produced an empty patch, in which case no file is written
   */
  abstract createStashPatch(stashIndex: number, outputPath: string, includeUntracked?: boolean): Promise<boolean>;

  /**
   * Clone a repository
   * @param repoUrl - Repository URL to clone
   * @param parentFolder - Parent directory where repository should be cloned
   * @param repoName - Name of the directory to create
   * @param onProgress - Optional callback invoked with transfer progress events
   * @param depth - Optional shallow-clone depth; 0/undefined performs a full clone
   */
  abstract clone(
    repoUrl: string,
    parentFolder: string,
    repoName: string,
    onProgress?: (progress: CloneProgress) => void,
    depth?: number
  ): Promise<void>;

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
   * Get the patterns currently tracked by Git LFS (parsed from .gitattributes).
   */
  abstract getLfsTrackPatterns(): Promise<string[]>;

  /**
   * Get the on-disk size in bytes of one or more working-tree files.
   * @param filePaths - Repo-relative file paths
   * @returns Map of repo-relative path to size in bytes (0 if missing/unreadable)
   */
  abstract getFileSizes(filePaths: string[]): Promise<Record<string, number>>;

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