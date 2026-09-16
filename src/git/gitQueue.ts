/**
 * Serializes git commands that write to a repository, keyed by object store.
 *
 * Git has no lock around the object database as a whole. Two commands that each
 * write packs can interleave badly: `git fetch` runs `gc --auto` when it finishes,
 * and a repack decides what to keep from a snapshot of reachability taken when it
 * starts. A fetch that lands while that snapshot is stale can leave the repack
 * discarding objects the new refs point at - which deletes reachable history.
 *
 * The key is the *common dir* (`git rev-parse --git-common-dir`), not the worktree
 * path. Worktrees share one object database, so two tabs open on two worktrees are
 * one repository for our purposes and must share a queue.
 *
 * This only covers commands this process runs. Git started elsewhere (a terminal,
 * an IDE) is invisible to us, which is why callers should also prefer read-only
 * probes like `ls-remote` over a fetch when all they need is a remote SHA.
 */

type Task<T> = () => Promise<T>;

/** Tail of the promise chain per object store; awaiting it waits for the queue to drain. */
const tails = new Map<string, Promise<unknown>>();
/** Number of queued-or-running tasks per object store. */
const pending = new Map<string, number>();

/** Whether any git command is queued or running for `key`. */
export function isGitBusy(key: string): boolean {
  return (pending.get(key) ?? 0) > 0;
}

/** Queued-or-running command count for `key`, for diagnostics and UI. */
export function gitQueueDepth(key: string): number {
  return pending.get(key) ?? 0;
}

/**
 * Run `task` once every previously queued task for `key` has settled.
 * Rejections propagate to the caller but never break the chain for later tasks.
 */
export function withGitLock<T>(key: string, task: Task<T>): Promise<T> {
  pending.set(key, (pending.get(key) ?? 0) + 1);

  const previous = tails.get(key) ?? Promise.resolve();
  // Run on both settle paths: one task failing must not strand the queue.
  const run = previous.then(task, task);

  const settled = run
    .catch(() => { /* surfaced to the caller via `run` */ })
    .then(() => {
      const left = (pending.get(key) ?? 1) - 1;
      if (left > 0) {
        pending.set(key, left);
      } else {
        pending.delete(key);
        // Only clear the tail if nothing queued behind us.
        if (tails.get(key) === settled)
          tails.delete(key);
      }
    });

  tails.set(key, settled);
  return run;
}

/**
 * Like `withGitLock`, but drops the task instead of queueing it when the store is
 * busy, returning null. For polling: a tick that arrives while the previous one is
 * still running should be skipped, not stacked up behind it.
 */
export function withGitLockIfIdle<T>(key: string, task: Task<T>): Promise<T | null> {
  if (isGitBusy(key))
    return Promise.resolve(null);
  return withGitLock(key, task);
}
