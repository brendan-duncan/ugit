import fs from 'fs';
import path from 'path';
import { runLore, runLoreStreaming, LoreProcessResult } from './loreProcess';
import {
  parseStatus,
  parseHistory,
  parseHistoryOneline,
  parseCommitResult,
  parseDiff,
  normalizeLoreDiffForRenderer,
  parseBranchList,
  parsePushResult,
  parseSyncResult,
  parseBranchCreate,
  parseBranchSwitch,
  parseLocks,
  parseSimpleList,
} from './loreParsers';
import {
  LoreStatus,
  LoreRevision,
  LoreCommitResult,
  LoreFileDiff,
  LoreBranches,
  LorePushResult,
  LoreSyncResult,
  LoreBranchOpResult,
  LoreLock,
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

  /** Create a new branch at the current revision. */
  async createBranch(name: string): Promise<LoreBranchOpResult> {
    const { stdout } = await this.run(['branch', 'create', name]);
    return parseBranchCreate(stdout);
  }

  /** Switch the working tree to another branch. */
  async switchBranch(name: string, revision?: string): Promise<LoreBranchOpResult> {
    const argv = ['branch', 'switch', name];
    if (revision) argv.push(revision);
    const { stdout } = await this.run(argv);
    return parseBranchSwitch(stdout);
  }

  /** Push local commits to the remote. Returns the pushed revisions + byte/fragment summary. */
  async push(branch?: string): Promise<LorePushResult> {
    const argv = ['push'];
    if (branch) argv.push(branch);
    return parsePushResult((await this.run(argv)).stdout);
  }

  /** Synchronize working state to the latest remote revision (pull-forward or no-op). */
  async sync(): Promise<LoreSyncResult> {
    return parseSyncResult((await this.run(['sync'])).stdout);
  }

  // --- Lore-native: file locks (Perforce-style exclusive checkout) ---

  /** Query current file locks (optionally scoped to a branch). */
  async locks(branch?: string): Promise<LoreLock[]> {
    const argv = ['lock', 'query'];
    if (branch) argv.push('--branch', branch);
    return parseLocks((await this.run(argv, { skip: true })).stdout);
  }

  /** Acquire an exclusive lock on one or more paths. */
  async lockAcquire(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(['lock', 'acquire', ...paths]);
  }

  /** Release a lock on one or more paths. */
  async lockRelease(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(['lock', 'release', ...paths]);
  }

  // --- Lore-native: links (sub-repo mounts) & layers (overlays), read-only for now ---

  /** List links (sub-repo mounts). Empty when none. */
  async links(): Promise<string[]> {
    return parseSimpleList((await this.run(['link', 'list'], { skip: true })).stdout);
  }

  /** List layers (local overlays). Empty when none. */
  async layers(): Promise<string[]> {
    return parseSimpleList((await this.run(['layer', 'list'], { skip: true })).stdout);
  }
}

/**
 * Create a brand-new Lore repository at `repoPath` pointing at `url` (e.g.
 * lore://host:port/name). Creates the target directory if needed. Returns the create
 * command's raw output.
 */
export async function createLoreRepository(
  bin: string,
  repoPath: string,
  url: string,
  options: { description?: string; id?: string } = {},
): Promise<string> {
  fs.mkdirSync(repoPath, { recursive: true });
  const argv = ['repository', 'create', url, '--repository', repoPath];
  if (options.description) argv.push('--description', options.description);
  if (options.id) argv.push('--id', options.id);
  const { stdout } = await runLore({ bin, cwd: repoPath, argv, throwOnError: true });
  return stdout;
}

/**
 * Clone a Lore repository from `url` into `<parentFolder>/<name>`. Supports Lore's sparse
 * `--view` filter and `--bare`/`--branch` options. Returns the clone output and the local path.
 *
 * NOTE: this awaits the whole clone (no streaming progress yet). Fine for local/dev-sized
 * repos; large clones should move to a background+progress flow like the git CloneProgressView.
 */
export async function cloneLoreRepository(
  bin: string,
  parentFolder: string,
  url: string,
  name: string,
  options: { view?: string; branch?: string; bare?: boolean } = {},
): Promise<{ output: string; path: string }> {
  fs.mkdirSync(parentFolder, { recursive: true });
  const target = path.join(parentFolder, name);
  const argv = ['repository', 'clone', url, target];
  if (options.view) argv.push('--view', options.view);
  if (options.branch) argv.push('--branch', options.branch);
  if (options.bare) argv.push('--bare');
  const { stdout } = await runLore({ bin, cwd: parentFolder, argv, throwOnError: true });
  return { output: stdout, path: target };
}

/**
 * Streaming variant of cloneLoreRepository: invokes `onProgress` with each output line as the
 * clone runs, so the UI can show live progress for large repos. Resolves with the local path.
 */
export async function cloneLoreRepositoryStreaming(
  bin: string,
  parentFolder: string,
  url: string,
  name: string,
  options: { view?: string; branch?: string; bare?: boolean } = {},
  onProgress?: (line: string) => void,
): Promise<{ output: string; path: string }> {
  fs.mkdirSync(parentFolder, { recursive: true });
  const target = path.join(parentFolder, name);
  const argv = ['repository', 'clone', url, target];
  if (options.view) argv.push('--view', options.view);
  if (options.branch) argv.push('--branch', options.branch);
  if (options.bare) argv.push('--bare');
  const { stdout } = await runLoreStreaming({ bin, cwd: parentFolder, argv, throwOnError: true, onLine: onProgress });
  return { output: stdout, path: target };
}

// --- Authentication (best-effort; see docs — the dev server runs with auth disabled, so the
// login path here is wired but UNTESTED against a secured server). ---

/**
 * Authenticate the CLI against a remote. With no token, runs an interactive (browser) login;
 * pass token+tokenType for non-interactive login. `onProgress` streams output (a browser login
 * prints a URL to visit).
 */
export async function loreLogin(
  bin: string,
  remoteUrl: string,
  options: { token?: string; tokenType?: string; authUrl?: string; noBrowser?: boolean } = {},
  onProgress?: (line: string) => void,
): Promise<string> {
  const argv = ['login', remoteUrl];
  if (options.token && options.tokenType) argv.push('--token-type', options.tokenType, '--token', options.token);
  if (options.authUrl) argv.push('--auth-url', options.authUrl);
  if (options.noBrowser) argv.push('--no-browser');
  const { stdout } = await runLoreStreaming({ bin, cwd: process.cwd(), argv, throwOnError: true, onLine: onProgress });
  return stdout;
}

/** List stored authentication identities (raw text). Empty when none are stored. */
export async function loreAuthList(bin: string): Promise<string> {
  const { stdout } = await runLore({ bin, cwd: process.cwd(), argv: ['auth', 'list'], throwOnError: false });
  return stdout;
}
