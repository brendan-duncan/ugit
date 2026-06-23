// Pure parsers for the lore CLI's human-readable output. There is no --json mode, so these
// scrape text. Fixtures they were built against live in docs/lore-cli-output-samples.md.
// Keep these dependency-free (types only) so they stay trivially testable.

import {
  LoreStatus,
  LoreFileChange,
  LoreChangeType,
  LoreChangeSection,
  LoreSyncState,
  LoreRevision,
  LoreCommitResult,
  LoreFileDiff,
  LoreRevisionRef,
  LoreBranches,
  ZERO_SIGNATURE,
} from './types';

/** Map a status-row code letter to a normalized change type. */
export function changeTypeFromCode(code: string): LoreChangeType {
  switch (code.toUpperCase()) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'moved';   // rename/move (provisional — confirm letter against a real move)
    case 'C': return 'copied';  // provisional
    default:  return 'unknown';
  }
}

function syncStateFromLine(line: string): LoreSyncState {
  const l = line.toLowerCase();
  if (l.includes('in sync')) return 'in-sync';
  if (l.includes('diverged')) return 'diverged';
  if (l.includes('ahead')) return 'ahead';
  if (l.includes('behind')) return 'behind';
  return 'unknown';
}

function sectionFromHeader(line: string): LoreChangeSection | null {
  const l = line.toLowerCase();
  if (l.startsWith('untracked files')) return 'untracked';
  if (l.startsWith('changes not staged')) return 'unstaged';
  if (l.startsWith('changes staged')) return 'staged';
  return null;
}

// "On branch main revision 1 -> <hash>"  /  "Remote revision 0 -> <hash>"
const REVISION_RE = /revision\s+(\d+)\s*->\s*([0-9a-fA-F]{64})/;
// A file row: leading 1-2 letter code, then the path. e.g. "A hello.txt", "M a.txt".
const FILE_ROW_RE = /^([A-Z]{1,2})\s+(.+?)\s*$/;

function refFrom(match: RegExpMatchArray | null): LoreRevisionRef {
  if (!match) return { number: 0, signature: ZERO_SIGNATURE };
  return { number: parseInt(match[1], 10), signature: match[2] };
}

/**
 * Parse `lore status` (with or without --scan). Handles the three sections
 * (Untracked / Changes not staged / Changes staged) and the `No tracked changes` clean state.
 */
export function parseStatus(text: string): LoreStatus {
  const lines = text.split(/\r?\n/);
  const status: LoreStatus = {
    repositoryId: '',
    branch: '',
    local: { number: 0, signature: ZERO_SIGNATURE },
    remote: { number: 0, signature: ZERO_SIGNATURE },
    syncState: 'unknown',
    staged: [],
    unstaged: [],
    clean: false,
    raw: text,
  };

  let section: LoreChangeSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith('Repository ')) {
      status.repositoryId = line.slice('Repository '.length).trim();
      continue;
    }
    if (line.startsWith('On branch ')) {
      const branchMatch = line.match(/^On branch\s+(\S+)/);
      if (branchMatch) status.branch = branchMatch[1];
      status.local = refFrom(line.match(REVISION_RE));
      continue;
    }
    if (line.startsWith('Remote revision')) {
      status.remote = refFrom(line.match(REVISION_RE));
      continue;
    }
    if (line.startsWith('Local branch')) {
      status.syncState = syncStateFromLine(line);
      continue;
    }
    if (line.startsWith('No tracked changes')) {
      status.clean = true;
      continue;
    }
    // Summary line, ignore (we derive counts from the rows themselves).
    if (line.startsWith('Tracked changes:')) continue;

    const header = sectionFromHeader(line);
    if (header) { section = header; continue; }

    if (section) {
      const row = line.match(FILE_ROW_RE);
      if (row) {
        const code = row[1];
        const change: LoreFileChange = {
          path: row[2],
          change: changeTypeFromCode(code),
          code,
          section,
        };
        if (section === 'staged') status.staged.push(change);
        else status.unstaged.push(change);
      }
    }
  }

  status.clean = status.clean || (status.staged.length === 0 && status.unstaged.length === 0);
  return status;
}

// Aligned "Key       : value" blocks used by commit & history.
const KV_RE = /^([A-Za-z]+)\s*:\s*(.*)$/;

/**
 * Parse one revision block (the aligned Key:value lines + the 4-space-indented message).
 * Used by both `commit` output and `history` (default, non-oneline) output.
 */
export function parseRevisionBlock(lines: string[]): LoreRevision | null {
  const rev: Partial<LoreRevision> = {};
  const messageLines: string[] = [];
  let sawNumber = false;

  for (const line of lines) {
    const indented = /^ {4}\S/.test(line) || (line.startsWith('    ') && line.trim().length > 0);
    if (indented && sawNumber) {
      messageLines.push(line.replace(/^ {4}/, ''));
      continue;
    }
    const kv = line.match(KV_RE);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();
    switch (key) {
      case 'revision': rev.number = parseInt(value, 10); sawNumber = true; break;
      case 'signature': rev.signature = value; break;
      case 'parent': rev.parent = value; break;
      case 'branch': rev.branch = value; break;
      case 'date': rev.date = value; break;
      // 'repository' line (in commit output) intentionally ignored here.
    }
  }

  if (rev.number == null || rev.signature == null) return null;
  return {
    number: rev.number,
    signature: rev.signature,
    parent: rev.parent,
    branch: rev.branch ?? '',
    date: rev.date ?? '',
    message: messageLines.join('\n').trim(),
  };
}

/** Parse `lore commit` output into the produced revision + stats line. */
export function parseCommitResult(text: string): LoreCommitResult | null {
  const lines = text.split(/\r?\n/);
  const statsLine = lines.find(l => l.startsWith('Committed '))?.trim();
  const rev = parseRevisionBlock(lines);
  if (!rev) return null;
  return { revision: rev, stats: statsLine, raw: text };
}

/** Parse `lore history --oneline` → newest-first list of {number, message}. */
export function parseHistoryOneline(text: string): Array<{ number: number; message: string }> {
  const out: Array<{ number: number; message: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (m) out.push({ number: parseInt(m[1], 10), message: m[2] });
  }
  return out;
}

/** Parse full `lore history` (default) → list of revision blocks (newest first). */
export function parseHistory(text: string): LoreRevision[] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^Revision\s*:/.test(line)) {
      if (current.length) blocks.push(current);
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks.map(parseRevisionBlock).filter((r): r is LoreRevision => r != null);
}

/**
 * Parse `lore branch list`:
 *   Local branches:
 *   * main
 *   Remote branches:
 *     main
 * `*` marks the current local branch.
 */
export function parseBranchList(text: string): LoreBranches {
  const result: LoreBranches = { local: [], remote: [] };
  let section: 'local' | 'remote' | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const lower = line.trim().toLowerCase();
    if (lower.startsWith('local branches')) { section = 'local'; continue; }
    if (lower.startsWith('remote branches')) { section = 'remote'; continue; }
    if (!section) continue;
    const current = line.trimStart().startsWith('*');
    const name = line.replace(/^\s*\*?\s*/, '').trim();
    if (!name) continue;
    if (section === 'local') result.local.push({ name, current });
    else result.remote.push(name);
  }
  return result;
}

/**
 * Parse `lore diff` (two-way unified). Lore's per-file header is:
 *   <blank>
 *   <path>
 *   --- <path>@<rev>
 *   +++ <path>
 *   @@ ... @@
 * Returns one entry per file with the unified hunk text.
 */
export function parseDiff(text: string): LoreFileDiff[] {
  const lines = text.split(/\r?\n/);
  const files: LoreFileDiff[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('--- ')) {
      const minus = lines[i];
      const plus = lines[i + 1] ?? '';
      // Path: prefer the +++ side (the working/target path, no @rev suffix).
      const plusPath = plus.startsWith('+++ ') ? plus.slice(4).trim() : '';
      const minusMatch = minus.slice(4).trim().match(/^(.*)@(\d+)$/);
      const path = plusPath || (minusMatch ? minusMatch[1] : minus.slice(4).trim());
      const sourceRevision = minusMatch ? parseInt(minusMatch[2], 10) : undefined;

      // Collect hunks until the next file header (its '--- ' line, which is preceded by a
      // bare path line) or end of input.
      const hunks: string[] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        if (lines[j].startsWith('--- ') && (hunks.length > 0)) break;
        // A bare path line followed by '--- ' marks the next file; stop before it.
        if (lines[j + 1]?.startsWith('--- ') && lines[j].trim() && !lines[j].startsWith('@@')
            && !/^[ +\-\\]/.test(lines[j])) {
          break;
        }
        hunks.push(lines[j]);
      }
      files.push({ path, sourceRevision, hunks: hunks.join('\n').replace(/\s+$/, '') });
      i = j;
    } else {
      i++;
    }
  }
  return files;
}

/**
 * Normalize a Lore diff into standard `a/ b/`-prefixed unified diff text that diff2html
 * (the renderer ugit already uses) accepts. One `diff`/`---`/`+++` block per file.
 */
export function normalizeLoreDiffForRenderer(text: string): string {
  const files = parseDiff(text);
  return files
    .map(f =>
      `diff --lore a/${f.path} b/${f.path}\n` +
      `--- a/${f.path}\n` +
      `+++ b/${f.path}\n` +
      f.hunks,
    )
    .join('\n');
}
