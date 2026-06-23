// Lore-native types. Deliberately NOT modeled on GitAdapter — Lore is its own VCS
// (centralized, revision-numbered, sparse-by-default). See docs/lore-support-todo.md.

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
export type LoreChangeSection = 'untracked' | 'unstaged' | 'staged';

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
}

/** Local-vs-remote sync relationship, parsed from the status sync line. */
export type LoreSyncState = 'in-sync' | 'ahead' | 'behind' | 'diverged' | 'unknown';

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
  /** True when the CLI reported `No tracked changes`. */
  clean: boolean;
  /** Raw CLI text, for debugging / unparsed fields. */
  raw: string;
}

export interface LoreRevision {
  number: number;
  signature: string;
  /** Parent signature, when present (absent on the first revision). */
  parent?: string;
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

/** Options shared by most Lore CLI invocations. */
export interface LoreRunOptions {
  /** Extra CLI args appended after the subcommand. */
  args?: string[];
  /** Label shown in the command-state callback (defaults to the joined argv). */
  label?: string;
  /** Don't emit start/end command-state notifications. */
  skipNotification?: boolean;
}
