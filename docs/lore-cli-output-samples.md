# Lore CLI output samples (parser fixtures)

Captured from `lore 0.8.3+201` against the local dev server (`loreserver 0.8.3`) on
2026-06-23, Windows. These are the real text formats the Lore wrapper must parse — there is
**no `--json`/structured output**, so treat these as parser fixtures and re-verify on CLI
upgrades (output is not a stable contract pre-1.0).

Conventions used in capture: every command run with `--non-interactive -P` (no pager). For
commands that take **file path arguments** (`stage`, `diff`, `status <path>`), the process
**cwd must be the repository root** — paths are resolved relative to cwd, NOT to
`--repository`. For whole-repo commands (`status`, `history`, `commit`) you can instead pass
`--repository <path>` and run from anywhere.

---

## repository create

```
$ lore repository create lore://127.0.0.1:41337/test-project --repository <ws> --description "..."
Created repository test-project in D:/src/lore-dev/workspaces/test-project with ID 019ef4a9742d79d2bfc58c8735ff05db
```
Creates `<ws>/.lore/` containing: `immutable/`, `mutable/`, `config.toml`, `id`, `instance`.

## status (`status --scan`)

```
Repository 019ef4a9742d79d2bfc58c8735ff05db
On branch main revision 0 -> 0000000000000000000000000000000000000000000000000000000000000000
Remote revision 0 -> 0000000000000000000000000000000000000000000000000000000000000000
Local branch in sync with remote
Untracked files:
A hello.txt
A sample.bin
Tracked changes: 2 added
```

After a commit (local ahead of remote):
```
Repository 019ef4a9742d79d2bfc58c8735ff05db
On branch main revision 1 -> 81780df55f93fc343298fdbc3fc516a1c20f8d927cfb4c9d8e8f2f55e6b538bc
Remote revision 0 -> 0000000000000000000000000000000000000000000000000000000000000000
Local branch is ahead of remote
Untracked files:
A hello.txt
A sample.bin
Tracked changes: 2 added
```

Parse notes:
- Line 1: `Repository <repoId>`.
- Line 2: `On branch <name> revision <localN> -> <hash>`.
- Line 3: `Remote revision <remoteN> -> <hash>` (all-zero hash = none).
- Line 4: sync state, one of `Local branch in sync with remote` /
  `Local branch is ahead of remote` / (presumably behind/diverged variants) → tab ahead/behind.
- File rows: `<X> <path>` where X is a status code (`A` add seen). Section headers like
  `Untracked files:` precede them. `Tracked changes: N added` is a summary line.
- `--scan` PERSISTS refreshed dirty flags (a write). Without `--scan`, only already-dirty
  files are reported. `--check-dirty` is a lighter re-check.

## stage

Success (cwd = repo root):
```
Staging file system changes
Staging 1 files (0 modified, 1 added, 0 deleted, 0 moved)
Staged repository state c5f290ed3c7f07344c25647aabda5eb90fe3e63f33b63df4094d5c528c2e7c91
```
Failure when cwd is NOT the repo root (path resolved against wrong cwd):
```
Staging file system changes
Ignoring invalid path: hello.txt
No changes staged
```
GOTCHA: the wrapper must set cwd to the workspace (or pass paths the CLI resolves correctly)
or staging silently no-ops with `Ignoring invalid path`.

## commit

First commit (no parent):
```
Fragmenting files and updating tree hashes
Committing staged changes
Committed 1/1 directories, 1/1 files, 20.00 bytes/20.00 bytes (1 modified, 0 deleted)
Repository: 019ef4ae3e3476a3aa500e61bb92777e
Revision  : 1
Signature : c55bf54c6af67473d3c877283a23e59d329597c14c38b44dc368e621b3b498ed
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Tue, 23 Jun 2026 13:32:00 +0000
    rev1: add a.txt
Commit succeeded
```
Second commit (gains a `Parent` line + `Stored history for N nodes`):
```
Committed 1/1 directories, 1/1 files, 38.00 bytes/38.00 bytes (1 modified, 0 deleted)
Stored history for 1 nodes
Repository: 019ef4ae3e3476a3aa500e61bb92777e
Revision  : 2
Signature : 5cfaa95dc45e6ddde80ba3545b45b535586d86df2eb805ef02deb8c8222586dc
Parent    : c55bf54c6af67473d3c877283a23e59d329597c14c38b44dc368e621b3b498ed
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Tue, 23 Jun 2026 13:32:20 +0000
    rev2: modify a.txt
Commit succeeded
```
Parse notes: aligned `Key       : value` block (padding before the colon); message indented
4 spaces; RFC-2822 date. `Parent` is present only when a parent exists. The
`Committed X/Y directories, A/B files, N bytes/M bytes (P modified, Q deleted)` line is a
useful progress/stats source.

## history

Default (block per revision, same shape as commit minus the Repository line):
```
Revision  : 1
Signature : 81780df55f93fc343298fdbc3fc516a1c20f8d927cfb4c9d8e8f2f55e6b538bc
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Tue, 23 Jun 2026 13:26:59 +0000
    Initial revision
```
`--oneline`:
```
1 Initial revision
```
Parse notes: prefer `--oneline` (`<revNumber> <message>`) for the log list; fetch the full
block for the detail pane. Revisions are numbered (1,2,3…) AND hash-identified.

## status — the three sections (canonical, from a clean run)

Lore exposes a real staged/unstaged split. The body of `status` is one of:
- `Untracked files:` → new files, rows `A <path>` (also summarized `Tracked changes: N added`)
- `Changes not staged for commit:` → modified tracked files, rows `M <path>`
  (`Tracked changes: N modified`)
- `Changes staged for commit:` → staged rows `A <path>` / `M <path>` (note trailing space)
- `No tracked changes` → clean working tree

Maps directly onto ugit's staged vs unstaged lists. Row code letters seen: `A` add,
`M` modify (expect `D` delete, plus move/copy per the stage stats line).

## diff (unified, two-way: working tree vs a committed revision)

Real delta (working tree vs current revision; `a.txt` modified after rev1):
```

a.txt
--- a.txt@1
+++ a.txt
@@ -1,3 +1,4 @@
 alpha
-beta
+BETA-changed
 gamma
+delta-new

```
Parse notes:
- Blank line + bare `<path>` header precedes each file's unified diff, then standard
  `--- <src>` / `+++ <tgt>` / `@@` hunks → **reuse ugit's DiffViewer**, BUT the header form is
  `--- <path>@<revNum>` (source) and `+++ <path>` (working), NOT git's `a/…` `b/…`. Tweak the
  header parser to accept the `<path>@<rev>` form.
- **`diff` compares working tree to a committed revision and IGNORES staging** — the diff is
  identical before and after `lore stage <path>` (verified). There is no git-style
  `diff --cached` / staged-vs-unstaged distinction; to show a file's changes in the panel just
  run `lore diff <path>` regardless of staged state.
- Clean tree (working == revision) → **empty output, exit 0** (the earlier `/dev/null`
  "whole file added" capture was an artifact of a broken first run where `stage` no-op'd on a
  bad cwd; it does NOT happen on a clean stage→commit→edit→diff flow).
- Flags: `-U/--context <n>`, `--ignore-space-at-eol`, `--ignore-space-change`,
  `--source <rev>` (base) / `--target <rev>`.

## diff --diff3 (3-way branch/revision diff — NOT a working-tree conflict diff)

```
Branch diff branch <id> revision <hash> -> branch <id> revision <hash>
Revision diff base <hash> source <hash> target <hash>
Calculating 3-way diff between
  base 1 -> <hash>
  source 1 -> <hash>
  target 1 -> <hash>
Diff source branch revisions (streaming)
Sorting 0 source changes
Diff target branch revisions (streaming)
```
GOTCHA: `--diff3` prints verbose streaming/preamble status lines before any file content;
the parser must skip these. Different beast from the plain two-way `diff`.

---

## Canonical changes-panel sequence (RESOLVED)

Verified clean flow (cwd = repo root throughout), `clean-test` repo:
1. edit file → `lore status --scan` lists it under the right section (`Untracked` / `Changes
   not staged`).
2. `lore diff <path>` → unified delta vs current revision (empty if unchanged).
3. `lore stage <path>` → status moves it to `Changes staged for commit:`; `diff` output is
   UNCHANGED by staging (diff is always working-vs-revision).
4. `lore commit "<msg>"` → new revision; `status --scan` then reports `No tracked changes`.
5. `lore diff --source <prevRevSig> <path>` → delta between an earlier revision and working.

Implication for the panel: drive staged/unstaged lists from the three `status` sections;
drive per-file diffs from `lore diff <path>` (no separate staged-diff command needed).

## branch list

```
Local branches:
* main
Remote branches:
  main
```
Parse notes: two sections (`Local branches:` / `Remote branches:`); `*` marks the current
local branch. Parsed by `parseBranchList`.

## push

```
Pushing 1 fragment(s)
Pushed 1 fragment(s), 124.00 bytes
Pushing c55bf54c…b498ed to branch main
Pushed revision 1 -> c55bf54c…b498ed to branch main
Pushing 5cfaa95d…2586dc to branch main
Pushed revision 2 -> 5cfaa95d…2586dc to branch main
```
After push, `status` shows `Remote revision 2 -> <hash>` and `Local branch in sync with
remote`. Parse notes (TODO): summarize from the `Pushed revision N -> <hash> to branch <b>`
lines. Currently surfaced raw in the UI.

## sync (already up to date)

```
Already on branch main latest revision 2 -> 5cfaa95d…2586dc
```
TODO: also capture sync when behind (actually pulls a new revision). Currently surfaced raw.

## branch create

```
Created branch feature at revision 7fe9e9d8…dda545
```
Parse: `Created branch <name> at revision <hash>`.

## branch switch

No file changes (same revision):
```
Switching branch to feature, using current local latest revision 7fe9e9d8…
Switched to branch feature revision 7fe9e9d8…
```
With file changes (deltas applied):
```
Switching branch to main, using current remote latest revision 7fe9e9d8…
Calculating deltas 2 -> 1
Verifying 1 changes with local file system
Switched to branch main revision 7fe9e9d8…
```
Parse the final `Switched to branch <name> revision <hash>` line for the result.

## status — extra sync-line variants

- `Remote branch does not exist` → branch not yet pushed. New sync state: `no-remote`.
- `Local branch is behind remote` → `behind` (seen on a stale clone before sync).

## push (branch + summary lines)

```
Creating branch feature at 7fe9e9d8…           (only when the remote branch is new)
Pushing 1 fragment(s)
Pushed 1 fragment(s), 227.00 bytes
Pushing 5b2ba28a… to branch feature
Pushed revision 2 -> 5b2ba28a… to branch feature
```
Parse: one or more `Pushed revision <N> -> <hash> to branch <branch>` lines (the structured
result), plus the `Pushed <n> fragment(s), <bytes>` summary. `Creating branch …` appears only
for a brand-new remote branch.

## sync (pull-forward, when behind)

```
Sync from remote lore://127.0.0.1:41337
On branch main revision 1 -> 7fe9e9d8…
Synchronizing to revision 2 -> 96000046…
Calculating deltas 1 -> 2
Verifying 1 changes with local file system
```
vs. already up to date: `Already on branch <b> latest revision <N> -> <hash>`.
Parse: `Synchronizing to revision <N> -> <hash>` (pulled) OR the `Already on branch …` line
(no-op). `Sync from remote <url>` gives the remote URL.

## auth list

Empty output (exit 0) when no identities are stored — the dev server has auth disabled, so no
login is needed. (Auth-required error shape against a secured server: still TODO.)

## file locks (Perforce-style)

`lore lock acquire <paths>`:
```
Lock acquired on files:
f.txt
```
`lore lock status <paths>`:
```
Files locked for edit:
f.txt by <unknown> on Tue, 23 Jun 2026 17:12:34 +0000
```
`lore lock query [--branch <b>] [--owner <id>] [--path <p>]`:
```
Locks found:
f.txt by <unknown> on branch e726318bbc3fd75ac8733a7e030cc35b
```
(empty list → just `Locks found:` with no rows). `lore lock release <paths>`:
```
Lock released on files:
f.txt
```
Parse notes: lock rows are `<path> by <owner> on branch <hash>` (query) or
`<path> by <owner> on <date>` (status). Owner is `<unknown>` here because the dev server has
auth disabled (no identity). `query` is the list source for the panel; `acquire`/`release`
return a `… on files:` block listing affected paths.

## links / layers (empty in dev)

```
$ lore link list   -> No links found in this repository
$ lore layer list  -> No layers
```
Populated formats are still TODO (need a second repo to link/layer). Parser treats the
"No links…/No layers" lines as empty lists.

## sparse view filter (`clone --view <file>`)

The view file is **gitignore-style exclusion syntax** (confirmed from `scripts/test/test_view.py`
in the lore repo + live tests). `**` excludes everything; `!pattern` re-includes. Example that
checks out ONLY `src/`:
```
**
!src/**
```
Behavior (verified):
- Applied at **clone time** via `--view`. Materializes only the non-excluded paths.
- The view is **persisted** in the clone at `.lore/view` (so an open repo's active view is
  readable/editable).
- Editing `.lore/view` + `sync` does **NOT** retroactively re-materialize the current
  checkout (sync is a no-op when the revision is unchanged). The view governs what *future*
  syncs fetch and what a *clone* materializes — not a live re-apply of the current revision.
- GOTCHA: the view file must be written **without a UTF-8 BOM**. A BOM corrupts the first
  line and the filter silently does nothing (everything materializes). Node `fs.writeFileSync(…,
  'utf8')` is BOM-free; PowerShell `Set-Content -Encoding utf8` (5.1) is NOT.

## merge (`branch merge start <branch>` — merges <branch> INTO current)

Clean merge (auto-commits):
```
... (3-way diff streaming) ...
Merged files, 1 updated, 0 deleted, 0 merged, 0 conflicted
Staged merged repository state <hash>
Committed merged repository state 3 -> <hash>
```
Conflict merge (stops, exit still 0):
```
Merged files, 0 updated, 0 deleted, 0 merged, 1 conflicted
Staged merged repository state <hash>
Files in conflict:
f.txt
```
Parse (`parseMergeResult`): `Merged files, N updated, N deleted, N merged, N conflicted`
counts; `Committed merged repository state` → auto-committed; `Files in conflict:` list.

**status during a merge:**
```
On branch main revision 2 -> <hash>
...
Pending merge, incoming revision <hash>
Changes in conflict:
M  f.txt (M)!
```
- `Pending merge, incoming revision <hash>` → `status.merge = { inProgress, incoming }`.
- `Changes in conflict:` rows look like `M  f.txt (M)!` — the trailing `(M)` annotation and
  `!` (unresolved) are stripped; the file goes to `status.conflicted`.
- After `branch merge resolve theirs f.txt`, the row moves to `Changes staged for commit:` as
  `M f.txt (M)` (no `!`); `commit` then completes the merge.

**Conflict markers** written to the file (diff3 style): `<<<<<<< ours` / `||||||| original`
/ `=======` / `>>>>>>> theirs`. `lore diff` shows them as added lines.

## OPEN / to investigate
- Capture `D` (delete), move, and copy rows in status, and the corresponding diff output.
- Capture `sync` when the local branch is BEHIND (a real pull), and `push` to a protected
  branch (rejection path).
- Capture merge + merge-conflict (`branch merge`, `--diff3` working-tree) output.
- Binary file handling: how `status`/`diff` represent `sample.bin` (chunked, no text diff).
