# TODO

Feature gaps.
Ordered roughly by value; the "Core" items are the ones people switch clients for.

## Core

- [x] **Interactive rebase** — "Rebase Interactively from Here..." in the commit
      context menu opens a todo editor: reorder by drag or arrows, and
      pick / reword / edit / squash / fixup / drop per commit.
      `SimpleGitAdapter.rebaseInteractive` writes the todo list and hands it to
      git through `GIT_SEQUENCE_EDITOR`, turning reword and squash into
      `exec git commit --amend -F <file>` so no editor is ever needed. A rebase
      that stops for a conflict or an edit step is handed to `RebaseBanner`.
- [x] **Blame** — the Blame tab of the File History dialog: per-line gutter with
      one heading per run of lines from the same commit, "Blame Previous" to walk
      back (following renames via git's `previous` header), Show Commit, and
      Copy SHA. `SimpleGitAdapter.blame` parses `git blame --porcelain`.
- [x] **File history** — "File History" in the file context menu, for a file or a
      directory: path-scoped commit list, the diff for each commit, rename
      tracking, and paging. `SimpleGitAdapter.fileLog` follows renames for files.
- [x] **Git merge conflict resolver** — "Resolve Conflicts..." in the diff
      viewer's conflict bar opens a 3-way resolver: per-block ours / theirs /
      both / base, all-ours and all-theirs, a text-edit fallback, a live result
      preview, and a guard against saving leftover markers. Saving writes the
      file and stages it. The marker parser is now shared with Lore in
      `src/utils/conflictMarkers.ts`.

Still to do for the four above: user documentation under `docs/`.

## Secondary

- [x] **Reflog view** — "Reflog..." in the repository menu: entries for HEAD or
      any branch, with filtering, and Checkout / Create Branch / Reset from a
      selected entry. `SimpleGitAdapter.getReflog` reads it through `git log -g`.
- [x] **Submodules** — a Submodules section in the left panel (hidden when a
      repository has none), showing the recorded commit, the described ref and
      whether a submodule is initialized or has moved. Init, update, update
      recursively, sync, reveal, and open in a new tab.
- [x] **Line-by-line staging** — "Select Lines" in the diff viewer turns the diff
      into a pickable list (click, shift-click for a run) and stages, unstages or
      discards just the selection. The patch is built by
      `src/utils/partialPatch.ts` following `git add -p`'s rules, and applied
      with `git apply`.
- [x] **Browse the full tree at a commit** — "Browse Files at This Commit..."
      opens the whole tree at that revision, read a directory at a time, with a
      preview of any file as it was then.
- [x] **GPG / SSH commit signing** — "Commit Signing..." writes this
      repository's `commit.gpgsign`, `tag.gpgsign`, `gpg.format` and
      `user.signingkey`, so anything that commits here signs the same way. The
      commit list shows each commit's signature status from `git log %G?`.
- [x] **Git-flow** — a Git Flow submenu: set up (storing the branch names and
      prefixes, creating the development branch), start a feature/release/hotfix,
      and finish one. ugit runs the branch, merge and tag commands itself, so the
      `git flow` tool doesn't need to be installed. A finish that conflicts stops
      and says so.
- [x] **Git bisect** — "Start Bisect - Mark as Bad..." and "Bisect - Mark as
      Good" on a commit, with a banner while one is running: what's checked out,
      what's left to test, and Good / Bad / Skip / Reset. The banner keeps the
      verdict on screen once git names the first bad commit.
- [x] **Stashes inline in the commit list** — each stash is shown against the
      commit it was made on, with its own context menu, as well as in the side
      panel.

Still to do for the above: user documentation under `docs/`.

## Polish

- [ ] **Search inside a diff** (Ctrl+F in the diff viewer).
- [ ] **Whitespace / hidden character options** in the diff viewer
      (ignore whitespace, show tabs and line endings).
- [ ] **Recent commit messages** — reuse a previous message when committing.
- [ ] **Repository manager** — folders/favourites, beyond the recent list.
- [ ] **Custom actions** — user-defined commands in the context menus.
- [ ] **In-app PR creation** for GitHub/GitLab/Bitbucket/Azure. ugit generates a
      compare URL and hands it to the browser.
- [ ] **Push to several branches at once**, and a remote "test connection".
- [ ] **Issue tracker link highlighting** in commit messages.
- [ ] **Branch / tag sort options**, commit message ruler, avatars.
- [ ] **Git LFS file locking** — ugit has locks for Lore only.
