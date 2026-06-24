// Lore-native types. Deliberately NOT modeled on GitAdapter — Lore is its own VCS
// (centralized, revision-numbered, sparse-by-default). See docs/lore.md.

/** Identity of a Lore revision: a monotonically increasing number plus a content-hash signature. */
export interface LoreRevisionRef {
  /** Revision number (1, 2, 3, …). 0 means "no revision yet". */
  number: number;
  /** 64-char BLAKE3 signature, or all-zeros when there is no revision. */
  signature: string;
}

/** All-zero signature Lore prints when a revision pointer is empty. */
export const ZERO_SIGNATURE = '0'.repeat(64);

/** The kind of change to a file, derived from the status row's leading code letter. */
export type LoreChangeType = 'added' | 'modified' | 'deleted' | 'moved' | 'copied' | 'unknown';

/** Which `status` section a change appeared under. */
export type LoreChangeSection = 'untracked' | 'unstaged' | 'staged' | 'conflict';

export interface LoreFileChange {
  /** Path relative to the repository root. */
  path: string;
  /** Original path, for moves/copies. */
  from?: string;
  /** Normalized change type. */
  change: LoreChangeType;
  /** Raw status code letter as printed by the CLI (e.g. 'A', 'M', 'D'). */
  code: string;
  /** Section the row came from; `staged` rows are staged, the rest are not. */
  section: LoreChangeSection;
  /** True for an unresolved merge conflict (a `!`-marked row in `Changes in conflict:`). */
  conflicted?: boolean;
}

/** A pending conflict-capable operation. */
export type LoreOperation = 'merge' | 'revert' | 'cherry-pick';

/** In-progress merge/revert/cherry-pick state, parsed from a `Pending <op>, …` line. */
export interface LoreMergeState {
  inProgress: boolean;
  /** Which operation is pending — drives which resolve/abort subcommand the UI uses. */
  operation: LoreOperation;
  /** Incoming (source) revision signature, when present. */
  incoming?: string;
}

/** Local-vs-remote sync relationship, parsed from the status sync line. */
export type LoreSyncState = 'in-sync' | 'ahead' | 'behind' | 'diverged' | 'no-remote' | 'unknown';

export interface LoreStatus {
  /** Repository ID from the first status line. */
  repositoryId: string;
  /** Current branch name. */
  branch: string;
  /** Local branch head revision. */
  local: LoreRevisionRef;
  /** Remote branch head revision. */
  remote: LoreRevisionRef;
  /** Relationship of local to remote. */
  syncState: LoreSyncState;
  /** Files staged for commit. */
  staged: LoreFileChange[];
  /** Files changed but not staged — untracked (new) + modified-not-staged. */
  unstaged: LoreFileChange[];
  /** Files in an unresolved merge conflict (`Changes in conflict:` section). */
  conflicted: LoreFileChange[];
  /** Set when a merge is in progress (`Pending merge, …`). */
  merge?: LoreMergeState;
  /** True when the CLI reported `No tracked changes`. */
  clean: boolean;
  /** Raw CLI text, for debugging / unparsed fields. */
  raw: string;
}

/** Result of `branch merge start`: either auto-committed (clean) or stopped on conflicts. */
export interface LoreMergeResult {
  /** Paths reported under `Files in conflict:`. */
  conflicted: string[];
  /** True when the merge auto-committed (no conflicts). */
  committed: boolean;
  /** Counts from the `Merged files, N updated, N deleted, N merged, N conflicted` line. */
  counts?: { updated: number; deleted: number; merged: number; conflicted: number };
  raw: string;
}

export interface LoreRevision {
  number: number;
  signature: string;
  /** Parent signature, when present (absent on the first revision). First of `parents`. */
  parent?: string;
  /** All parent signatures. A merge revision has two (from the `Merge :` line). */
  parents: string[];
  branch: string;
  /** Raw date string (RFC-2822 form the CLI prints). */
  date: string;
  /** Commit message (may be multi-line). */
  message: string;
}

/** Result of a `commit`: the revision it produced, plus any stats line. */
export interface LoreCommitResult {
  revision: LoreRevision;
  /** e.g. "1/1 directories, 1/1 files, 38.00 bytes/38.00 bytes (1 modified, 0 deleted)". */
  stats?: string;
  raw: string;
}

/** A single file's diff, normalized to standard unified-diff text. */
export interface LoreFileDiff {
  path: string;
  /** Source revision number from the `--- <path>@<rev>` header, if present. */
  sourceRevision?: number;
  /** Unified-diff body (the `@@ … @@` hunks and context/changed lines). */
  hunks: string;
  /** True when the CLI reported `Binary files differ` (no textual diff). */
  binary?: boolean;
}

/** A revision plus its changed files (from `revision info --delta`). */
export interface LoreRevisionDetail {
  revision: LoreRevision;
  files: LoreFileChange[];
}

/** A link (sub-repo mount) from `link list`. */
export interface LoreLink {
  id: string;
  /** Mount path in this repo. */
  linkPath: string;
  /** Path inside the linked repo. */
  sourcePath: string;
  branch?: string;
  branchId?: string;
  revision?: string;
}

/** A layer (overlay) from `layer list`. */
export interface LoreLayer {
  repository: string;
  revision: string;
  /** Mapping string, e.g. "/ -> overlay". */
  paths: string;
}

export interface LoreBranchRef {
  name: string;
  /** True for the branch marked `*` (the current branch). */
  current: boolean;
}

export interface LoreBranches {
  local: LoreBranchRef[];
  remote: string[];
}

export interface LorePushedRevision {
  number: number;
  signature: string;
  branch: string;
}

export interface LorePushResult {
  /** Revisions confirmed pushed (one per `Pushed revision N -> hash to branch B` line). */
  pushed: LorePushedRevision[];
  /** Fragment count from the `Pushed N fragment(s), …` summary, if present. */
  fragments?: number;
  /** Byte summary string (e.g. "227.00 bytes"), if present. */
  bytes?: string;
  raw: string;
}

export interface LoreSyncResult {
  /** True when already up to date (no revision pulled). */
  upToDate: boolean;
  branch?: string;
  /** Revision synced to, when it pulled forward. */
  toRevision?: LoreRevisionRef;
  raw: string;
}

/** Result of a branch create/switch. */
export interface LoreBranchOpResult {
  branch: string;
  signature?: string;
  raw: string;
}

/** A file lock (Perforce-style exclusive checkout). */
export interface LoreLock {
  /** Locked path, relative to the repo root. */
  path: string;
  /** Lock owner identity, or '<unknown>' when the server has no identity (auth disabled). */
  owner: string;
  /** Branch the lock is held on (from `lock query`), as a branch id. */
  branch?: string;
  /** Acquisition date string (from `lock status`). */
  date?: string;
}

/** A node in the repository tree (from `repository dump`). */
export interface LoreTreeNode {
  /** Full path relative to repo root (e.g. "src/util.txt"). Dirs keep a trailing slash off. */
  path: string;
  /** Basename. */
  name: string;
  isDir: boolean;
  /** Size in bytes (directories report their subtree size). */
  size: number;
}

/** File metadata (from `file info`). */
export interface LoreFileInfo {
  path: string;
  type: string;
  size: number;
  hash?: string;
  /** Status char (e.g. '-' clean, 'M', 'A'). */
  status?: string;
}

/** One entry in a file's history (from `file history`): how it changed at a revision. */
export interface LoreFileHistoryEntry {
  /** Change code for this revision (A/M/D…). */
  change: string;
  number: number;
  signature: string;
  address?: string;
  date: string;
  message: string;
}

/**
 * One step of an in-progress `revision bisect`. Bisect is a *stateless* step command: each call
 * syncs the working tree to the midpoint between `start` (last known good) and `end` (first known
 * bad), then prints the two ranges to use next depending on whether the midpoint contains the
 * change. The GUI re-invokes with the chosen range until the search narrows to one revision.
 */
export interface LoreBisectStep {
  /** Revision the working tree was synced to for this step (the one to test). */
  midpoint?: LoreRevisionRef;
  /** Range to bisect next if the midpoint DOES contain the change (start exclusive, end inclusive). */
  ifContains?: { start: string; end: string };
  /** Range to bisect next if the midpoint does NOT contain the change. */
  ifClean?: { start: string; end: string };
  /** True once the search has narrowed to a single revision (`culprit` is the answer). */
  complete: boolean;
  /** The identified revision (e.g. "@2") when complete. */
  culprit?: string;
  raw: string;
}

/** One key/value metadata entry on a branch or revision (from `… metadata get`). */
export interface LoreMetadataEntry {
  key: string;
  value: string;
}

/** Result of `branch diff`: the changes in `source` that aren't in `target`. */
export interface LoreBranchDiff {
  sourceBranch: string;
  targetBranch: string;
  /** Latest revision signatures of each branch, parsed from the diff header (for per-file diffs). */
  sourceRevision?: string;
  targetRevision?: string;
  files: LoreFileChange[];
  raw: string;
}

/** One configured shared store (from `shared-store info`). */
export interface LoreSharedStore {
  /** Remote URL the store backs (e.g. "127.0.0.1:41337"). */
  remoteUrl: string;
  /** On-disk path of the store. */
  path: string;
  /** Whether the store directory currently exists. */
  exists: boolean;
}

/** Parsed `shared-store info`: the global auto-use flag plus the configured stores. */
export interface LoreSharedStoreInfo {
  /** True when clones use the shared store automatically without `--use-shared-store`. */
  useAutomatically: boolean;
  stores: LoreSharedStore[];
}

/** Per-conflict resolution choice in the interactive resolver. */
export type ConflictChoice = 'ours' | 'theirs' | 'both-ot' | 'both-to' | 'base';

/** A segment of a conflicted file: either unchanged text or a 3-way conflict block. */
export type ConflictSegment =
  | { type: 'stable'; lines: string[] }
  | { type: 'conflict'; ours: string[]; base: string[]; theirs: string[] };

/** Options shared by most Lore CLI invocations. */
export interface LoreRunOptions {
  /** Extra CLI args appended after the subcommand. */
  args?: string[];
  /** Label shown in the command-state callback (defaults to the joined argv). */
  label?: string;
  /** Don't emit start/end command-state notifications. */
  skipNotification?: boolean;
}
