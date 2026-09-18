import simpleGit, { SimpleGit } from 'simple-git';
import GitAdapter, {
  Commit,
  CommandStateCallback,
  GitStatus,
  BranchInfo,
  StashInfo,
  StashListResponse,
  CommitFile,
  RebaseStatus,
  SearchQuery,
  SearchLogResult,
  WorktreeInfo,
  TagComparison,
  CloneProgress,
  BlameLine,
  FileHistoryEntry,
  RebaseTodoEntry,
  IncompleteHistoryError } from './GitAdapter';
import { GitCommandError, gitErrorHandler } from './gitErrors';
import { withGitLock, isGitBusy } from './gitQueue';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Separators for the `git log` format used by log(). Both are control characters that
// can't appear in a commit message, so a body containing newlines - or a `git log` that
// stops mid-commit - can't be mistaken for the end of a record.
const LOG_FIELD_SEP = '\x1f';
const LOG_RECORD_SEP = '\x1e';
const LOG_FORMAT = ['%H', '%ai', '%s', '%b', '%an', '%ae'].join('%x1f') + '%x1e';
// Same fields, but with the record separator leading instead of trailing, so the
// --name-status lines that follow a record stay attached to the commit they
// belong to when the output is split on the separator.
// Interactive rebase todo lists and message files live in temp directories with
// this prefix, so stale ones can be recognized and swept up later.
const REBASE_TEMP_PREFIX = 'ugit-rebase-';
const FILE_LOG_FORMAT = '%x1e' + ['%H', '%ai', '%s', '%b', '%an', '%ae'].join('%x1f');

/** A commit's details as `git blame --porcelain` spells them out once. */
interface BlameCommitInfo {
  author: string;
  authorMail: string;
  date: string;
  summary: string;
  filename: string;
  previousHash?: string;
  previousPath?: string;
}

/** The header block being accumulated for the blame line that follows it. */
interface BlameHeader {
  hash: string;
  origLine: number;
  line: number;
  hasTime: boolean;
  author?: string;
  authorMail?: string;
  summary?: string;
  filename?: string;
  previousHash?: string;
  previousPath?: string;
}

/**
 * Git adapter implementation using simple-git library
 */
export class SimpleGitAdapter extends GitAdapter {
  private git: SimpleGit | null = null;
  /** Cached `git rev-parse --git-common-dir`: the object database of this repo. */
  private commonDir: string | null = null;

  constructor(repoPath: string, commandStateCallback: CommandStateCallback | null = null) {
    super(repoPath, commandStateCallback);
  }

  /**
   * Path to this repository's object database (shared by all its worktrees).
   *
   * Falls back to the worktree path if the probe fails (not a repo yet, or a git
   * older than --path-format); that still serializes this tab's own commands.
   */
  private async getCommonDir(): Promise<string> {
    if (this.commonDir)
      return this.commonDir;

    let dir = this.repoPath;
    try {
      const out = await this.git.raw(['rev-parse', '--path-format=absolute', '--git-common-dir']);
      if (out.trim())
        dir = out.trim();
    } catch {
      // Keep the worktree-path fallback.
    }
    this.commonDir = dir;
    return this.commonDir;
  }

  /**
   * Queue key for this repository: the object database, not the worktree. Worktrees
   * share one database, so two tabs open on two worktrees must share a queue -
   * keying on the worktree path would let each think it had the repository alone.
   */
  private async getObjectStoreKey(): Promise<string> {
    const dir = await this.getCommonDir();
    return process.platform === 'win32' ? dir.toLowerCase() : dir;
  }

  /** Whether this process is already running a queued git command against this repo. */
  async isRepoBusy(): Promise<boolean> {
    return isGitBusy(await this.getObjectStoreKey());
  }

  async open(): Promise<void> {
    this.git = simpleGit({ baseDir: this.repoPath, errors: gitErrorHandler });
    this.isOpen = true;
  }

  async init(branchName?: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git init', startTime);
    try {
      const git = simpleGit({ baseDir: this.repoPath, errors: gitErrorHandler });
      await git.init();
      if (branchName) {
        // Point the unborn HEAD at the requested branch. This works regardless of
        // the git version or whether any commits exist yet.
        await git.raw(['symbolic-ref', 'HEAD', `refs/heads/${branchName}`]);
      }
    } catch (error) {
      console.error('Error initializing repository:', error);
    }
    this._endCommand(id, startTime);
  }

  async status(path?: string, noLock?: boolean, skipNotification?: boolean): Promise<GitStatus> {  
    const startTime = performance.now();
    const id = skipNotification ? -1 : this._startCommand('git status', startTime);
    let result: any = null;
    try {
      if (path) {
        if (noLock) {
          const git2 = simpleGit({ baseDir: this.repoPath, errors: gitErrorHandler }).env({'GIT_OPTIONAL_LOCKS': '0'});
          result = await git2.raw(['status', '--', path]);
        } else {
          result = await this.git!.raw(['status', '--', path]);
        }
      } else {
        if (noLock) {
          const git2 = simpleGit({ baseDir: this.repoPath, errors: gitErrorHandler }).env({'GIT_OPTIONAL_LOCKS': '0'});
          result = await git2.status();
        } else {
          result = await this.git.status();
        }
      }
    } catch (error) {
      console.error('Error getting status:', error);
    }
    if (!skipNotification) {
      this._endCommand(id, startTime);
    }
    this.currentBranch = result?.current || null; // Track current branch
    return {
      notAdded: result?.not_added || [],
      conflicted: result?.conflicted || [],
      created: result?.created || [],
      deleted: result?.deleted || [],
      ignored: result?.ignored || [],
      modified: result?.modified || [],
      renamed: result?.renamed || [],
      staged: result?.staged || [],
      ahead: result?.ahead || 0,
      behind: result?.behind || 0,
      current: result?.current || '',
      tracking: result?.tracking || '',
      detached: result?.detached || false,
      files: result?.files || []
    };
  }

  async branchLocal(): Promise<BranchInfo> {
    const startTime = performance.now();
    const id = this._startCommand('git branch --list', startTime);
    let result: BranchInfo | null = null;
    try {
      result = await this.git.branchLocal();
    } catch (error) {
      console.error('Error getting local branches:', error);
    }
    this._endCommand(id, startTime);
    return result || { all: [] };
  }

  async createBranch(branchName: string, startPoint: string | null = null): Promise<void> {   
    const startTime = performance.now();
    let id: number;
    try {
      if (startPoint) {
        id = this._startCommand(`git branch ${branchName} ${startPoint}`, startTime);
        await this.git.branch([branchName, startPoint]);
        this._endCommand(id, startTime);
      } else {
        id = this._startCommand(`git branch ${branchName}`, startTime);
        await this.git.branch([branchName]);
        this._endCommand(id, startTime);
      }
    } catch (error) {
      this._endCommand(id!, startTime);
      console.error(`Error creating branch ${branchName}:`, error);
      throw error;
    }
  }

  async getAheadBehind(localBranch: string, remoteBranch: string): Promise<{ ahead: number; behind: number }> {
    const startTime = performance.now();
    let id: number;
    try {
      id = this._startCommand(`git rev-list --left-right --count ${localBranch}...${remoteBranch}`, startTime);
      const result = await this.git.raw(['rev-list', '--left-right', '--count', `${localBranch}...${remoteBranch}`]);
      this._endCommand(id, startTime);
      const [ahead, behind] = result.trim().split('\t').map(Number);
      return { ahead, behind };
    } catch (error) {
      this._endCommand(id!, startTime);
      return { ahead: -1, behind: -1 };
    }
  }

  async getOriginUrl(): Promise<string> {
    const startTime = performance.now();
    let id: number;
    try {
      id = this._startCommand('git remote get-url origin', startTime);
      const result = await this.git.raw(['remote', 'get-url', 'origin']);
      this._endCommand(id, startTime);
      return result.trim();
    } catch (error) {
      this._endCommand(id!, startTime);
      return '';
    }
  }

  async setRemoteUrl(remoteName: string, url: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git remote set-url ${remoteName} ${url}`, startTime);
    try {
      await this.git.raw(['remote', 'set-url', remoteName, url]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error setting remote URL for ${remoteName}:`, error);
      throw error;
    }
  }

  async addRemote(remoteName: string, url: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git remote add ${remoteName} ${url}`, startTime);
    try {
      await this.git.raw(['remote', 'add', remoteName, url]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error adding remote ${remoteName}:`, error);
      throw error;
    }
  }

  async removeRemote(remoteName: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git remote remove ${remoteName}`, startTime);
    try {
      await this.git.raw(['remote', 'remove', remoteName]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error removing remote ${remoteName}:`, error);
      throw error;
    }
  }

  async editRemote(remoteName: string, newUrl: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git remote set-url ${remoteName} ${newUrl}`, startTime);
    try {
      await this.git.raw(['remote', 'set-url', remoteName, newUrl]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error editing remote ${remoteName}:`, error);
      throw error;
    }
  }

  async resetToOrigin(branch: string): Promise<void> {
    const startTime = performance.now();
    let idFetch: number;
    let idReset: number;
    try {
      // Fetch latest from origin
      idFetch = this._startCommand('git fetch origin --prune', startTime);
      await this.git.fetch('origin', ['--prune']);
      this._endCommand(idFetch, startTime);

      // Hard reset to origin/branch
      idReset = this._startCommand(`git reset --hard origin/${branch}`, startTime);
      await this.git.raw(['reset', '--hard', `origin/${branch}`]);
      this._endCommand(idReset, startTime);
    } catch (error) {
      this._endCommand(idFetch!, startTime);
      this._endCommand(idReset!, startTime);
      console.error(`Error resetting to origin/${branch}:`, error);
      throw error;
    }
  }

  async stashList(): Promise<StashListResponse> {
    const startTime = performance.now();
    const id = this._startCommand('git stash list', startTime);
    let result: any = null;
    try {
      result = await this.git.stashList();
    } catch (error) {
      console.error('Error getting stash list:', error);
    }
    this._endCommand(id, startTime);
    
    // Convert simple-git stash list format to our interface
    const stashItems = result?.all || [];
    const parentCounts = stashItems.length > 0 ? await this._stashParentCounts() : [];
    return {
      all: stashItems.map((item: any, index: number) => ({
        hash: item.hash || '',
        message: item.message || '',
        // A stash that captured untracked files stores them in a third parent commit.
        hasUntracked: (parentCounts[index] || 0) >= 3
      }))
    };
  }

  /**
   * Number of parents of each stash entry, in the same order as `git stash list`.
   */
  private async _stashParentCounts(): Promise<number[]> {
    const startTime = performance.now();
    const id = this._startCommand('git stash list --format=%P', startTime);
    let counts: number[] = [];
    try {
      const output = await this.git.raw(['stash', 'list', '--format=%P']);
      counts = output.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.trim().split(/\s+/).length);
    } catch (error) {
      console.error('Error getting stash parents:', error);
    }
    this._endCommand(id, startTime);
    return counts;
  }

  async fetch(remote: string, options?: string[]): Promise<void> {
    const startTime = performance.now();
    const optionsStr = options ? ` ${options.join(' ')}` : '';
    const id = this._startCommand(`git fetch ${remote}${optionsStr}`, startTime);
    try {
      // gc.auto=0: a fetch otherwise kicks off `gc --auto` on completion, which can
      // start a repack that outlives this command and overlaps the next fetch.
      // Maintenance is the user's call - see gc() - not a side effect of polling.
      await withGitLock(await this.getObjectStoreKey(), () =>
        this.git.raw(['-c', 'gc.auto=0', 'fetch', remote, ...(options || [])]));
    } catch (error) {
      console.error(`Error fetching from ${remote}:`, error);
      // Rethrow: swallowing this reported failed fetches as clean ones, so callers
      // showed stale ahead/behind counts and polling retried forever in silence.
      throw error;
    } finally {
      this._endCommand(id, startTime);
    }
  }

  /**
   * Fetch unless a queued git command is already running, in which case report the
   * tick as skipped. Polling should drop a tick rather than stack up behind a
   * repack or a long fetch - that queue is how five-minute polls turn into a
   * permanent backlog on a large repository.
   */
  async fetchIfIdle(remote: string, options?: string[]): Promise<boolean> {
    if (await this.isRepoBusy())
      return false;
    await this.fetch(remote, options);
    return true;
  }

  /**
   * SHA a remote currently has for `branch`, or null if the remote doesn't have it.
   *
   * This is the cheap way to answer "has the remote moved?": one round trip, no
   * object transfer, no pack writes, and it cannot trigger maintenance. Prefer it
   * over a fetch whenever the answer is only needed to update an indicator.
   */
  async getRemoteHeadSha(remote: string, branch: string): Promise<string | null> {
    const startTime = performance.now();
    const id = this._startCommand(`git ls-remote --heads ${remote} ${branch}`, startTime);
    try {
      const out = await this.git.raw(['ls-remote', '--heads', remote, `refs/heads/${branch}`]);
      const sha = out.trim().split(/\s+/)[0];
      return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
    } catch (error) {
      console.error(`Error reading ${remote}/${branch} from remote:`, error);
      throw error;
    } finally {
      this._endCommand(id, startTime);
    }
  }

  async gc(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git maintenance run --task=incremental-repack', startTime);
    try {
      await withGitLock(await this.getObjectStoreKey(), async () => {
        // incremental-repack consolidates packs geometrically rather than rewriting
        // the whole object database, and it never prunes - so an interrupted run
        // costs time instead of objects. Plain `gc` does prune, and `repack -a -d`
        // discards anything that looked unreachable when it sampled reachability.
        await this.git.raw(['-c', 'gc.auto=0', 'maintenance', 'run', '--task=incremental-repack']);
        // Any repack can leave the commit-graph naming commits that no longer exist.
        // A stale graph is worse than no graph: fetch believes it, claims to have
        // those commits, downloads nothing, and moves refs onto missing objects.
        await this.git.raw(['-c', 'gc.auto=0', 'commit-graph', 'write', '--reachable']);
      });
    } finally {
      this._endCommand(id, startTime);
    }
  }

  /**
   * Abandoned pack temporaries left by fetches that died mid-transfer. Git never
   * reclaims these, and a failing poll loop can pile up gigabytes of them.
   * Only files untouched for `minAgeMs` are reported, so a live fetch is left alone.
   */
  async findStalePackTemps(minAgeMs: number = 60 * 60 * 1000): Promise<{ files: string[]; bytes: number }> {
    const result = { files: [] as string[], bytes: 0 };
    try {
      const packDir = path.join(await this.getCommonDir(), 'objects', 'pack');
      const cutoff = Date.now() - minAgeMs;
      for (const name of await fs.readdir(packDir)) {
        if (!/^tmp_(pack|idx|rev)_/.test(name))
          continue;
        const full = path.join(packDir, name);
        const info = await fs.stat(full);
        if (info.mtimeMs > cutoff)
          continue;
        result.files.push(full);
        result.bytes += info.size;
      }
    } catch (error) {
      console.warn('Could not scan for stale pack temporaries:', error);
    }
    return result;
  }

  /** Delete the files reported by findStalePackTemps; returns how many went away. */
  async removeStalePackTemps(minAgeMs: number = 60 * 60 * 1000): Promise<{ removed: number; bytes: number }> {
    const { files, bytes } = await this.findStalePackTemps(minAgeMs);
    // Through the queue: never unlink from the pack directory while we have a
    // fetch or repack of our own in flight.
    return withGitLock(await this.getObjectStoreKey(), async () => {
      let removed = 0;
      for (const file of files) {
        try {
          await fs.unlink(file);
          removed++;
        } catch (error) {
          console.warn(`Could not remove ${file}:`, error);
        }
      }
      return { removed, bytes };
    });
  }

  async pull(remote: string, branch: string, rebase?: boolean): Promise<void> {
    const startTime = performance.now();
    const options = rebase ? ['--rebase'] : [];
    const id = this._startCommand(`git pull ${remote} ${branch}${rebase ? ' --rebase' : ''}`, startTime);
    try {
      // A pull is a fetch plus a merge, and both ends trigger `gc --auto`; see fetch().
      await withGitLock(await this.getObjectStoreKey(), () =>
        this.git.raw(['-c', 'gc.auto=0', 'pull', remote, branch, ...options]));
    } catch (error) {
      console.error(`Error pulling from ${remote}/${branch}:`, error);
      // Rethrow: callers already handle this - LocalChangesPanel's stash-then-pull
      // flow has a recovery path that pops the stash back - but swallowing the error
      // here meant a failed pull looked successful and that path never ran, so the
      // stash got applied and committed on top of history that never moved.
      throw error;
    } finally {
      this._endCommand(id, startTime);
    }
  }

  async merge(branchName: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git merge ${branchName}`, startTime);
    let hasConflicts = false;
    try {
      await this.git.merge([branchName]);
    } catch (error: any) {
      if (error.message && error.message.includes('CONFLICT')) {
        hasConflicts = true;
      } else {
        console.error(`Error merging ${branchName}:`, error);
        throw error;
      }
    }
    try {
      const status = await this.status();
      const conflictedFiles = status.conflicted;
      const allModifiedFiles = [
        ...status.notAdded,
        ...status.created,
        ...status.deleted,
        ...status.modified,
        ...status.renamed.map(r => r.to)
      ];
      const nonConflictedFiles = allModifiedFiles.filter(
        file => !conflictedFiles.includes(file)
      );
      if (nonConflictedFiles.length > 0) {
        await this.add(nonConflictedFiles);
      }
    } catch (error) {
      console.error(`Error staging files after merge:`, error);
    } finally {
      this._endCommand(id, startTime);
    }
  }

  async rebase(branchName: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git rebase ${branchName}`, startTime);
    try {
      await this.git.rebase([branchName]);
    } catch (error) {
      console.error(`Error rebasing onto ${branchName}:`, error);
      throw error;
    } finally {
      this._endCommand(id, startTime);
    }
  }

  async push(remote: string, refspec: string | string[], options: string[] = []): Promise<string> {
    const startTime = performance.now();
    let result = '';

    const args = ['push', remote, ...(Array.isArray(refspec) ? refspec : [refspec])];
    if (options.length > 0) {
      args.push(...options);
    }

    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      // Use exec to capture both stdout and stderr
      // Git push messages (including PR URLs) typically go to stderr
      const command = `git ${args.map(arg => {
        // Quote arguments that contain special characters
        if (arg.includes(' ') || arg.includes('&') || arg.includes('|')) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      }).join(' ')}`;

      // Serialized with our other commands: a push enumerates objects, so it should
      // not race a repack of the same object database.
      const { stdout, stderr } = await withGitLock(await this.getObjectStoreKey(), () =>
        execAsync(command, {
          cwd: this.repoPath,
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        }));

      // Combine stdout and stderr as PR URLs typically appear in stderr
      result = stdout + '\n' + stderr;
    } catch (error: any) {
      console.error(`Error pushing to ${remote} ${args.slice(2).join(' ')}:`, error);

      // Capture stdout and stderr from error (exec includes these even on failure)
      result = (error.stdout || '') + '\n' + (error.stderr || '');

      throw error;
    } finally {
      this._endCommand(id, startTime);
    }

    return result;
  }

  async compareTags(remote: string): Promise<TagComparison> {
    const comparison: TagComparison = { toPush: [], conflicting: [], upToDate: [] };

    // '%(*objectname)' is the commit an annotated tag dereferences to and is empty for
    // lightweight tags, so peeling is just "use the dereferenced hash if there is one".
    const localTags = new Map<string, string>();
    const localArgs = ['for-each-ref', '--format=%(refname:strip=2)%09%(objectname)%09%(*objectname)',
      'refs/tags'];
    const localStart = performance.now();
    const localId = this._startCommand(`git ${localArgs.join(' ')}`, localStart);
    try {
      const output = await this.git.raw(localArgs);
      for (const line of output.split('\n')) {
        const [name, objectName, peeled] = line.trim().split('\t');
        if (name)
          localTags.set(name, peeled || objectName);
      }
    } finally {
      this._endCommand(localId, localStart);
    }

    if (localTags.size === 0)
      return comparison;

    // `git ls-remote --tags` lists an extra 'refs/tags/<name>^{}' row for annotated tags
    // holding the commit they point at; prefer that over the tag object's own hash.
    const remoteTags = new Map<string, string>();
    const remoteArgs = ['ls-remote', '--tags', remote];
    const remoteStart = performance.now();
    const remoteId = this._startCommand(`git ${remoteArgs.join(' ')}`, remoteStart);
    try {
      const output = await this.git.raw(remoteArgs);
      for (const line of output.split('\n')) {
        const [hash, ref] = line.trim().split('\t');
        if (!hash || !ref || !ref.startsWith('refs/tags/'))
          continue;
        const isPeeled = ref.endsWith('^{}');
        const name = ref.slice('refs/tags/'.length, isPeeled ? -3 : undefined);
        if (isPeeled || !remoteTags.has(name))
          remoteTags.set(name, hash);
      }
    } finally {
      this._endCommand(remoteId, remoteStart);
    }

    for (const [name, hash] of localTags) {
      const remoteHash = remoteTags.get(name);
      if (!remoteHash)
        comparison.toPush.push(name);
      else if (remoteHash === hash)
        comparison.upToDate.push(name);
      else
        comparison.conflicting.push(name);
    }

    return comparison;
  }

  async stashPush(message: string, filePaths: string[] | null = null, keepChanges: boolean = false): Promise<void> {
    const startTime = performance.now();
    if (filePaths && filePaths.length > 0) {
      const id = this._startCommand(`git stash push -m "${message}" -- ${filePaths.length} files`, startTime);
      try {
        await this.git.stash(['push', '-m', message, '--', ...filePaths]);
      } catch (error) {
        console.error(`Error pushing stash with message "${message}" for ${filePaths.length} files:`, error);
      }
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git stash push -m "${message}"`, startTime);
      try {
        await this.git.stash(['push', '-m', message]);
      } catch (error) {
        console.error(`Error pushing stash with message "${message}":`, error);
      }
      this._endCommand(id, startTime);
    }

    // Re-apply the stash we just created so the changes remain in the working
    // directory. The stash entry itself is kept; this only restores the files.
    if (keepChanges) {
      const id = this._startCommand('git stash apply', startTime);
      try {
        await this.git.stash(['apply']);
      } catch (error) {
        console.error('Error re-applying stash to keep changes in working directory:', error);
      }
      this._endCommand(id, startTime);
    }
  }

  async stashPop(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git stash pop', startTime);
    try {
      await this.git.stash(['pop']);
    } catch (error) {
      console.error('Error popping stash:', error);
    }
    this._endCommand(id, startTime);
  }

  async stashApply(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git stash apply', startTime);
    try {
      await this.git.stash(['apply']);
    } catch (error) {
      console.error('Error applying stash:', error);
    }
    this._endCommand(id, startTime);
  }

  // Split a list of file paths into batches that stay under the command-line
  // length limit (Windows CreateProcess caps the command line at ~32KB; we keep
  // a conservative ~6000-char budget to leave room for the git command and repo
  // path). Passing thousands of paths in a single invocation would otherwise
  // overflow the limit and the spawn can hang or fail instead of staging.
  private _batchFilesByLength(files: string[], maxLength: number = 6000): string[][] {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentLength = 0;

    for (const file of files) {
      // Add quotes and space: "file" + space = file.length + 3
      const fileLength = file.length + 3;

      if (currentLength + fileLength > maxLength && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [file];
        currentLength = fileLength;
      } else {
        currentBatch.push(file);
        currentLength += fileLength;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  async add(filePaths: string | string[]): Promise<void> {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const id = this._startCommand(`git add ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
    try {
      // Stage in batches so a huge selection (thousands of files) doesn't blow
      // past the command-line length limit. `git add` accepts a `--` separator so
      // paths that look like options are still treated as pathspecs.
      const batches = this._batchFilesByLength(paths);
      for (const batch of batches) {
        await this.git.add(['--', ...batch]);
      }
    } catch (error) {
      console.error('Error staging files:', error);
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);
  }

  // Stage every change in the working tree in a single `git add -A`. Far faster
  // than enumerating thousands of individual paths and the right call for the
  // "stage all" action.
  async addAll(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git add -A', startTime);
    try {
      await this.git.raw(['add', '-A']);
    } catch (error) {
      console.error('Error staging all files:', error);
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);
  }

  async reset(filePaths: string | string[]): Promise<void> {
    const startTime = performance.now();
    // Support both single string and array of file paths for backward compatibility
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const id = this._startCommand(`git reset HEAD ${paths.length === 1 ? paths[0] : paths.length + ' files'}`, startTime);
    try {
      const batches = this._batchFilesByLength(paths);
      for (const batch of batches) {
        await this.git.reset(['HEAD', '--', ...batch]);
      }
    } catch (error) {
      console.error('Error unstaging files:', error);
    }
    this._endCommand(id, startTime);
  }

  // Unstage everything with a single `git reset` (mixed reset to HEAD). The right
  // call for the "unstage all" action; avoids enumerating thousands of paths.
  async resetAll(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git reset', startTime);
    try {
      await this.git.reset(['HEAD']);
    } catch (error) {
      console.error('Error unstaging all files:', error);
    }
    this._endCommand(id, startTime);
  }

  async commit(message: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git commit -m "${message}"`, startTime);
    try {
      await this.git.commit(message);
    } catch (error) {
      console.error('Error committing changes:', error);
    }
    this._endCommand(id, startTime);
  }

  async diff(filePath: string, isStaged: boolean): Promise<string> {  
    const startTime = performance.now();
    let result: string;
    if (isStaged) {
      const id = this._startCommand(`git diff --cached --ignore-space-at-eol -- ${filePath}`, startTime);
      try {
        result = await this.git.diff(['--cached', '--ignore-space-at-eol', '--', filePath]);
      } catch (error: any) {
        console.log("Error getting staged diff for", filePath, error);
        result = `Error getting staged diff for ${filePath}: ${error.message}`;
      }
      this._endCommand(id, startTime);
    } else {
      const id = this._startCommand(`git diff --ignore-space-at-eol -- ${filePath}`, startTime);
      try {
        result = await this.git.diff(['--ignore-space-at-eol', '--', filePath]);
      } catch (error: any) {
        console.log("Error getting diff for", filePath, error);
        result = `Error getting diff for ${filePath}: ${error.message}`;
      }
      this._endCommand(id, startTime);
    }
    return result;
  }

  /**
   * Get detailed information about a git stash entry
   * @param stashIndex - The stash index (default: 0 for most recent)
   * @param repoPath - Path to the git repository (default: current directory)
   * @returns Object containing stash information
   */
  async getStashInfo(stashIndex: number): Promise<StashInfo> {   
    const stashRef = `stash@{${stashIndex}}`;
    const startTime = performance.now();
    const id = this._startCommand(`git show ${stashRef}`, startTime);
    try {
      // Get basic stash info using git show
      const showOutput = await this.git.show([stashRef]);

      // Get list of files in stash with their status
      const stashShowOutput = await this.git.raw([
        'stash',
        'show',
        '--name-status',
        stashRef
      ]);

      const files: string[] = [];
      const fileStatuses: { [filePath: string]: string } = {};
      
      stashShowOutput
        .trim()
        .split('\n')
        .filter((line: string) => line.length > 0)
        .forEach((line: string) => {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            const status = parts[0].trim();
            const filePath = parts[1].trim();
            files.push(filePath);
            fileStatuses[filePath] = status;
          } else if (parts.length === 1) {
            files.push(parts[0]);
            fileStatuses[parts[0]] = 'M';
          }
        });

      // Get diff for each file
      const fileDiffs: Map<string, string> = new Map();

      const info: StashInfo = {
        stashRef,
        index: stashIndex,
        output: showOutput,
        files,
        fileStatuses,
        fileDiffs,
        totalFiles: files.length,
        hash: '',
        author: '',
        date: '',
        merge: '',
        message: ''
      };

      showOutput.split('\n').forEach((line: string) => {
        if (line.startsWith('commit ')) {
          const hash = line.substring('commit '.length).trim();
          info.hash = hash;
        } else if (line.startsWith('Author: ')) {
          const author = line.substring('Author: '.length).trim();
          info.author = author;
        } else if (line.startsWith('Date: ')) {
          const date = line.substring('Date: '.length).trim();
          info.date = date;
        } else if (line.startsWith('Merge: ')) {
          const merge = line.substring('Merge: '.length).trim();
          info.merge = merge;
        } else if (line.startsWith('    ')) {
          const message = line.substring(line.indexOf(':') + 1).trim();
          info.message = message;
        }
      });

      this._endCommand(id, startTime);

      return info;
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error getting stash info for ${stashRef}:`, error);
      const info: StashInfo = {
        stashRef,
        index: stashIndex,
        output: '',
        files: [],
        fileStatuses: {},
        fileDiffs: new Map<string, string>(),
        totalFiles: 0,
        hash: '',
        author: '',
        date: '',
        merge: '',
        message: ''
      }
      return info;
    }
  }

  async getStashFileDiff(stashIndex: number, filePath: string): Promise<string> {   
    try {
      const stashRef = `stash@{${stashIndex}}`;
      const parentRef = `stash@{${stashIndex}}^`;
      const startTime = performance.now();
      const id = this._startCommand(`git diff "${parentRef}" "${stashRef}" -- "${filePath}"`, startTime);
      const diff = await this.git.raw([
        'diff',
        parentRef,
        stashRef,
        '--',
        filePath
      ]);
      this._endCommand(id, startTime);
      return diff;
    } catch (error: any) {
      return `Error getting diff: ${error.message}.`;
    }
  }

  async discard(filePaths: string[]): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git discard ${filePaths.length} files`, startTime);

    // Get current status to identify new vs modified files
    const statusResult = await this.git.status();
    this._logCommand('git status', startTime);

    const newFiles: string[] = [];
    const stagedFiles: string[] = [];
    const modifiedFiles: string[] = [];

    // Categorize files
    for (const filePath of filePaths) {
      const fileStatus = statusResult.files.find(f => f.path === filePath);
      const isStaged = fileStatus?.index !== ' ';

      if (fileStatus?.working_dir === '?' || (fileStatus?.index === 'A' && !isStaged)) {
        // New untracked file or new staged file - delete it from filesystem
        newFiles.push(filePath);
      } else if (isStaged) {
        // Staged file - needs unstaging first
        stagedFiles.push(filePath);
      } else {
        // Modified file - just needs checkout
        modifiedFiles.push(filePath);
      }
    }

    const batchFilesByLength = (files: string[]) => this._batchFilesByLength(files);

    // Process new files (delete from filesystem)
    for (const filePath of newFiles) {
      const fullPath = path.join(this.repoPath, filePath);
      try {
        if (fsSync.existsSync(fullPath)) {
          fsSync.unlinkSync(fullPath);
          console.log(`Deleted new file: ${filePath}`);
        }
      } catch (error) {
        console.error(`Failed to delete file ${filePath}:`, error);
      }
    }

    // Process staged files in batches (unstage then checkout)
    if (stagedFiles.length > 0) {
      const stagedBatches = batchFilesByLength(stagedFiles);
      console.log(`Unstaging ${stagedFiles.length} files in ${stagedBatches.length} batch(es)`);

      for (const batch of stagedBatches) {
        await this.git.reset(['HEAD', '--', ...batch]);
        this._logCommand(`git reset HEAD -- ${batch.length} files`, startTime);
      }

      // After unstaging, checkout all staged files in batches
      const checkoutBatches = batchFilesByLength(stagedFiles);
      for (const batch of checkoutBatches) {
        await this.git.checkout(['--', ...batch]);
        this._logCommand(`git checkout -- ${batch.length} files`, startTime);
      }
    }

    // Process modified files in batches (checkout only)
    if (modifiedFiles.length > 0) {
      const modifiedBatches = batchFilesByLength(modifiedFiles);
      console.log(`Restoring ${modifiedFiles.length} files in ${modifiedBatches.length} batch(es)`);

      for (const batch of modifiedBatches) {
        await this.git.checkout(['--', ...batch]);
        this._logCommand(`git checkout -- ${batch.length} files`, startTime);
      }
    }

    this._endCommand(id, startTime);
  }

  async checkout(ref: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git checkout ${ref}`, startTime);
    await this.git.checkout(ref);
    this._endCommand(id, startTime);
  }

  async checkoutBranch(branchName: string): Promise<void> {   
    const startTime = performance.now();
    const id = this._startCommand(`git checkout ${branchName}`, startTime);
    await this.git.checkout(branchName);
    this._endCommand(id, startTime);
  }

  async log(branchName: string, maxCount: number = 100, offset: number = 0): Promise<Commit[]> {
    const startTime = performance.now();
    const skipStr = offset > 0 ? ` --skip=${offset}` : '';
    const id = this._startCommand(`git log ${branchName} --max-count=${maxCount}${skipStr}`, startTime);

    const args = ['log', `--max-count=${maxCount}`];
    if (offset > 0) {
      args.push(`--skip=${offset}`);
    }
    args.push(`--format=${LOG_FORMAT}`, branchName, '--');

    // git can fail part way through a log - a commit object missing from the object
    // database, say - after printing the commits it was able to read. Keep those
    // instead of losing the whole branch to the failure.
    let failure: GitCommandError | null = null;
    let output: string;
    try {
      output = await this.git.raw(args);
    } catch (error) {
      if (!(error instanceof GitCommandError) || !error.stdOut) {
        this._endCommand(id, startTime);
        throw error;
      }
      failure = error;
      output = error.stdOut;
    }

    const commits = this._parseLogOutput(output, branchName);

    await this._enrichCommits(commits, branchName);

    this._endCommand(id, startTime);

    if (failure) {
      if (commits.length === 0) {
        throw failure;
      }
      throw new IncompleteHistoryError(failure.message, commits);
    }

    return commits;
  }

  /** Parse the output of a `git log --format=LOG_FORMAT` run into commits. */
  private _parseLogOutput(output: string, branchName: string): Commit[] {
    const onOrigin = branchName.startsWith('origin/');
    const commits: Commit[] = [];

    for (const record of output.split(LOG_RECORD_SEP)) {
      // git writes a newline after each record separator.
      const fields = record.replace(/^\r?\n/, '').split(LOG_FIELD_SEP);
      // A record without every field is the tail of a log that was cut short.
      if (fields.length < 6) {
        continue;
      }

      const [hash, date, message, body, authorName, authorEmail] = fields;
      commits.push({
        hash,
        author_name: authorName,
        author_email: authorEmail,
        date,
        message,
        body: body.trimEnd(),
        onOrigin,
        tags: []
      });
    }

    return commits;
  }

  private async _enrichCommits(commits: Commit[], branchName: string): Promise<void> {
    // Get all tags and their target commits
    const tagResult = await this.git.raw(['tag', '-l', '--format=%(refname:short) %(objectname:short)']);
    const tagMap = new Map<string, string[]>();
    if (tagResult.trim()) {
      tagResult.trim().split('\n').forEach((line: string) => {
        const [tag, hash] = line.split(' ');
        if (tag && hash) {
          const existing = tagMap.get(hash) || [];
          existing.push(tag);
          tagMap.set(hash, existing);
        }
      });
    }

    commits.forEach((commit) => {
      const shortHash = commit.hash.substring(0, 7);
      commit.tags = tagMap.get(shortHash) || [];
    });

    const isRemoteBranch = branchName.startsWith('origin/');
    await Promise.all(commits.map(async (commit) => {
      try {
        if (!isRemoteBranch) {
          const refToCheck = `origin/${branchName}`;
          const unpushedCommits = await this.git.raw(['log', `${refToCheck}..${commit.hash}`]);
          commit.onOrigin = unpushedCommits.trim().length === 0;
        }
      } catch (error) {
        commit.onOrigin = false;
      }
    }));
  }

  async getCommitCount(branchName: string): Promise<number> {
    const startTime = performance.now();
    const id = this._startCommand(`git rev-list --count ${branchName}`, startTime);
    try {
      const result = await this.git.raw(['rev-list', '--count', branchName]);
      this._endCommand(id, startTime);
      const n = parseInt(result.trim(), 10);
      return Number.isFinite(n) ? n : 0;
    } catch (error) {
      this._endCommand(id, startTime);
      return 0;
    }
  }

  async searchLog(branchName: string, query: SearchQuery, maxResults: number = 500): Promise<SearchLogResult> {
    const startTime = performance.now();

    const options: any = {
      [branchName]: null,
      maxCount: maxResults,
      format: {
        hash: '%H',
        date: '%ai',
        message: '%s',
        body: '%b',
        author_name: '%an',
        author_email: '%ae'
      }
    };

    const queryParts: string[] = [];
    if (query.message) {
      options['--grep'] = query.message;
      queryParts.push(`--grep="${query.message}"`);
    }
    if (query.author) {
      options['--author'] = query.author;
      queryParts.push(`--author="${query.author}"`);
    }
    if (query.dateFrom) {
      options['--since'] = query.dateFrom;
      queryParts.push(`--since=${query.dateFrom}`);
    }
    if (query.dateTo) {
      options['--until'] = query.dateTo;
      queryParts.push(`--until=${query.dateTo}`);
    }

    const cmdSuffix = queryParts.length ? ` ${queryParts.join(' ')}` : '';
    const id = this._startCommand(`git log ${branchName} --max-count=${maxResults}${cmdSuffix}`, startTime);

    try {
      const result = await this.git.log(options);
      let commits: Commit[] = result.all.map((commit: any) => ({
        hash: commit.hash,
        author_name: commit.author_name,
        author_email: commit.author_email,
        date: commit.date,
        message: commit.message,
        body: commit.body,
        onOrigin: branchName.startsWith('origin/'),
        tags: [] as string[]
      }));

      if (query.sha) {
        const prefix = query.sha.toLowerCase();
        commits = commits.filter(c => c.hash.toLowerCase().startsWith(prefix));
      }

      await this._enrichCommits(commits, branchName);

      this._endCommand(id, startTime);

      return {
        commits,
        truncated: result.all.length >= maxResults
      };
    } catch (error) {
      this._endCommand(id, startTime);
      throw error;
    }
  }

  async getCommitFiles(commitHash: string): Promise<Array<CommitFile>> {
    const startTime = performance.now();
    const id = this._startCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

    try {
      const result = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash]);
      this._logCommand(`git diff-tree --no-commit-id --name-status -r ${commitHash}`, startTime);

      if (!result.trim()) {
        this._endCommand(id, startTime);
        return [];
      }

      const files = result.trim().split('\n').map((line: string) => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const status = parts[0];
          const path = parts[1];
          return { status, path };
        }
        return null;
      }).filter((item): item is { status: string; path: string } => item !== null);

      this._endCommand(id, startTime);
      return files;
    } catch (error) {
      this._endCommand(id, startTime);
      return [];
    }
  }

  async readWorkingFile(filePath: string): Promise<string> {
    return fs.readFile(path.join(this.repoPath, filePath), 'utf8');
  }

  async writeWorkingFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(path.join(this.repoPath, filePath), content, 'utf8');
  }

  async getCommitRange(fromRef: string | null, toRef: string = 'HEAD'): Promise<Commit[]> {
    const range = fromRef ? `${fromRef}..${toRef}` : toRef;
    const args = ['log', `--format=${LOG_FORMAT}`, range, '--'];

    const startTime = performance.now();
    const id = this._startCommand(`git log --format=... ${range}`, startTime);
    try {
      const output = await this.git.raw(args);
      this._endCommand(id, startTime);
      // The range is on one branch, so onOrigin/tags aren't known here; callers that
      // need them enrich from their own branch view.
      return this._parseLogOutput(output, toRef);
    } catch (error) {
      this._endCommand(id, startTime);
      throw error;
    }
  }

  /**
   * git reads the todo list and any message files through its own shell, which
   * takes forward slashes on Windows too.
   */
  private _shellPath(p: string): string {
    return p.replace(/\\/g, '/');
  }

  /**
   * Remove the temp directories of earlier interactive rebases. A rebase that
   * stopped part way through still needs its files, so they can't be cleaned up
   * when the command returns; sweeping the old ones here keeps them from piling up.
   */
  private async _sweepRebaseTempDirs(keepDir: string): Promise<void> {
    const maxAgeMs = 24 * 60 * 60 * 1000;
    try {
      const parent = os.tmpdir();
      const names = await fs.readdir(parent);
      for (const name of names) {
        if (!name.startsWith(REBASE_TEMP_PREFIX))
          continue;

        const dir = path.join(parent, name);
        if (dir === keepDir)
          continue;

        try {
          const info = await fs.stat(dir);
          if (Date.now() - info.mtimeMs > maxAgeMs)
            await fs.rm(dir, { recursive: true, force: true });
        } catch (error) {
          // Another ugit window may be using it, or it's already gone.
        }
      }
    } catch (error) {
      // Not being able to tidy up is never worth failing a rebase over.
    }
  }

  async rebaseInteractive(baseRef: string | null, entries: RebaseTodoEntry[]): Promise<void> {
    const kept = entries.filter(entry => entry.action !== 'drop');
    if (kept.length === 0)
      throw new Error('Every commit is set to drop, which would leave nothing to rebase.');
    if (kept[0].action === 'squash' || kept[0].action === 'fixup')
      throw new Error(`The first commit can't be ${kept[0].action === 'squash' ? 'squashed' : 'fixed up'} - there is no commit before it to fold it into.`);

    // Keep the todo and message files in a directory of our own, so a second rebase
    // can't overwrite them and the whole lot can be removed together.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), REBASE_TEMP_PREFIX));
    let messageCount = 0;
    const writeMessage = async (message: string): Promise<string> => {
      const file = path.join(dir, `message-${messageCount++}.txt`);
      await fs.writeFile(file, message.endsWith('\n') ? message : `${message}\n`, 'utf8');
      return this._shellPath(file);
    };

    const lines: string[] = [];
    for (const entry of entries) {
      // A subject only annotates the line, but a newline in it would split the line.
      const subject = entry.subject.replace(/\r?\n/g, ' ');
      switch (entry.action) {
        case 'pick':
        case 'edit':
        case 'fixup':
        case 'drop':
          lines.push(`${entry.action} ${entry.hash} ${subject}`);
          break;

        case 'reword':
          // git's own `reword` opens an editor. Amending from a file instead keeps
          // the rebase non-interactive, so it can't stall waiting for an editor
          // that never appears.
          lines.push(`pick ${entry.hash} ${subject}`);
          lines.push(`exec git commit --amend -F "${await writeMessage(entry.message || subject)}"`);
          break;

        case 'squash':
          // `squash` would open an editor for the combined message for the same
          // reason, so fold the commit in with `fixup` - which keeps the earlier
          // message - and set the combined message afterwards.
          lines.push(`fixup ${entry.hash} ${subject}`);
          if (entry.message)
            lines.push(`exec git commit --amend -F "${await writeMessage(entry.message)}"`);
          break;
      }
    }

    const todoPath = path.join(dir, 'todo.txt');
    // git's shell reads this file, so end the lines with LF whatever the platform.
    await fs.writeFile(todoPath, `${lines.join('\n')}\n`, 'utf8');

    const target = baseRef === null ? '--root' : baseRef;
    const command = `git rebase -i ${target}`;
    const startTime = performance.now();
    const id = this._startCommand(command, startTime);

    try {
      await withGitLock(await this.getObjectStoreKey(), () => execAsync(command, {
        cwd: this.repoPath,
        env: {
          ...process.env,
          // git appends the path of the todo list it wrote, so `cp <ours>` becomes
          // `cp <ours> <the todo>`: our list replaces git's without an editor.
          GIT_SEQUENCE_EDITOR: `cp "${this._shellPath(todoPath)}"`,
          // Nothing in the todo list should need an editor, but a hook or a step we
          // didn't account for would otherwise hang the rebase waiting for one.
          GIT_EDITOR: 'true'
        },
        maxBuffer: 1024 * 1024 * 10
      }));
    } catch (error: any) {
      // A rebase that stops for a conflict or an `edit` step exits non-zero. That's
      // not a failure: the caller reports the stopped rebase and the user carries on
      // with continue/abort. Anything else is a real error.
      const stopped = await this.getRebaseStatus().catch(() => null);
      if (!stopped) {
        this._endCommand(id, startTime);
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        throw new Error(error?.stderr || error?.message || String(error));
      }
    }

    this._endCommand(id, startTime);

    // Only clean up once git is finished with the files; a stopped rebase still has
    // todo lines left to run, and they name the message files.
    const inProgress = await this.getRebaseStatus().catch(() => null);
    if (!inProgress)
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

    await this._sweepRebaseTempDirs(inProgress ? dir : '');
  }

  /**
   * Reduce a commit's `--name-status` block to the status of the path the log was
   * filtered on.
   */
  private _parseNameStatus(lines: string[], requestedPath: string):
      { status: string; path: string; renamedFrom?: string } {
    const entries = lines
      .map(line => line.split('\t'))
      .filter(parts => parts.length >= 2 && parts[0].length > 0);

    // A merge commit is printed without a diff, so it has no entry. More than one
    // entry means the filter matched a directory, where no single status describes
    // what the commit did to it.
    if (entries.length !== 1)
      return { status: '', path: requestedPath };

    const parts = entries[0];
    const code = parts[0];
    // Rename and copy entries are `R<score>\told\tnew`.
    if ((code.startsWith('R') || code.startsWith('C')) && parts.length >= 3)
      return { status: code.charAt(0), path: parts[2], renamedFrom: parts[1] };

    return { status: code.charAt(0), path: parts[1] };
  }

  async fileLog(filePath: string, maxCount: number = 100, offset: number = 0,
                follow: boolean = true, startRef: string = 'HEAD'): Promise<FileHistoryEntry[]> {
    const args = ['log', `--max-count=${maxCount}`];
    if (offset > 0)
      args.push(`--skip=${offset}`);
    // --follow only takes a single file; git rejects it for a directory.
    if (follow)
      args.push('--follow');
    args.push('--name-status', `--format=${FILE_LOG_FORMAT}`, startRef, '--', filePath);

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    let output: string;
    try {
      output = await this.git.raw(args);
    } catch (error) {
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);

    const entries: FileHistoryEntry[] = [];
    for (const record of output.split(LOG_RECORD_SEP)) {
      if (!record.trim())
        continue;

      const fields = record.split(LOG_FIELD_SEP);
      // A record without every field is the tail of a log that was cut short.
      if (fields.length < 6)
        continue;

      const [hash, date, message, body, authorName] = fields;
      // The last field ends at its newline; the commit's --name-status block
      // follows it.
      const tail = fields[5].split('\n');
      const { status, path: pathInCommit, renamedFrom } =
        this._parseNameStatus(tail.slice(1), filePath);

      entries.push({
        commit: {
          hash,
          date,
          message,
          body: body.trimEnd(),
          author_name: authorName,
          author_email: tail[0],
          onOrigin: false,
          tags: []
        },
        status,
        path: pathInCommit,
        ...(renamedFrom ? { renamedFrom } : {})
      });
    }

    return entries;
  }

  async getFileCommitCount(filePath: string, follow: boolean = true,
                           startRef: string = 'HEAD'): Promise<number> {
    // rev-list has no --follow, so a followed count has to come from log itself.
    const args = follow
      ? ['log', '--follow', '--format=%H', startRef, '--', filePath]
      : ['rev-list', '--count', startRef, '--', filePath];

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      const result = await this.git.raw(args);
      this._endCommand(id, startTime);
      if (follow)
        return result.split('\n').filter(line => line.trim().length > 0).length;
      const n = parseInt(result.trim(), 10);
      return isNaN(n) ? 0 : n;
    } catch (error) {
      this._endCommand(id, startTime);
      return 0;
    }
  }

  /**
   * Turn a git author time into 'YYYY-MM-DD HH:mm:ss' in the author's own zone, so
   * the date shown is the one the author saw.
   * @param timeSec - Seconds since the epoch, UTC
   * @param tz - Zone offset as git reports it, e.g. '+0200'
   */
  private _formatBlameDate(timeSec: number, tz: string): string {
    const sign = tz.startsWith('-') ? -1 : 1;
    const hours = parseInt(tz.slice(1, 3), 10) || 0;
    const minutes = parseInt(tz.slice(3, 5), 10) || 0;
    const shifted = new Date((timeSec + sign * (hours * 3600 + minutes * 60)) * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
           `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  }

  async blame(filePath: string, revision?: string): Promise<BlameLine[]> {
    const args = ['blame', '--porcelain'];
    if (revision)
      args.push(revision);
    args.push('--', filePath);

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    let output: string;
    try {
      output = await this.git.raw(args);
    } catch (error) {
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);

    // Porcelain output spells a commit's details out the first time it appears and
    // only repeats the hash afterwards, so hold on to what each commit said.
    const commits = new Map<string, BlameCommitInfo>();
    const result: BlameLine[] = [];
    let header: BlameHeader | null = null;
    let lastHash: string | null = null;
    let authorTime = 0;
    let authorTz = '+0000';

    for (const raw of output.split('\n')) {
      // A line starting with a tab is file content, and closes the header block
      // that preceded it.
      if (raw.startsWith('\t')) {
        if (!header)
          continue;

        const info = commits.get(header.hash) || {
          author: '', authorMail: '', date: '', summary: '', filename: filePath
        };
        if (header.author !== undefined) info.author = header.author;
        if (header.authorMail !== undefined) info.authorMail = header.authorMail;
        if (header.summary !== undefined) info.summary = header.summary;
        if (header.filename !== undefined) info.filename = header.filename;
        if (header.previousHash !== undefined) info.previousHash = header.previousHash;
        if (header.previousPath !== undefined) info.previousPath = header.previousPath;
        if (header.hasTime) info.date = this._formatBlameDate(authorTime, authorTz);
        commits.set(header.hash, info);

        result.push({
          line: header.line,
          hash: header.hash,
          author: info.author,
          authorMail: info.authorMail,
          date: info.date,
          summary: info.summary,
          origLine: header.origLine,
          origPath: info.filename,
          content: raw.slice(1).replace(/\r$/, ''),
          isGroupStart: header.hash !== lastHash,
          ...(info.previousHash ? { previousHash: info.previousHash } : {}),
          ...(info.previousPath ? { previousPath: info.previousPath } : {})
        });

        lastHash = header.hash;
        header = null;
        continue;
      }

      // '<hash> <line in the original> <line in the result> [lines in this run]'
      // opens a new block.
      const start = /^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/.exec(raw);
      if (start) {
        header = {
          hash: start[1],
          origLine: parseInt(start[2], 10),
          line: parseInt(start[3], 10),
          hasTime: false
        };
        continue;
      }

      if (!header)
        continue;

      const space = raw.indexOf(' ');
      const key = space === -1 ? raw : raw.slice(0, space);
      const value = space === -1 ? '' : raw.slice(space + 1);
      switch (key) {
        case 'author':
          header.author = value;
          break;
        case 'author-mail':
          header.authorMail = value.replace(/^<|>$/g, '');
          break;
        case 'author-time':
          authorTime = parseInt(value, 10) || 0;
          header.hasTime = true;
          break;
        case 'author-tz':
          authorTz = value || '+0000';
          break;
        case 'summary':
          header.summary = value;
          break;
        case 'filename':
          header.filename = value;
          break;
        case 'previous': {
          // '<hash> <path>', and the path can contain spaces.
          const cut = value.indexOf(' ');
          if (cut !== -1) {
            header.previousHash = value.slice(0, cut);
            header.previousPath = value.slice(cut + 1);
          }
          break;
        }
      }
    }

    return result;
  }

  async createPatch(filePaths: string[], outputPath: string, isStaged: boolean = false): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git createPatch`, startTime);

    let patchContent: string;

    if (isStaged) {
      patchContent = await this.git.diff(['--cached', '--', ...filePaths]);
      this._logCommand(`git diff --cached -- ${filePaths.length} files > ${outputPath}`, startTime);
    } else {
      patchContent = await this.git.diff(['--', ...filePaths]);
      this._logCommand(`git diff -- ${filePaths.length} files > ${outputPath}`, startTime);
    }

    fsSync.writeFileSync(outputPath, patchContent, 'utf8');
    this._endCommand(id, startTime);
  }

  async createStashPatch(stashIndex: number, outputPath: string, includeUntracked: boolean = false): Promise<boolean> {
    const stashRef = `stash@{${stashIndex}}`;
    // Pass the untracked flag explicitly so the patch doesn't depend on the
    // user's stash.showIncludeUntracked setting.
    const args = ['stash', 'show', '-p', includeUntracked ? '--include-untracked' : '--no-include-untracked', stashRef];

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')} > ${outputPath}`, startTime);
    let patchContent: string;
    try {
      patchContent = await this.git.raw(args);
    } catch (error) {
      console.error(`Error creating patch from ${stashRef}:`, error);
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);

    // A stash holding only untracked files has nothing to show without
    // --include-untracked; don't leave an empty patch file behind.
    if (patchContent.trim().length === 0)
      return false;

    fsSync.writeFileSync(outputPath, patchContent, 'utf8');
    return true;
  }

  async show(commitHash: string, filePath: string): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand(`git show --format= --unified=3 ${commitHash} -- ${filePath}`, startTime);
    try {
      // Use git show with specific format to get diff for this file
      // This should produce same format as git diff
      const result = await this.git.raw(['show', '--format=', '--unified=3', `${commitHash}`, '--', filePath]);
      this._endCommand(id, startTime);
      return result;
    } catch (error: any) {
      this._endCommand(id, startTime);
      return `Error loading diff for ${filePath} in commit ${commitHash}: ${error.message}`;
    }
  }

  async getFileContentAtRevision(revision: string, filePath: string): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand(`git cat-file blob ${revision}:${filePath}`, startTime);
    try {
      const { execSync } = require('child_process');
      const result = execSync(`git -C "${this.repoPath}" cat-file blob ${revision}:${filePath}`, {
        encoding: 'binary'
      });
      this._endCommand(id, startTime);
      return result;
    } catch (error: any) {
      this._endCommand(id, startTime);
      return '';
    }
  }

  async readFileBinary(filePath: string): Promise<string> {
    try {
      const fullPath = path.join(this.repoPath, filePath);
      const buffer = fsSync.readFileSync(fullPath);
      return buffer.toString('binary');
    } catch (error: any) {
      return '';
    }
  }

  async clone(
    repoUrl: string,
    parentFolder: string,
    repoName: string,
    onProgress?: (progress: CloneProgress) => void,
    depth?: number
  ): Promise<void> {
    const startTime = performance.now();
    // A positive depth performs a shallow clone.
    const cloneOptions = depth && depth > 0 ? ['--depth', String(Math.floor(depth))] : [];
    const commandLabel = `git clone ${cloneOptions.join(' ')}${cloneOptions.length ? ' ' : ''}${repoUrl} ${parentFolder}/${repoName}`;
    const id = this._startCommand(commandLabel, startTime);
    // Clone into specific folder within parent directory
    const localFolder = parentFolder + "/" + repoName;
    const git = simpleGit({
      progress: onProgress
        ? ({ method, stage, progress }) => onProgress({ method, stage, progress })
        : undefined,
      errors: gitErrorHandler,
    });
    try {
      await git.clone(repoUrl, localFolder, cloneOptions);
    } catch (error) {
      console.error(`Error cloning repository from ${repoUrl} to ${localFolder}:`, error);
      // Rethrow so the caller can surface the failure to the user. Previously this was
      // swallowed, which made a failed clone falsely report success.
      throw error;
    } finally {
      this._endCommand(id, startTime);
    }
  }

  async raw(args: string[]): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    let result: string | null = null;
    try {
      result = await this.git.raw(args);
    } catch (error) {
      console.error(`Error executing git ${args.join(' ')}:`, error);
    }
    this._endCommand(id, startTime);
    return result || '';
  }

  async getMergeBase(branch1: string, branch2: string): Promise<string | null> {
    const startTime = performance.now();
    const id = this._startCommand(`git merge-base ${branch1} ${branch2}`, startTime);
    try {
      const result = await this.git.raw(['merge-base', branch1, branch2]);
      this._endCommand(id, startTime);
      return result.trim() || null;
    } catch (error) {
      console.error(`Error getting merge base for ${branch1} and ${branch2}:`, error);
      this._endCommand(id, startTime);
      return null;
    }
  }

  async isLfsInitialized(): Promise<boolean> {
    try {
      // Check if git-lfs is installed by running git lfs version
      await this.git.raw(['lfs', 'version']);

      // Check if LFS is initialized in this repo by checking for .gitattributes
      const result = await this.git.raw(['lfs', 'ls-files']);
      // If we get here without error, LFS is initialized
      return true;
    } catch (error) {
      // If command fails, LFS is not initialized or not installed
      return false;
    }
  }

  async lfsInstall(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs install', startTime);
    try {
      await this.git.raw(['lfs', 'install']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to initialize Git LFS: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsTrack(pattern: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git lfs track "${pattern}"`, startTime);
    try {
      await this.git.raw(['lfs', 'track', pattern]);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to track pattern: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsStatus(): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs status', startTime);
    try {
      const result = await this.git.raw(['lfs', 'status']);
      this._endCommand(id, startTime);
      return result;
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to get LFS status: ${error.message}`);
    }
  }

  async lfsFetch(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs fetch', startTime);
    try {
      await this.git.raw(['lfs', 'fetch']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to fetch LFS objects: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsPull(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs pull', startTime);
    try {
      await this.git.raw(['lfs', 'pull']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to pull LFS objects: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsPrune(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs prune', startTime);
    try {
      await this.git.raw(['lfs', 'prune']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to prune LFS objects: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async lfsUninstall(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git lfs uninstall', startTime);
    try {
      await this.git.raw(['lfs', 'uninstall']);
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to uninstall Git LFS: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async getLfsTrackPatterns(): Promise<string[]> {
    try {
      const attributesPath = path.join(this.repoPath, '.gitattributes');
      const content = await fs.readFile(attributesPath, 'utf8');
      const patterns: string[] = [];
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        // An LFS rule looks like: `*.psd filter=lfs diff=lfs merge=lfs -text`.
        if (!line || line.startsWith('#') || !/\bfilter=lfs\b/.test(line))
          continue;
        // The pattern is the first whitespace-delimited token. It may be quoted
        // when it contains spaces.
        const match = line.match(/^"([^"]+)"|^(\S+)/);
        const pattern = match ? (match[1] ?? match[2]) : null;
        if (pattern)
          patterns.push(pattern);
      }
      return patterns;
    } catch (error) {
      // No .gitattributes (or unreadable) means nothing is tracked.
      return [];
    }
  }

  async getFileSizes(filePaths: string[]): Promise<Record<string, number>> {
    const sizes: Record<string, number> = {};
    await Promise.all(filePaths.map(async (relPath) => {
      try {
        const absPath = path.join(this.repoPath, relPath);
        const stat = await fs.stat(absPath);
        sizes[relPath] = stat.isFile() ? stat.size : 0;
      } catch (error) {
        // Deleted or unreadable files contribute no size.
        sizes[relPath] = 0;
      }
    }));
    return sizes;
  }

  async addToGitignore(pattern: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('add to .gitignore', startTime);
    try {
      const gitignorePath = path.join(this.repoPath, '.gitignore');
      let content = '';
      
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch (error) {
        // .gitignore doesn't exist, that's fine
      }
      
      // Check if pattern already exists
      const lines = content.split('\n');
      if (lines.includes(pattern)) {
        this._endCommand(id, startTime);
        return;
      }
      
      // Add pattern to file
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += pattern + '\n';
      
      await fs.writeFile(gitignorePath, content, 'utf8');
    } catch (error: any) {
      this._endCommand(id, startTime);
      throw new Error(`Failed to add to .gitignore: ${error.message}`);
    }
    this._endCommand(id, startTime);
  }

  async isIgnored(filePath: string): Promise<boolean> {
    const startTime = performance.now();
    const id = this._startCommand('check-ignore', startTime);
    try {
      await this.git.raw(['check-ignore', filePath]);
      this._endCommand(id, startTime);
      return true;
    } catch (error) {
      this._endCommand(id, startTime);
      return false;
    }
  }

  async getGitignoreContents(): Promise<string> {
    const startTime = performance.now();
    const id = this._startCommand('read .gitignore', startTime);
    try {
      const gitignorePath = path.join(this.repoPath, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf8');
      this._endCommand(id, startTime);
      return content;
    } catch (error: any) {
      this._endCommand(id, startTime);
      return '';
    }
  }

  async getConflictSources(): Promise<{ oursLabel: string; theirsLabel: string } | null> {
    const gitDir = path.join(this.repoPath, '.git');
    try {
      const mergeHeadPath = path.join(gitDir, 'MERGE_HEAD');
      const rebaseHeadPath = path.join(gitDir, 'REBASE_HEAD');
      const mergeHeadExists = await fs.access(mergeHeadPath).then(() => true).catch(() => false);
      const rebaseHeadExists = await fs.access(rebaseHeadPath).then(() => true).catch(() => false);

      if (mergeHeadExists) {
        const oursLabel = this.currentBranch || 'HEAD';
        let theirsLabel = 'Incoming';
        try {
          const nameRev = await this.git!.raw(['name-rev', '--name-only', 'MERGE_HEAD']);
          const trimmed = nameRev.trim();
          if (trimmed && !/^[0-9a-f]+$/.test(trimmed)) {
            theirsLabel = trimmed.replace(/~[0-9]+$/, '');
          }
        } catch {
          // keep default
        }
        return { oursLabel, theirsLabel };
      }

      if (rebaseHeadExists) {
        return { oursLabel: 'Current', theirsLabel: 'Incoming' };
      }
    } catch {
    }
    return { oursLabel: 'Current', theirsLabel: 'Incoming' };
  }

  async getConflictVersionContent(filePath: string, version: 'ours' | 'theirs'): Promise<string> {
    const stage = version === 'ours' ? '2' : '3';
    try {
      const content = await this.git!.raw(['show', `:${stage}:${filePath}`]);
      return content;
    } catch {
      return '';
    }
  }

  async resolveConflictWithVersion(filePath: string, version: 'ours' | 'theirs'): Promise<void> {
    const startTime = performance.now();
    const flag = version === 'ours' ? '--ours' : '--theirs';
    const id = this._startCommand(`git checkout ${flag} -- ${filePath}`, startTime);
    try {
      await this.git!.raw(['checkout', flag, '--', filePath]);
      await this.git!.add([filePath]);
    } catch (error) {
      console.error(`Error resolving conflict with ${version}:`, error);
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);
  }

  async runMergetool(filePath?: string, tool?: string): Promise<void> {
    const startTime = performance.now();
    const args = ['mergetool'];
    if (tool) {
      args.push(`--tool=${tool}`);
    }
    if (filePath) {
      args.push('--', filePath);
    }
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      await this.git!.raw(args);
    } catch (error) {
      console.error('Error running mergetool:', error);
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);
  }

  /**
   * Resolve the absolute path of the repository's git directory, falling back
   * to the conventional `<repo>/.git` location if the lookup fails.
   */
  private async _resolveGitDir(): Promise<string> {
    try {
      const dir = (await this.git!.raw(['rev-parse', '--absolute-git-dir'])).trim();
      if (dir) {
        return dir;
      }
    } catch {
      // fall through to the default location
    }
    return path.join(this.repoPath, '.git');
  }

  async getRebaseStatus(): Promise<RebaseStatus | null> {
    const gitDir = await this._resolveGitDir();
    const mergeDir = path.join(gitDir, 'rebase-merge');
    const applyDir = path.join(gitDir, 'rebase-apply');

    const isDir = async (p: string): Promise<boolean> => {
      try {
        return (await fs.stat(p)).isDirectory();
      } catch {
        return false;
      }
    };

    const mergeActive = await isDir(mergeDir);
    const applyActive = mergeActive ? false : await isDir(applyDir);
    if (!mergeActive && !applyActive) {
      return null;
    }

    const stateDir = mergeActive ? mergeDir : applyDir;
    const kind: 'merge' | 'apply' = mergeActive ? 'merge' : 'apply';

    const readState = async (name: string): Promise<string> => {
      try {
        return (await fs.readFile(path.join(stateDir, name), 'utf8')).trim();
      } catch {
        return '';
      }
    };

    let branch: string | null = null;
    const headName = await readState('head-name');
    if (headName) {
      branch = headName.replace(/^refs\/heads\//, '');
    }

    let onto: string | null = null;
    const ontoHash = await readState('onto');
    if (ontoHash) {
      onto = ontoHash.substring(0, 8);
      try {
        const nameRev = (await this.git!.raw(['name-rev', '--name-only', ontoHash])).trim();
        if (nameRev && !/undefined|unknown/i.test(nameRev)) {
          onto = nameRev.replace(/[\^~][0-9]+$/, '');
        }
      } catch {
        // keep the short hash
      }
    }

    const currentStep = mergeActive
      ? parseInt(await readState('msgnum'), 10)
      : parseInt(await readState('next'), 10);
    const totalSteps = mergeActive
      ? parseInt(await readState('end'), 10)
      : parseInt(await readState('last'), 10);

    let stoppedSha = await readState('stopped-sha');
    if (!stoppedSha) {
      try {
        stoppedSha = (await this.git!.raw(['rev-parse', '--verify', '--quiet', 'REBASE_HEAD'])).trim();
      } catch {
        stoppedSha = '';
      }
    }

    let currentCommitHash: string | null = null;
    let currentCommitSubject: string | null = null;
    if (stoppedSha) {
      currentCommitHash = stoppedSha.substring(0, 8);
      try {
        currentCommitSubject = (await this.git!.raw(['log', '-1', '--format=%s', stoppedSha])).trim();
      } catch {
        currentCommitSubject = null;
      }
    }

    let conflictedFiles: string[] = [];
    try {
      const status = await this.status(undefined, true, true);
      conflictedFiles = status.conflicted || [];
    } catch {
      conflictedFiles = [];
    }

    return {
      kind,
      branch,
      onto,
      currentStep: Number.isFinite(currentStep) ? currentStep : 0,
      totalSteps: Number.isFinite(totalSteps) ? totalSteps : 0,
      currentCommitHash,
      currentCommitSubject,
      conflictedFiles,
    };
  }

  /**
   * Run a `git rebase` continuation command. The editor is disabled so the
   * command never blocks waiting for commit-message input.
   */
  private async _runRebaseCommand(action: '--continue' | '--abort' | '--skip'): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git rebase ${action}`, startTime);
    try {
      await execAsync(`git rebase ${action}`, {
        cwd: this.repoPath,
        env: { ...process.env, GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' },
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (error) {
      this._endCommand(id, startTime);
      throw error;
    }
    this._endCommand(id, startTime);
  }

  async rebaseContinue(): Promise<void> {
    await this._runRebaseCommand('--continue');
  }

  async rebaseAbort(): Promise<void> {
    await this._runRebaseCommand('--abort');
  }

  async rebaseSkip(): Promise<void> {
    await this._runRebaseCommand('--skip');
  }

  // Normalize a filesystem path for cross-worktree comparison. Git emits
  // forward-slash paths in --porcelain output; this.repoPath may use the OS
  // separator. On Windows paths are also case-insensitive.
  private _normalizeWorktreePath(p: string): string {
    const normalized = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const startTime = performance.now();
    const id = this._startCommand('git worktree list --porcelain', startTime);
    let output: string;
    try {
      output = await this.git.raw(['worktree', 'list', '--porcelain']);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error('Error listing worktrees:', error);
      throw error;
    }
    this._endCommand(id, startTime);

    const currentPath = this._normalizeWorktreePath(this.repoPath);
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> & { _bare?: boolean } | null = null;

    const flush = () => {
      if (current && current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch ?? null,
          head: current.head || '',
          isMain: worktrees.length === 0, // first record is always the main worktree
          isCurrent: this._normalizeWorktreePath(current.path) === currentPath,
          detached: !!current.detached,
          locked: !!current.locked,
          lockReason: current.lockReason,
          prunable: !!current.prunable,
        });
      }
      current = null;
    };

    for (const rawLine of output.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (line.trim() === '') {
        flush();
        continue;
      }
      const spaceIdx = line.indexOf(' ');
      const key = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
      const value = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1);

      switch (key) {
        case 'worktree':
          flush();
          current = { path: value };
          break;
        case 'HEAD':
          if (current) current.head = value;
          break;
        case 'branch':
          // value looks like 'refs/heads/feature' — strip the prefix for display.
          if (current) current.branch = value.replace(/^refs\/heads\//, '');
          break;
        case 'detached':
          if (current) current.detached = true;
          break;
        case 'bare':
          if (current) current._bare = true;
          break;
        case 'locked':
          if (current) {
            current.locked = true;
            if (value) current.lockReason = value;
          }
          break;
        case 'prunable':
          if (current) current.prunable = true;
          break;
      }
    }
    flush();

    return worktrees;
  }

  async addWorktree(
    worktreePath: string,
    ref: string,
    options: { newBranch?: boolean; startPoint?: string; force?: boolean } = {}
  ): Promise<void> {
    const args = ['worktree', 'add'];
    if (options.force) args.push('--force');
    if (options.newBranch) {
      args.push('-b', ref, worktreePath);
      if (options.startPoint) args.push(options.startPoint);
    } else {
      args.push(worktreePath, ref);
    }

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      await this.git.raw(args);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error adding worktree at ${worktreePath}:`, error);
      throw error;
    }
  }

  async removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(worktreePath);

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      await this.git.raw(args);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error removing worktree ${worktreePath}:`, error);
      throw error;
    }
  }

  async pruneWorktrees(): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand('git worktree prune', startTime);
    try {
      await this.git.raw(['worktree', 'prune']);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error('Error pruning worktrees:', error);
      throw error;
    }
  }

  async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
    const args = ['worktree', 'lock'];
    if (reason) args.push('--reason', reason);
    args.push(worktreePath);

    const startTime = performance.now();
    const id = this._startCommand(`git ${args.join(' ')}`, startTime);
    try {
      await this.git.raw(args);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error locking worktree ${worktreePath}:`, error);
      throw error;
    }
  }

  async unlockWorktree(worktreePath: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git worktree unlock ${worktreePath}`, startTime);
    try {
      await this.git.raw(['worktree', 'unlock', worktreePath]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error unlocking worktree ${worktreePath}:`, error);
      throw error;
    }
  }

  async moveWorktree(worktreePath: string, newPath: string): Promise<void> {
    const startTime = performance.now();
    const id = this._startCommand(`git worktree move ${worktreePath} ${newPath}`, startTime);
    try {
      await this.git.raw(['worktree', 'move', worktreePath, newPath]);
      this._endCommand(id, startTime);
    } catch (error) {
      this._endCommand(id, startTime);
      console.error(`Error moving worktree ${worktreePath}:`, error);
      throw error;
    }
  }
}

export default SimpleGitAdapter;