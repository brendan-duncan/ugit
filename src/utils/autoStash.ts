import { GitAdapter } from '../git/GitAdapter';
import cacheManager from './cacheManager';

/**
 * Stash-pull-reapply, as used before committing onto a branch that's behind and by
 * the Pull dialog's "Stash and reapply". The rule throughout: local changes are
 * never left only in a stash without the user being told, and a stash is only
 * dropped once its changes are back in the working tree without conflicts.
 *
 * If the pull itself stops on conflicts, the stash is kept untouched and recorded
 * as pending; the local-changes panel offers to restore it once the merge is
 * committed. If re-applying the stash conflicts, the stash is likewise kept as a
 * backup until those conflicts are resolved.
 */

/** Window event fired whenever the pending auto-stash record changes. */
export const AUTO_STASH_CHANGED_EVENT = 'ugit:auto-stash-changed';

export interface PendingAutoStash {
  sha: string;
  message: string;
  // Paths staged when the stash was made, to re-stage if the staged/unstaged split
  // can't be restored exactly.
  stagedPaths: string[];
  // 'pull-conflict': the pull stopped on conflicts before the stash was re-applied.
  // 'apply-conflict': the stash was re-applied but conflicted with the pulled changes.
  phase: 'pull-conflict' | 'apply-conflict';
}

export type AutoStashResult =
  | { kind: 'done' }
  | { kind: 'pull-conflict'; pending: PendingAutoStash }
  | { kind: 'apply-conflict'; pending: PendingAutoStash; conflictedFiles: string[] };

export function loadPendingAutoStash(repoPath: string): PendingAutoStash | null {
  return cacheManager.loadCache(repoPath)?.pendingAutoStash ?? null;
}

export function savePendingAutoStash(repoPath: string, pending: PendingAutoStash | null): void {
  const cacheData = cacheManager.loadCache(repoPath) || {};
  if (pending)
    cacheData.pendingAutoStash = pending;
  else
    delete cacheData.pendingAutoStash;
  cacheManager.saveCache(repoPath, cacheData);
  window.dispatchEvent(new CustomEvent(AUTO_STASH_CHANGED_EVENT));
}

/** Whether a pull (merge or rebase) is stopped on conflicts. */
async function pullStopped(git: GitAdapter): Promise<boolean> {
  if (await git.isMergeInProgress())
    return true;
  if (await git.getRebaseStatus())
    return true;
  return (await git.getConflictedFiles()).length > 0;
}

/**
 * A conflicted `stash apply` leaves every cleanly merged file staged. Unstage the
 * ones the user hadn't staged, so committing after resolving the conflicts doesn't
 * sweep in work they meant to leave out.
 */
async function unstageUnintended(git: GitAdapter, stagedPaths: string[], conflicted: string[]): Promise<void> {
  const keep = new Set([...stagedPaths, ...conflicted]);
  const stagedNow = (await git.raw(['diff', '--cached', '--name-only'])).split('\n').map(line => line.trim()).filter(Boolean);
  const unintended = stagedNow.filter(file => !keep.has(file));
  if (unintended.length > 0)
    await git.reset(unintended);
}

/**
 * Put a stash's changes back. Restores the staged/unstaged split where git can;
 * when the pull touched a staged file and it can't, applies without it and
 * re-stages the files that were staged. Returns the conflicted files, empty on
 * success - the stash is dropped only then.
 */
export async function restoreAutoStash(git: GitAdapter, pending: PendingAutoStash): Promise<string[]> {
  const conflicted = await applyAutoStash(git, pending);
  if (conflicted.length > 0) {
    await unstageUnintended(git, pending.stagedPaths, conflicted);
    return conflicted;
  }
  await git.stashDropStrict(pending.sha);
  return [];
}

/** Apply without dropping; returns the conflicted files, empty when clean. */
async function applyAutoStash(git: GitAdapter, pending: PendingAutoStash): Promise<string[]> {
  try {
    await git.stashApplyStrict(pending.sha, true);
  } catch (error) {
    const conflicted = await git.getConflictedFiles();
    if (conflicted.length > 0)
      return conflicted;
    // --index refuses outright, touching nothing, when the index can't be restored.
    if (!/conflicts in index|try without --index/i.test((error as Error).message || ''))
      throw error;

    try {
      await git.stashApplyStrict(pending.sha, false);
    } catch (plainError) {
      const conflictedPlain = await git.getConflictedFiles();
      if (conflictedPlain.length > 0)
        return conflictedPlain;
      throw plainError;
    }
    // Re-stage only when the apply was clean: staging a conflicted file would
    // mark it resolved with the conflict markers still in it.
    const conflictedAfter = await git.getConflictedFiles();
    if (conflictedAfter.length > 0)
      return conflictedAfter;
    if (pending.stagedPaths.length > 0)
      await git.add(pending.stagedPaths);
  }

  // Never trust an exit code alone before the stash - the only other copy - is dropped.
  return git.getConflictedFiles();
}

/**
 * Stash local changes, pull, and re-apply them. Throws (with the stash restored,
 * or kept and named in the message if even that fails) when the pull fails for a
 * reason other than conflicts.
 */
export async function pullWithAutoStash(git: GitAdapter, options: {
  branch: string;
  rebase?: boolean;
  stagedPaths: string[];
  onProgress?: (message: string) => void;
}): Promise<AutoStashResult> {
  const { branch, rebase = false, stagedPaths, onProgress } = options;
  const message = `Auto-stash before pull at ${new Date().toISOString()}`;

  onProgress?.('git stash push');
  const sha = await git.stashSaveStrict(message);

  onProgress?.(`git pull origin ${branch}${rebase ? ' --rebase' : ''}`);
  try {
    await git.pull('origin', branch, rebase);
  } catch (pullError) {
    if (sha && await pullStopped(git)) {
      // Leave the stash alone: applying it onto a half-merged tree would tangle
      // the user's changes up with the pull's conflicts.
      const pending: PendingAutoStash = { sha, message, stagedPaths, phase: 'pull-conflict' };
      savePendingAutoStash(git.repoPath, pending);
      return { kind: 'pull-conflict', pending };
    }

    // The pull didn't happen (offline, rejected, untracked files in the way): put
    // the changes straight back.
    if (sha) {
      onProgress?.('git stash apply');
      const pending: PendingAutoStash = { sha, message, stagedPaths, phase: 'apply-conflict' };
      try {
        const conflicted = await restoreAutoStash(git, pending);
        if (conflicted.length > 0)
          savePendingAutoStash(git.repoPath, pending);
      } catch {
        throw new Error(`${(pullError as Error).message}\n\nYour local changes could not be restored ` +
          `automatically and are saved in the stash "${message}".`);
      }
    }
    throw pullError;
  }

  if (!sha)
    return { kind: 'done' };

  // Belt and braces: a pull that stops on conflicts can exit without git output
  // that reads as an error, so check the repository rather than trust the exit.
  if (await pullStopped(git)) {
    const stopped: PendingAutoStash = { sha, message, stagedPaths, phase: 'pull-conflict' };
    savePendingAutoStash(git.repoPath, stopped);
    return { kind: 'pull-conflict', pending: stopped };
  }

  onProgress?.('git stash apply --index');
  const pending: PendingAutoStash = { sha, message, stagedPaths, phase: 'apply-conflict' };
  const conflicted = await restoreAutoStash(git, pending);
  if (conflicted.length > 0) {
    savePendingAutoStash(git.repoPath, pending);
    return { kind: 'apply-conflict', pending, conflictedFiles: conflicted };
  }
  return { kind: 'done' };
}
