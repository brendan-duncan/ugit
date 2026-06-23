import { runLore, LoreProcessResult } from './loreProcess';
import {
  parseStatus,
  parseHistory,
  parseHistoryOneline,
  parseCommitResult,
  parseDiff,
  normalizeLoreDiffForRenderer,
  parseBranchList,
} from './loreParsers';
import {
  LoreStatus,
  LoreRevision,
  LoreCommitResult,
  LoreFileDiff,
  LoreBranches,
} from './types';

/** Notified when a lore command starts/ends, for the busy/timing UI (mirrors GitAdapter). */
export interface LoreCommandStateCallback {
  (isRunning: boolean, id: number, command: string, startTime: number): void;
}

export interface LoreClientOptions {
  /** Absolute path to the lore executable (resolve from settings/PATH at construction). */
  bin?: string;
  commandStateCallback?: LoreCommandStateCallback | null;
}

/**
 * Client for a single Lore working tree. NOT a GitAdapter — Lore gets its own UI and model.
 * Every command runs with cwd = repoPath so file-path args resolve correctly.
 *
 * Scope note: methods with parsers (status/history/diff/commit/stage/unstage/reset/create) are
 * built against captured fixtures. branchList/sync/push return raw text until fixtures exist.
 */
export class LoreClient {
  public readonly repoPath: string;
  public bin: string;
  public commandStateCallback: LoreCommandStateCallback | null;

  private _id = 0;
  private _pending = new Map<number, string>();

  constructor(repoPath: string, options: LoreClientOptions = {}) {
    this.repoPath = repoPath;
    this.bin = options.bin ?? 'lore';
    this.commandStateCallback = options.commandStateCallback ?? null;
  }

  // --- command-state plumbing (same shape/semantics as GitAdapter) ---

  private _start(command: string, startTime: number, skip = false): number {
    const id = this._id++;
    if (skip) return id;
    this._pending.set(id, command);
    if (this.commandStateCallback) {
      setTimeout(() => this.commandStateCallback!(true, id, command, startTime), 0);
    }
    return id;
  }

  private _end(id: number, startTime: number, skip = false): void {
    if (skip) return;
    const delta = performance.now() - startTime;
    const command = this._pending.get(id) ?? '';
    if (command) {
      console.log(`[lore] ${command} (${(delta * 0.001).toFixed(2)}s)`);
      this._pending.delete(id);
    }
    if (this.commandStateCallback) {
      setTimeout(() => this.commandStateCallback!(false, id, command, delta), 0);
    }
  }

  /** Run a subcommand with command-state notification; returns captured output. */
  private async run(argv: string[], opts: { label?: string; skip?: boolean; throwOnError?: boolean } = {}): Promise<LoreProcessResult> {
    const startTime = performance.now();
    const label = opts.label ?? `lore ${argv.join(' ')}`;
    const id = this._start(label, startTime, opts.skip);
    try {
      return await runLore({
        bin: this.bin,
        cwd: this.repoPath,
        argv,
        throwOnError: opts.throwOnError ?? true,
      });
    } finally {
      this._end(id, startTime, opts.skip);
    }
  }

  // --- typed operations ---

  /**
   * Repository status. Pass `scan: true` to walk the filesystem and refresh dirty flags
   * (this PERSISTS flags — a write). Without it, only already-dirty files are reported.
   */
  async status(opts: { scan?: boolean; skipNotification?: boolean } = {}): Promise<LoreStatus> {
    const argv = ['status'];
    if (opts.scan) argv.push('--scan');
    const { stdout } = await this.run(argv, { skip: opts.skipNotification });
    return parseStatus(stdout);
  }

  /** Stage one or more paths (relative to repo root). */
  async stage(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(['stage', ...paths]);
  }

  /** Unstage one or more paths. */
  async unstage(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(['unstage', ...paths]);
  }

  /** Reset (discard) changes to one or more paths. */
  async reset(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(['reset', ...paths]);
  }

  /** Commit the staged state. Returns the produced revision. */
  async commit(message: string): Promise<LoreCommitResult | null> {
    const { stdout } = await this.run(['commit', message]);
    return parseCommitResult(stdout);
  }

  /** Revision history, newest first. `length` caps the number returned. */
  async history(length?: number): Promise<LoreRevision[]> {
    const argv = ['history'];
    if (length != null) argv.push(String(length));
    const { stdout } = await this.run(argv);
    return parseHistory(stdout);
  }

  /** Compact history list ({number, message}) for the log view. */
  async historyOneline(length?: number): Promise<Array<{ number: number; message: string }>> {
    const argv = ['history', '--oneline'];
    if (length != null) argv.push(String(length));
    const { stdout } = await this.run(argv);
    return parseHistoryOneline(stdout);
  }

  /**
   * Diff working tree against a committed revision (NOT staging-aware — Lore has no
   * diff --cached; the diff is identical whether or not a path is staged).
   * @param paths optional path filter; omit for the whole tree.
   * @param sourceRevision optional base revision signature (defaults to current revision).
   */
  async diff(paths?: string[], sourceRevision?: string): Promise<LoreFileDiff[]> {
    const argv = ['diff'];
    if (sourceRevision) argv.push('--source', sourceRevision);
    if (paths && paths.length) argv.push(...paths);
    const { stdout } = await this.run(argv);
    return parseDiff(stdout);
  }

  /** Same as diff() but returns renderer-ready unified diff text for diff2html. */
  async diffText(paths?: string[], sourceRevision?: string): Promise<string> {
    const argv = ['diff'];
    if (sourceRevision) argv.push('--source', sourceRevision);
    if (paths && paths.length) argv.push(...paths);
    const { stdout } = await this.run(argv);
    return normalizeLoreDiffForRenderer(stdout);
  }

  /** Local + remote branches (with current-branch marker). */
  async branchList(): Promise<LoreBranches> {
    const { stdout } = await this.run(['branch', 'list']);
    return parseBranchList(stdout);
  }

  /**
   * Push local commits to the remote. Returns raw progress text (the CLI prints
   * "Pushed revision N -> <hash> to branch …" lines). TODO: parse into a structured summary.
   */
  async push(branch?: string): Promise<string> {
    const argv = ['push'];
    if (branch) argv.push(branch);
    return (await this.run(argv)).stdout;
  }

  /**
   * Synchronize working state to the latest remote revision. Returns raw text (e.g.
   * "Already on branch main latest revision N -> <hash>"). TODO: parse into a summary.
   */
  async sync(): Promise<string> {
    return (await this.run(['sync'])).stdout;
  }
}

/**
 * Create a brand-new Lore repository at `repoPath` pointing at `url` (e.g.
 * lore://host:port/name). Returns the create command's raw output.
 */
export async function createLoreRepository(
  bin: string,
  repoPath: string,
  url: string,
  options: { description?: string; id?: string } = {},
): Promise<string> {
  const argv = ['repository', 'create', url, '--repository', repoPath];
  if (options.description) argv.push('--description', options.description);
  if (options.id) argv.push('--id', options.id);
  // Run from the parent dir; repo dir may not exist yet. --repository sets the target.
  const { stdout } = await runLore({ bin, cwd: repoPath, argv, throwOnError: true });
  return stdout;
}
