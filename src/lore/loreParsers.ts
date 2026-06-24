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
  LorePushResult,
  LoreSyncResult,
  LoreBranchOpResult,
  LoreLock,
  LoreMergeResult,
  LoreOperation,
  LoreRevisionDetail,
  LoreLink,
  LoreLayer,
  LoreTreeNode,
  LoreFileInfo,
  LoreFileHistoryEntry,
  LoreBisectStep,
  LoreSharedStoreInfo,
  LoreMetadataEntry,
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
  if (l.includes('does not exist')) return 'no-remote';
  if (l.includes('ahead')) return 'ahead';
  if (l.includes('behind')) return 'behind';
  return 'unknown';
}

function sectionFromHeader(line: string): LoreChangeSection | null {
  const l = line.toLowerCase();
  if (l.startsWith('untracked files')) return 'untracked';
  if (l.startsWith('changes not staged')) return 'unstaged';
  if (l.startsWith('changes staged')) return 'staged';
  if (l.startsWith('changes in conflict')) return 'conflict';
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
    conflicted: [],
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
    if (line.startsWith('Remote branch')) {
      // e.g. "Remote branch does not exist" → no remote ref, syncState 'no-remote'.
      status.syncState = syncStateFromLine(line);
      continue;
    }
    if (line.startsWith('Local branch')) {
      status.syncState = syncStateFromLine(line);
      continue;
    }
    const pending = line.match(/^Pending\s+(merge|revert|cherry-pick)/i);
    if (pending) {
      const inc = line.match(/(?:incoming revision|revision)\s+([0-9a-fA-F]{64})/);
      status.merge = {
        inProgress: true,
        operation: pending[1].toLowerCase() as LoreOperation,
        incoming: inc ? inc[1] : undefined,
      };
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
        let path = row[2];
        // Strip a trailing merge annotation like " (M)" or " (M)!" ('!' = unresolved).
        let conflicted = false;
        const annot = path.match(/^(.*?)\s+\(([A-Z?]+)\)(!?)\s*$/);
        if (annot) { path = annot[1]; conflicted = annot[3] === '!'; }
        const change: LoreFileChange = {
          path,
          change: changeTypeFromCode(code),
          code,
          section,
          conflicted: conflicted || section === 'conflict' || undefined,
        };
        if (section === 'conflict') status.conflicted.push(change);
        else if (section === 'staged') status.staged.push(change);
        else status.unstaged.push(change);
      }
    }
  }

  status.clean = status.clean ||
    (status.staged.length === 0 && status.unstaged.length === 0 && status.conflicted.length === 0);
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
  let parents: string[] = [];
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
      case 'parent': parents = [value]; break;
      // A merge revision lists multiple parents: "Merge : <p1> <p2>".
      case 'merge': parents = value.split(/\s+/).filter(Boolean); break;
      case 'branch': rev.branch = value; break;
      case 'date': rev.date = value; break;
      // 'repository' line (in commit output) intentionally ignored here.
    }
  }

  if (rev.number == null || rev.signature == null) return null;
  return {
    number: rev.number,
    signature: rev.signature,
    parent: parents[0],
    parents,
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

/**
 * Parse `lore revision info --delta` → the revision block plus its changed files (the
 * `<CODE> <path>` rows printed after the block).
 */
export function parseRevisionDetail(text: string): LoreRevisionDetail | null {
  const lines = text.split(/\r?\n/);
  const revision = parseRevisionBlock(lines);
  if (!revision) return null;
  const files: LoreFileChange[] = [];
  let sawMessage = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    // Changed-file rows come after the indented message; match "<CODE> <path>".
    if (/^ {4}\S/.test(rawLine)) { sawMessage = true; continue; }
    if (!sawMessage) continue;
    const row = line.match(/^([A-Z]{1,2})\s+(.+?)\s*$/);
    if (row) {
      const code = row[1];
      files.push({ path: row[2], change: changeTypeFromCode(code), code, section: 'staged' });
    }
  }
  return { revision, files };
}

/**
 * Parse `lore link list`:
 *   Link <id>
 *     Link path: vendor (node 2)
 *     Source path: / (node 0)
 *     Branch: main (<hash>)
 *     Revision: <hash>
 *     Flags: None (0x0)
 */
export function parseLinkList(text: string): LoreLink[] {
  const links: LoreLink[] = [];
  let current: LoreLink | null = null;
  const push = () => { if (current) { links.push(current); current = null; } };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^no links/i.test(line)) continue;
    // Header is "Link <hexid>" (the indented "Link path:" field must NOT match).
    const head = line.match(/^Link\s+([0-9a-fA-F]{6,})\s*$/);
    if (head) { push(); current = { id: head[1], linkPath: '', sourcePath: '' }; continue; }
    if (!current) continue;
    let m;
    if ((m = line.match(/^Link path:\s*(.+?)(?:\s*\(node.*\))?$/i))) current.linkPath = m[1].trim();
    else if ((m = line.match(/^Source path:\s*(.+?)(?:\s*\(node.*\))?$/i))) current.sourcePath = m[1].trim();
    else if ((m = line.match(/^Branch:\s*(\S+)\s*(?:\(([0-9a-fA-F]+)\))?/i))) { current.branch = m[1]; current.branchId = m[2]; }
    else if ((m = line.match(/^Revision:\s*([0-9a-fA-F]+)/i))) current.revision = m[1];
  }
  push();
  return links;
}

/**
 * Parse `lore layer list` (a table):
 *   Repository                Revision                Paths
 *   <id>                      <hash>                  / -> overlay
 */
export function parseLayerList(text: string): LoreLayer[] {
  const layers: LoreLayer[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^no layers/i.test(line)) continue;
    if (/^repository\s+revision\s+paths/i.test(line)) continue; // header
    // <id> <hash> <paths...>
    const m = line.match(/^(\S+)\s+([0-9a-fA-F]+)\s+(.+)$/);
    if (m) layers.push({ repository: m[1], revision: m[2], paths: m[3].trim() });
  }
  return layers;
}

/**
 * Parse `lore repository dump` into tree nodes. Each entry line looks like:
 *   src/util.txt id 5 parent 3 sibling 4 mode 00 size 6 flags 1 addr <hash>
 *   src/ id 3 parent 0 sibling 2 mode 00 size 12 flags 0 child 5
 * `flags 0` = directory, `flags 1` = file. Header lines (Repository/Revision/Tree:) are skipped.
 */
export function parseTreeDump(text: string): LoreTreeNode[] {
  const nodes: LoreTreeNode[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    const m = line.match(/^(\S.*?)\s+id\s+\d+\s+parent\s+\d+\s+sibling\s+\d+\s+mode\s+\S+\s+size\s+(\d+)\s+flags\s+(\d+)\b/);
    if (!m) continue;
    let p = m[1];
    const isDir = m[3] === '0' || p.endsWith('/');
    if (p.endsWith('/')) p = p.slice(0, -1);
    nodes.push({ path: p, name: p.split('/').pop() || p, isDir, size: parseInt(m[2], 10) });
  }
  return nodes;
}

/**
 * Parse one step of `revision bisect`. While narrowing, the CLI prints two follow-up commands:
 *
 *   Synchronized to @4
 *   If this revision does contain the change being searched for:
 *       lore revision bisect --start @1 --end @4
 *   If this revision does not contain the change being searched for:
 *       lore revision bisect --start @4 --end @7
 *   Bisect step complete
 *
 * When the range holds a single candidate it instead prints "Revision @N contains the change
 * being searched for / Bisect complete".
 */
export function parseBisect(text: string): LoreBisectStep {
  const ranges = [...text.matchAll(/revision\s+bisect\s+--start\s+(\S+)\s+--end\s+(\S+)/g)];
  const numM = text.match(/Synchroniz(?:ed|ing) to (?:local revision )?@?(\d+)/);
  const sigM = text.match(/Synchronizing to (?:local )?revision\s+\d+\s*->\s*([0-9a-fA-F]+)/);
  const midpoint = numM
    ? { number: parseInt(numM[1], 10), signature: sigM ? sigM[1] : ZERO_SIGNATURE }
    : undefined;

  if (ranges.length >= 2) {
    return {
      midpoint,
      ifContains: { start: ranges[0][1], end: ranges[0][2] },
      ifClean: { start: ranges[1][1], end: ranges[1][2] },
      complete: false,
      raw: text,
    };
  }

  const culpritM = text.match(/Revision\s+(@?\d+)\s+contains the change/i);
  return {
    midpoint,
    complete: true,
    culprit: culpritM ? culpritM[1] : midpoint ? `@${midpoint.number}` : undefined,
    raw: text,
  };
}

/**
 * Parse `branch diff` output. The header carries each branch's latest revision; the changed-file
 * rows (`A path`, `M path`, `D path`) follow a `Found N changes` line.
 */
export function parseBranchDiff(text: string): { sourceRevision?: string; targetRevision?: string; files: LoreFileChange[] } {
  const files: LoreFileChange[] = [];
  const revs = text.match(/Revision diff base \S+ source (\S+) target (\S+)/);
  let started = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/Found\s+\d+\s+changes/i.test(line)) { started = true; continue; }
    if (!started) continue;
    const row = line.match(/^([A-Z]{1,2})\s+(.+?)\s*$/);
    if (row) files.push({ path: row[2], change: changeTypeFromCode(row[1]), code: row[1], section: 'staged' });
  }
  return { sourceRevision: revs?.[1], targetRevision: revs?.[2], files };
}

/** Parse `revision find …` output: the matching revision signature(s), one 64-hex line each. */
export function parseRevisionFind(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^([0-9a-fA-F]{64})$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Parse `file dependency list <path>` output: a `<path>:` (or `<path> (depended on by):`) header
 * followed by indented entry paths. Returns just the entries (the related file paths).
 */
export function parseDependencyList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s+\S/.test(raw)) out.push(raw.trim()); // indented entry line
  }
  return out;
}

/**
 * Parse aligned `key : value` metadata lines (`branch metadata get` / `revision metadata get`).
 * Skips indented lines (e.g. a commit message) and blanks; preserves order. The caller filters
 * out intrinsic/system keys it doesn't want to expose as editable.
 */
export function parseMetadata(text: string): LoreMetadataEntry[] {
  const out: LoreMetadataEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s/.test(rawLine)) continue; // blank or indented (message body)
    const m = rawLine.match(/^(\S[^:]*?)\s*:\s*(.*)$/);
    if (m) out.push({ key: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

/**
 * Parse `shared-store info`:
 *
 *   Shared store will be used automatically: false
 *   Remote URL: 127.0.0.1:41337
 *     Path: C:\…\shared_store
 *     Exists: true
 *
 * Zero or more `Remote URL:` blocks may follow the auto-use line.
 */
export function parseSharedStoreInfo(text: string): LoreSharedStoreInfo {
  const useAutomatically = /used automatically:\s*true/i.test(text);
  const stores: LoreSharedStoreInfo['stores'] = [];
  let cur: { remoteUrl: string; path: string; exists: boolean } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const remote = raw.match(/^\s*Remote URL:\s*(.+?)\s*$/i);
    if (remote) {
      cur = { remoteUrl: remote[1], path: '', exists: false };
      stores.push(cur);
      continue;
    }
    if (!cur) continue;
    const p = raw.match(/^\s*Path:\s*(.+?)\s*$/i);
    if (p) { cur.path = p[1]; continue; }
    const ex = raw.match(/^\s*Exists:\s*(true|false)/i);
    if (ex) { cur.exists = ex[1].toLowerCase() === 'true'; continue; }
  }
  return { useAutomatically, stores };
}

/** Parse `lore file info` (Key: value lines) into file metadata. */
export function parseFileInfo(text: string): LoreFileInfo | null {
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : undefined;
  };
  const path = get('Path');
  if (!path) return null;
  return {
    path,
    type: get('Type') ?? '',
    size: parseInt(get('Size') ?? '0', 10),
    hash: get('Hash'),
    status: get('Status'),
  };
}

/**
 * Parse `lore file history` → per-file entries. Each entry is a change-code line (e.g. "M" or
 * "A src/main.txt") followed by a revision block (Revision/Signature/Address/Branch/Date/msg).
 */
export function parseFileHistory(text: string): LoreFileHistoryEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: LoreFileHistoryEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++; // skip blanks between entries
    if (i >= lines.length) break;

    // Optional leading change-code line ("M", "A src/main.txt") — not a "Key: value" field.
    let change = '?';
    if (!/^Revision\s*:/.test(lines[i]) && /^[A-Z]/.test(lines[i].trim()) && !/:\s/.test(lines[i])) {
      change = lines[i].trim().split(/\s+/)[0];
      i++;
    }
    // The revision block runs until the next blank line (the message is indented, not blank).
    const block: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') block.push(lines[i++]);

    const rev = parseRevisionBlock(block);
    if (rev) {
      const addrLine = block.map(l => l.match(/^Address\s*:\s*(\S+)/)).find(Boolean);
      entries.push({
        change,
        number: rev.number,
        signature: rev.signature,
        address: addrLine ? addrLine[1] : undefined,
        date: rev.date,
        message: rev.message,
      });
    }
  }
  return entries;
}

/**
 * Parse full `lore history` (default) → revision blocks (newest first). `history` prints the
 * first-parent chain implicitly via ORDER and annotates only a merge's *additional* parent via
 * a single `Merge : <hash>` line (unlike `revision info`). So parents = [sequential-next, …merge].
 */
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

  const revs = blocks.map(parseRevisionBlock).filter((r): r is LoreRevision => r != null);
  return revs.map((rev, i) => {
    const seqParent = revs[i + 1]?.signature; // older neighbor = primary parent
    const annotated = rev.parents; // from Parent:/Merge: lines in this block
    const parents: string[] = [];
    if (seqParent) parents.push(seqParent);
    for (const p of annotated) if (p !== seqParent && !parents.includes(p)) parents.push(p);
    return { ...rev, parents, parent: parents[0] };
  });
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
    // Binary file: a bare path line followed by "Binary files differ".
    if (/^Binary files .*differ/i.test(lines[i].trim()) && i > 0) {
      const path = lines[i - 1].trim();
      if (path && !path.startsWith('---') && !path.startsWith('+++')) {
        files.push({ path, hunks: '', binary: true });
      }
      i++;
      continue;
    }
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

/** Parse `lore push` output into the revisions pushed + fragment/byte summary. */
export function parsePushResult(text: string): LorePushResult {
  const pushed: LorePushResult['pushed'] = [];
  let fragments: number | undefined;
  let bytes: string | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // "Pushed revision 2 -> <hash> to branch feature"
    const rev = line.match(/^Pushed revision\s+(\d+)\s*->\s*([0-9a-fA-F]{64})\s+to branch\s+(.+)$/);
    if (rev) { pushed.push({ number: parseInt(rev[1], 10), signature: rev[2], branch: rev[3].trim() }); continue; }
    // "Pushed 1 fragment(s), 227.00 bytes"
    const frag = line.match(/^Pushed\s+(\d+)\s+fragment\(s\),\s+(.+)$/);
    if (frag) { fragments = parseInt(frag[1], 10); bytes = frag[2].trim(); }
  }
  return { pushed, fragments, bytes, raw: text };
}

/** Parse `lore sync` output: either a pull-forward or an already-up-to-date no-op. */
export function parseSyncResult(text: string): LoreSyncResult {
  let branch: string | undefined;
  let toRevision: LoreRevisionRef | undefined;
  let upToDate = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // "Already on branch main latest revision 2 -> <hash>"
    const already = line.match(/^Already on branch\s+(\S+)\s+latest\s+revision\s+(\d+)\s*->\s*([0-9a-fA-F]{64})/);
    if (already) { upToDate = true; branch = already[1]; toRevision = { number: parseInt(already[2], 10), signature: already[3] }; continue; }
    // "Synchronizing to revision 2 -> <hash>"
    const sync = line.match(/^Synchronizing to revision\s+(\d+)\s*->\s*([0-9a-fA-F]{64})/);
    if (sync) { toRevision = { number: parseInt(sync[1], 10), signature: sync[2] }; continue; }
    const onBranch = line.match(/^On branch\s+(\S+)/);
    if (onBranch && !branch) branch = onBranch[1];
  }
  return { upToDate, branch, toRevision, raw: text };
}

/**
 * Parse `lore branch merge start` output. Either auto-commits (clean) or lists conflicts:
 *   Merged files, 1 updated, 0 deleted, 0 merged, 0 conflicted
 *   Committed merged repository state 3 -> <hash>          (clean → committed)
 * vs.
 *   Merged files, 0 updated, 0 deleted, 0 merged, 1 conflicted
 *   Files in conflict:
 *   f.txt
 */
export function parseMergeResult(text: string): LoreMergeResult {
  const lines = text.split(/\r?\n/);
  let counts: LoreMergeResult['counts'];
  const conflicted: string[] = [];
  let committed = false;
  let inConflictList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(/^Merged files,\s+(\d+) updated,\s+(\d+) deleted,\s+(\d+) merged,\s+(\d+) conflicted/);
    if (m) {
      counts = { updated: +m[1], deleted: +m[2], merged: +m[3], conflicted: +m[4] };
      continue;
    }
    // "Committed merged/reverted/cherry-picked repository state …" → auto-committed.
    if (/^Committed .*repository state/.test(line)) { committed = true; continue; }
    if (/^Files in conflict:/i.test(line)) { inConflictList = true; continue; }
    if (inConflictList && line) conflicted.push(line);
  }
  return { conflicted, committed, counts, raw: text };
}

/** Parse `lore branch create <name>` → "Created branch <name> at revision <hash>". */
export function parseBranchCreate(text: string): LoreBranchOpResult {
  const m = text.match(/Created branch\s+(\S+)\s+at revision\s+([0-9a-fA-F]{64})/);
  return { branch: m ? m[1] : '', signature: m ? m[2] : undefined, raw: text };
}

/** Parse `lore branch switch <name>` → final "Switched to branch <name> revision <hash>". */
export function parseBranchSwitch(text: string): LoreBranchOpResult {
  // Use the LAST match so the "Switched to branch …" line wins over "Switching branch to …".
  const re = /Switched to branch\s+(\S+)\s+revision\s+([0-9a-fA-F]{64})/g;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) last = m;
  return { branch: last ? last[1] : '', signature: last ? last[2] : undefined, raw: text };
}

/**
 * Parse `lore lock query` / `lock status` output into locks. Handles both row shapes:
 *   "<path> by <owner> on branch <hash>"   (query)
 *   "<path> by <owner> on <date>"          (status)
 * Header lines ("Locks found:", "Files locked for edit:") are skipped; empty list → [].
 */
export function parseLocks(text: string): LoreLock[] {
  const locks: LoreLock[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('locks found') || lower.startsWith('files locked') ||
        lower.startsWith('no locks') || lower.startsWith('lock ')) continue;
    const m = line.match(/^(.+?)\s+by\s+(.+?)\s+on\s+(.+)$/);
    if (!m) continue;
    const [, path, owner, rest] = m;
    const branchMatch = rest.match(/^branch\s+(\S+)/);
    locks.push({
      path: path.trim(),
      owner: owner.trim(),
      branch: branchMatch ? branchMatch[1] : undefined,
      date: branchMatch ? undefined : rest.trim(),
    });
  }
  return locks;
}

/**
 * Parse `lore lock acquire` / `lock release` output → the affected paths (the lines after the
 * "… on files:" header).
 */
export function parseLockAffectedPaths(text: string): string[] {
  const paths: string[] = [];
  let inList = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/on files:\s*$/i.test(line)) { inList = true; continue; }
    if (inList) paths.push(line);
  }
  return paths;
}

/**
 * Parse `lore link list` / `lore layer list` into entry strings. The "No links…/No layers"
 * sentinels parse to an empty list. NOTE: the populated row format is not yet captured
 * (needs a repo with links/layers) — rows are returned verbatim for now.
 */
export function parseSimpleList(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('no links') || lower.startsWith('no layers')) continue;
    // Skip obvious headers like "Links:" / "Layers:".
    if (/^(links|layers)\b.*:?$/i.test(line)) continue;
    out.push(line);
  }
  return out;
}

/**
 * Normalize a Lore diff into standard `a/ b/`-prefixed unified diff text that diff2html
 * (the renderer ugit already uses) accepts. One `diff`/`---`/`+++` block per file.
 */
export function normalizeLoreDiffForRenderer(text: string): string {
  const files = parseDiff(text);
  return files
    .filter(f => !f.binary && f.hunks.trim())
    .map(f =>
      `diff --lore a/${f.path} b/${f.path}\n` +
      `--- a/${f.path}\n` +
      `+++ b/${f.path}\n` +
      f.hunks,
    )
    .join('\n');
}
