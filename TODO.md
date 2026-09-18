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

- [ ] **Reflog view** — browse `git reflog` and restore lost commits.
- [ ] **Submodules** — list, init/update, sync, open a submodule in its own tab.
- [ ] **Line-by-line staging** — stage/discard selected lines. ugit stages by
      hunk today (`DiffViewer.handleStageChunk`).
- [ ] **Browse the full tree at a commit** — ugit only lists the files a commit
      touched; Fork lets you browse the whole tree at that revision.
- [ ] **GPG / SSH commit signing** — sign commits and tags, show signature
      status in the commit list.
- [ ] **Git-flow** — init, and feature/release/hotfix start + finish.
- [ ] **Git bisect** — exists for Lore, not for Git.
- [ ] **Stashes inline in the commit list** — instead of only the side panel.

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
