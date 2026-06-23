# TODO: Lore version control support

Status: **planning / not started**

Goal: let ugit open and manage [Lore](https://epicgames.github.io/lore/) repositories
alongside git repositories. A repository tab can be **either git or lore**.

## Design direction (decided)

Lore is **not** routed through `GitAdapter`. Earlier we considered making Lore a second
backend behind the existing `GitAdapter` abstraction (alongside `simple-git` / `es-git`).
We are **rejecting** that approach because:

- Lore is a ground-up redesign, not git-compatible. Forcing it through a git-shaped
  interface means it would constantly mimic git and hide its own model.
- Concepts diverge meaningfully (see "Conceptual differences" below). A shared interface
  would be lossy in both directions: git-only methods (stash, worktrees, LFS, reflog)
  would no-op for Lore, and Lore-native concepts (sparse views, links/layers, partitions,
  chunking) would have no home.

Instead: **Lore is its own thing with its own repository panel UI.**

- A tab carries a `type: 'git' | 'lore'`.
- Git tabs render the existing `RepositoryView` (unchanged).
- Lore tabs render a new `LoreRepositoryView`, specialized to Lore — free to present
  Lore's model directly instead of pretending to be git.
- Two UI implementations. The git side stays as-is; the lore side is purpose-built.

Tradeoff accepted: more UI code (two repository views), in exchange for each being clean
and idiomatic to its own VCS rather than a leaky shared abstraction.

## Fork point in the current code

The tab system and app chrome are repo-type-agnostic and get **reused**. The fork happens
at the repository-view level.

Reused (no fork):
- `src/App.tsx` tab model + state (`tabs`, `activeTabId`, open/clone flows) — extended, not forked
- `src/components/TabBar.tsx` — generic, no git logic
- Dialog infrastructure (ConfirmDialog / AlertDialog / ErrorDialog), SettingsContext,
  AlertContext, splitter/layout chrome
- `src/main.ts` open-folder / IPC plumbing — generic

Forked / new (Lore-specific):
- `src/components/RepositoryView.tsx` → new `LoreRepositoryView.tsx`
- `src/hooks/useGit.ts` → new `useLore.ts`
- A Lore client wrapper (analogous role to `GitAdapter`, but **separate type**, Lore-shaped)
- `src/components/BranchStashPanel.tsx`, `ContentViewer.tsx`, `RepoInfo.tsx`, `Toolbar.tsx`
  handlers → Lore equivalents (only the parts that make sense for Lore)
- Lore-specific dialogs (new)

## Wrapper scaffold — DONE (`src/lore/`)

First slice of the Lore client is built and validated against the real CLI + dev server:
- `src/lore/types.ts` — Lore-native types (revisions are numbered + signature; 3-way status;
  sync state). Deliberately NOT modeled on GitAdapter.
- `src/lore/loreProcess.ts` — `runLore()`: cwd-aware `execFile`, always injects
  `--non-interactive -P`, `LoreCommandError` on non-zero exit.
- `src/lore/loreParsers.ts` — pure parsers: `parseStatus` (3 sections + clean + sync),
  `parseCommitResult`, `parseHistory`, `parseHistoryOneline`, `parseDiff`,
  `normalizeLoreDiffForRenderer` (rewrites `--- <path>@<rev>` → `a/ b/` for diff2html).
- `src/lore/LoreClient.ts` — `LoreClient` (status/stage/unstage/reset/commit/history/diff,
  cwd=repoPath, command-state callback mirroring GitAdapter) + `createLoreRepository()`.
- `src/lore/index.ts` — public surface.

Validation: `tsc --noEmit` clean; 30 parser assertions pass against captured fixtures; live
run against the dev server exercised status→stage→status→diff→history with the command-state
callback firing. (Test harness lives in the session scratchpad, not the repo.)

Stubbed (raw passthrough, no parser yet — need fixtures): `branchListRaw`, `syncRaw`,
`pushRaw`. Next parsers to add once output is captured: branch list/info, sync, push, merge
(incl. conflict), delete/move/copy status rows, binary-file diff representation.

## UI integration — DONE (minimal `LoreRepositoryView`)

A tab now renders git or lore based on detected repo type. Git path unchanged.
- `src/utils/repoType.ts` — `detectRepositoryType()` (`.lore` → lore, `.git` → git).
- `src/lore/resolveLoreBin.ts` — finds the `lore` exe (LORE_BIN → `~/bin` → PATH).
  TODO: promote to a setting + IPC handler like a configurable git path.
- `src/hooks/useLore.ts` — creates a `LoreClient`, wires command-state, loads status+history.
- `src/components/LoreRepositoryView.tsx` — minimal Lore-native panel: header (branch /
  revision number / sync state), staged vs not-staged lists with per-file Stage/Unstage,
  Stage-all, commit message + Commit, per-file diff (as text), history list, tab ahead/behind.
- `src/App.tsx` — `Tab.type?: RepoType`; set via `detectRepositoryType` in `openRepository`;
  render branches `type === 'lore' ? <LoreRepositoryView/> : <RepositoryView/>` (falls back to
  live detection for tabs lacking a stored type).

Verified: `tsc --noEmit` clean (0 errors), `webpack --mode development` bundles successfully
(child_process/os/path resolve as node externals in the renderer). To exercise live: start the
dev server, then File → Open Repository → `D:\src\lore-dev\workspaces\clean-test`.

### diff2html rendering + sync/push — DONE
- `src/components/LoreDiffView.tsx` renders Lore diffs via diff2html (same renderer as the git
  `DiffViewer`), fed by `LoreClient.diffText()` (headers normalized a/ b/). Verified: normalized
  output round-trips through the real diff2html `parse()` (1 file, correct name, additions seen).
- `LoreRepositoryView` now shows diffs via `LoreDiffView` and has header **Sync** / **Push**
  buttons (call `client.sync()` / `client.push()`, surface raw output, then refresh).
- `parseBranchList` + `LoreClient.branchList()` added (live-verified: `{local:[main*],
  remote:[main]}`). `push`/`sync` live-verified against the dev server.

Next UI steps: parse push/sync into structured summaries (fixtures captured); show branches in
the panel; wire commit/refresh into the app toolbar/menu; Lore-native surfaces (sparse
`.lore/view`, links/layers, locks); a Lore-aware open/create flow (server-addressed `lore://`
URLs, not just folder-pick); capture the still-missing fixtures (delete/move rows, sync-when-
behind, merge/conflict, binary diff).

## Concrete steps

1. **Repo type detection.** Add `detectRepositoryType(path): 'git' | 'lore'` (check for
   `.git` vs `.lore`). Call it in `App.tsx` `openRepository()` before creating the tab.
2. **Tab model.** Add `type: 'git' | 'lore'` to the `Tab` interface in `src/App.tsx`
   (~line 18). Default existing/recent repos to `'git'` (or re-detect on open).
3. **Conditional render** in `App.tsx` (~lines 577-586):
   `tab.type === 'git' ? <RepositoryView .../> : <LoreRepositoryView .../>`.
4. **Lore client wrapper.** Build a thin module that drives the Lore CLI/SDK (see below).
   Keep it Lore-native — do not model it on `GitAdapter`'s method list.
5. **`useLore` hook** that instantiates the wrapper per repo path (mirror the lifecycle of
   `useGitAdapter` in `src/hooks/useGit.ts`, not its surface).
6. **`LoreRepositoryView`** + Lore panels/dialogs, designed around Lore's model.
7. **Open/clone flows.** Lore is centralized with sparse-by-default clones — the "clone"
   UX differs from git; design a Lore-appropriate open/sync flow rather than reusing the
   git clone dialog verbatim.

## Lore integration surface (needs decision)

Source: https://github.com/EpicGames/lore — primarily Rust. Components: `lore/` (CLI),
`lore-client/`, `lore-server/`, `lore-storage/`, `lore-capi/` (C API), etc.

- **No Node binding in the main repo.** README points to separate SDKs (JavaScript, Python,
  C#, Go) in dedicated repos. The CLI is described as 1:1 with full functionality.
- **OPEN QUESTION:** which integration path?
  - (a) Shell out to the `lore` CLI (parallel to how `simple-git` shells out to `git`).
    Lowest effort, most portable. Likely the starting point.
  - (b) Use the official JavaScript SDK (separate repo) if it's mature.
  - (c) Bind `lore-capi` via N-API. Highest effort.
- **OPEN QUESTION:** confirm the `lore` client is obtainable and runnable outside Epic's
  ecosystem, and enumerate the actual subcommands (status, commit, branch, sync, diff).
  README didn't list them; check the quickstart + `lore/` source.

## Conceptual differences from git (why Lore gets its own UI)

- **Centralized**, not distributed. The remote is the source of truth; no peer-to-peer
  clone. Offline staging/commit/branch is allowed; `sync` reconciles at push/pull.
- **Sparse by default.** Inbound `.lore/view` filtering + outbound `.loreignore`. Partial
  clones are normal — this is net-new UI surface, not present in the git view.
- **Large files via content-defined chunking (FastCDC)**, automatic/transparent — replaces
  the entire Git LFS feature set (no `lfsTrack`/`lfsFetch`/etc. equivalent needed).
- **Links & layers** replace submodules (versioned dependencies + local overlays).
- **Partitions** = access-control boundaries (one repo ↔ one partition). No git analog.
- **Revisions** (BLAKE3-hashed snapshot DAG) ≈ commits; **branches** are mutable pointers;
  explicit **staging** records intent separately from fragment production.
- Likely **no** stash / worktrees / reflog / git-style rebase.

## Effort estimate (rough)

- Repo-type detection + tab plumbing + conditional render: ~1-2 days.
- Lore CLI wrapper (core: status/log/diff/stage/commit/branch/sync): ~1-2 weeks IF the CLI
  is solid and obtainable.
- `LoreRepositoryView` + core panels/dialogs: ~1-2 weeks.
- Lore-native surfaces (sparse views, links/layers): additional weeks; partly new product
  design, not porting.

Primary risk is external: Lore CLI maturity, availability outside Epic, and pinning down
the exact command surface.

## Lore CLI command surface (researched 2026-06)

Sources: docs `reference/lore-cli-commands/`, `tutorials/quickstart/`, `reference/lore-cli-config/`,
and the `lore/` crate source (`lore/src/*.rs`).

### Grammar
The CLI uses a **noun-verb** structure (`lore <noun> <verb>`), with short aliases for the
common ones. The crate source mirrors this: `repository.rs`, `revision.rs`, `branch.rs`,
`file.rs`, `link.rs`, `layer.rs`, `dependency.rs`, `remote.rs`, `args.rs` (arg parsing).

### Command map (Lore → nearest ugit/git concept)

| Lore command | Purpose | ugit/git analog |
| --- | --- | --- |
| `lore repository create <url>` | create repo (note: takes a `lore://` URL) | `init` (but server-addressed) |
| `lore repository clone <url> [path]` | clone; supports `--view`, revision/branch, bare, virtual, layers, dependency selection | `clone` (sparse-by-default) |
| `lore repository status [PATH]` | status; `--scan` (fs walk), `--check-dirty`, `--revision-only` | `status` |
| `lore stage [PATH]` (alias `lore file stage`) | stage; has `move`/`merge` subcommands | `add` |
| `lore unstage [PATH]` | unstage | `reset <path>` |
| `lore reset [PATH]` | reset changes to file/dir | `checkout -- <path>` / discard |
| `lore dirty [PATH]` | mark files dirty so they appear in status; `move`/`copy` subcmds | (no git analog) |
| `lore diff [PATH]` / `lore revision diff <src>` | diff working or between revisions | `diff` |
| `lore commit <MSG>` (`lore revision commit`) | commit staged state; `--stats`, per-link/layer messages | `commit` |
| `lore revision amend <MSG>` | amend latest commit message | `commit --amend` |
| `lore revision history [LEN]` | log; `--revision`, `--branch`, `--only-branch`, `--oneline` | `log` |
| `lore revision info [rev]` | show revision; `--delta`, `--metadata` | `show` |
| `lore branch list` | list branches; `--archived` | `branch` |
| `lore branch create <b>` | create branch | `branch <b>` |
| `lore branch switch <b> [rev]` | switch; `--dry-run`, `--local`, `--reset`, `--bare` | `checkout`/`switch` |
| `lore branch info [b]` | branch info | — |
| `lore branch push [b]` / `lore push [b]` | push commits to remote; `--fast-forward-merge` | `push` |
| `lore branch merge start\|into\|resolve\|abort` | merge workflow; resolve `mine\|theirs` | `merge` |
| `lore branch archive <b>` | archive branch | (≈ delete, reversible) |
| `lore branch protect\|unprotect <b>` | protect branch from direct push | (server-side rule) |
| `lore sync [rev]` (`lore revision sync`) | sync working state to a revision; `--forward-changes`, `--reset` | `pull`/checkout hybrid |
| `lore revision cherry-pick <rev>` | cherry-pick; resolve/restart/unresolve/abort subcmds | `cherry-pick` |
| `lore revision revert <rev>` | revert; same subcmd family | `revert` |
| `lore revision bisect --start --end` | bisect | `bisect` |
| `lore revision find metadata\|number` | search revisions | (≈ search log) |
| `lore link add\|remove\|list` | mount sub-repos at a path | (replaces submodules) |
| `lore layer add\|remove\|list` | local overlays; `--metadata` filtering | (no git analog) |
| `lore file dependency add\|remove\|list` | per-file dependency graph | (no git analog) |
| `lore {revision,branch,repository} metadata get\|set\|clear` | key-value metadata at each level | (≈ git notes, broader) |

### VERIFIED against the real CLI (`lore 0.8.3+201`, Windows, 2026-06)

Installed at `$env:USERPROFILE\bin\lore.exe`. Top-level grammar confirmed: nouns
`repository branch revision file auth layer link` plus flat shortcuts
`status clone stage dirty unstage reset diff history commit sync push lock login service`.

- **THERE IS NO `--json` / `--format` / porcelain output. My earlier doc-based claim was
  wrong.** Checked the global help and the per-subcommand help for `status`, `history`,
  `diff`, `branch`, `repository` — none offer structured output. **The wrapper must parse
  human-readable text.** This is the dominant integration constraint and the main risk.
  - Worse than git for this: git has stable `--porcelain`/`-z` contracts; Lore has none.
  - Version is **0.8.3 (pre-1.0)** → text output is NOT a stable contract. Pin parsing to a
    known version, snapshot real outputs as fixtures, and re-verify on every CLI upgrade.
  - Mitigation to investigate: `repository dump` ("Dump repository state information") and
    `repository config` may be more machine-friendly than the human commands.

- **`diff` emits unified-diff format** — `-U/--context <n>`, `--diff3` (conflict markers),
  `--ignore-space-at-eol`, `--ignore-space-change`, `--source`/`--target` revisions.
  **This is a major reuse win: ugit's existing `DiffViewer` already parses unified diff**, so
  the Lore diff path can likely feed the current viewer with little change.

- **Global flags present on EVERY command — the wrapper should always pass these:**
  - `--repository <path>` — target a repo explicitly instead of relying on cwd. Ideal for the
    multi-tab model (each tab passes its own path; no `process.chdir`).
  - `--non-interactive` — disable prompts (e.g. per-link commit messages). **Always pass** or
    the GUI can hang.
  - `-P, --no-pager` — disable pagination. **Always pass** or commands that page will hang.
  - `--offline` / `--local` / `--remote` — control whether a command touches the server.
  - `--identity <IDENTITY>` — pick which stored auth identity to use (multi-account).
  - `--dry-run` — preview without touching the filesystem (useful for confirm dialogs).

- **`status` semantics differ from `git status` — affects the changes panel:**
  - By default status does NOT walk the filesystem; it only reports already-tracked dirty
    flags + staged state. Unflagged edits won't show.
  - `--scan` walks the fs, reconciles against the current revision, and **persists** refreshed
    dirty flags (requires write access). `--check-dirty` is a lighter re-check of
    already-dirty files. So the changes panel likely runs `status --scan` on load/refresh,
    accepting that it writes state — design the refresh around this, not around a read-only
    `git status`.
  - Status text shows `revision N -> <hash>` plus a local-vs-remote revision comparison →
    drives an ahead/behind-style tab indicator.

- **Repos are server-addressed** (`lore://host:port/name`). `repository create` and `clone`
  both take a URL — there is no purely-local "init in this folder" like `git init`. The
  open/clone UX must connect to a server, not just pick a folder.

- **First-class concepts ugit has no UI for yet:** links, layers, file-level dependencies,
  branch protect/unprotect/archive, branch `diff` (common-ancestor base), metadata at
  repo/branch/revision level, bisect, locks (`lore lock`), notifications. These justify the
  dedicated `LoreRepositoryView`.

### Auth — ANSWERED
- `lore login [remote-url]` authenticates the CLI. Interactive opens a browser; `--no-browser`
  avoids it. Non-interactive: `--token-type <api-key|eg1|lore> --token <value>` (+ `--auth-url`
  when logging in with a token outside a repo).
- `lore auth login|info|list|logout|clear` manages stored identities; multiple identities are
  supported and selected per-command via `--identity`.
- **GUI implication:** the app can surface stored identities via `auth list` / `auth info`,
  trigger `lore login` for a remote, and pass `--identity` on operations. Non-interactive
  token login is fully scriptable if the GUI wants to own the credential entry.

### Service process — investigate (possible perf path)
- `lore service run|start|stop` runs a repository in a long-lived service process.
- Open question: do ordinary CLI commands auto-route through a running service (warm
  store/connection → lower latency for frequent status polls), or is it independent? If the
  former, the GUI could `service start` per open Lore tab and `service stop` on close to make
  status/diff/history polling cheap. **Worth confirming before settling the wrapper design.**

### Config / local layout
- Per-repo: `.lore/config.toml` + local immutable store (content-addressed fragments,
  tunable capacity/compaction). Detect a Lore repo by presence of `.lore/`.
- User-level: `cli.toml` — Windows: `%LOCALAPPDATA%\Epic Games\lore\config\cli.toml`.
- Binary: ships as a prebuilt `lore.exe` (no `cargo build` needed); user installed to
  `~/bin`. The GUI must locate it (PATH or configurable path setting, mirroring how it might
  locate `git`).

### Still open
- Stability/shape of human-readable `status` / `history` output → build parser fixtures from
  real runs; decide whether `repository dump` is a better structured source.
- Whether `status --scan`'s persistence of dirty flags is acceptable on every panel refresh,
  or whether `--check-dirty` + targeted `dirty` calls give a better UX.
- Whether CLI commands reuse a running `service` process (latency/perf design).
- Exact `history` block format (multi-line vs `--oneline`) for the commit-log view parser.

## Local dev server (SET UP — working as of 2026-06-23)

Binaries (both v0.8.3) in `$env:USERPROFILE\bin`: `lore.exe` (client) + `loreserver.exe`
(server, downloaded from the GitHub release `v0.8.3`, version-matched to the client).

Dev workspace: `D:\src\lore-dev\`
- `store\`  — durable immutable+mutable store (so dev repos survive server restarts)
- `config\local.toml` — overrides: points both stores at `store\`. Cert/auth left default.
- `logs\`   — `server.out.log` (JSON logs), `server.err.log`, `server.pid`
- `start-server.ps1` / `stop-server.ps1` — helpers
- `workspaces\test-project` — a working test repo (`lore://127.0.0.1:41337/test-project`)

Server facts (from its own startup log):
- Ports **41337** (QUIC + gRPC) and **41339** (HTTP). Health: `GET http://127.0.0.1:41339/health_check` → 200.
- **Auth disabled**, **ephemeral self-signed cert** (regenerated each restart; client accepts
  it for localhost — no cert wiring needed). Single-node, local stores.
- Config is layered TOML via `--config <dir>` (loads `default.toml` then `<env>.toml` then
  `local.toml`; env defaults to `local`). No CLI flags for ports/paths — all via TOML.

Start / stop:
```
powershell D:\src\lore-dev\start-server.ps1
powershell D:\src\lore-dev\stop-server.ps1
```

Verified end-to-end: `repository create` → `status --scan` → `stage` → `commit` →
`history` → `diff` all work against this server. Real output captured in
[lore-cli-output-samples.md](lore-cli-output-samples.md).

### Wrapper-design facts learned from real runs
- **CWD matters for file-path commands.** `stage`/`diff`/`status <path>` resolve paths
  relative to the process cwd, NOT `--repository`. Wrong cwd → silent `Ignoring invalid path`
  + `No changes staged`. The wrapper must spawn with `cwd = workspace` for any path-taking
  command (whole-repo commands can use `--repository <path>` from anywhere).
- **Always pass `--non-interactive -P`** (no prompts, no pager) or the GUI can hang.
- **`diff` is standard unified diff** → feed ugit's existing DiffViewer (header form is
  `--- <path>@<rev>` / `+++ <path>`, not git's `a/ b/` — small parser tweak). `--diff3` is a
  different, verbose 3-way branch diff with preamble noise — don't confuse the two.
- **`diff` ignores staging** — it always compares working tree to a committed revision; there
  is NO git-style `diff --cached`. Same diff before/after `stage`. Panel shows per-file
  changes via `lore diff <path>` regardless of staged state.
- **status has 3 sections** = a real staged/unstaged split: `Untracked files:` /
  `Changes not staged for commit:` / `Changes staged for commit:` (+ `No tracked changes`
  when clean). Drive the panel's staged/unstaged lists from these.
- **status/commit/history are aligned `Key : value` text blocks** + indented message; parse
  accordingly. `commit` has a `Parent` line from the 2nd revision on. Prefer
  `history --oneline` (`<revNum> <message>`, newest first) for the log list.
- Canonical clean flow verified: edit → `status --scan` → `diff` → `stage` → `commit` →
  `status` shows `No tracked changes`. (Earlier `/dev/null` "whole file added" diff was an
  artifact of a bad-cwd `stage` no-op, not real behavior.)
