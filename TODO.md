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

- [x] **Search inside a diff** — Ctrl+F (or the diff settings menu) opens a find
      bar with a match count and next/previous, highlighting hits in the rendered
      diff. `src/utils/diffDecorate.ts` walks the code lines after diff2html has
      rendered them.
- [x] **Whitespace / hidden character options** — "Ignore Whitespace Changes"
      re-fetches the diff with `-w`; "Show Whitespace" draws tabs, trailing
      spaces and carriage returns.
- [x] **Recent commit messages** — a picker beside the commit box offers the last
      15 messages and splits the chosen one back into subject and description.
- [x] **Repository manager** — File > Repository Manager (Ctrl+Shift+R): groups
      the user names, favourites, filtering, moving a repository between groups,
      and adding from the recent list. Kept in settings, so it survives restarts.
- [x] **Custom actions** — commands defined in Preferences, shown in the file,
      commit, branch and repository menus, with `$REPO`, `$FILE`, `$FILES`,
      `$SHA`, `$BRANCH` and `$REMOTE_URL` substituted. They run in the repository
      with their output reported.
- [x] **In-app PR creation** — "Create Pull Request..." on a branch opens one
      through the host's API: GitHub, GitLab (merge requests), Bitbucket and
      Azure DevOps, including self-hosted installs via an API base override. The
      token is per host, and the request is made from the main process so it
      never goes through the page.
- [x] **Push to several branches at once**, and a remote "test connection" —
      the push dialog has a multi-branch mode that pushes with one command, and
      the add-remote dialog can check a URL with `ls-remote` before saving it.
- [x] **Issue tracker link highlighting** — issue references and bare URLs in a
      commit's message and body become links, with the pattern and URL template
      configurable (the default matches `#123`).
- [x] **Branch sort options, commit message ruler, avatars** — the branch panel
      toggles between grouped-by-name and most-recent-first; the commit box draws
      a guide at a configurable column (hidden when the box is too narrow) with a
      matching countdown; author pictures come from Gravatar when turned on, and
      initials when not. Tags have no list view of their own to sort.
- [x] **Git LFS file locking** — lock and unlock a tracked file from its context
      menu, with a badge naming the holder. Needs an LFS server, and says so when
      there isn't one.

Still to do for everything above: user documentation under `docs/`.
