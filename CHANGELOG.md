## Unreleased

### New Features

* Added "Reflog..." to the repository menu, for finding commits nothing points at
  any more: browse where HEAD or a branch has pointed, then check an entry out,
  branch from it, or reset the current branch to it.
* Added a Submodules section to the left panel, with initialize, update, update
  recursively and sync, and opening a submodule in its own tab. It stays hidden
  for repositories without submodules.
* Added "Select Lines" to the diff viewer: pick individual changed lines - click,
  or shift-click for a run - and stage, unstage or discard only those.
* Added "Browse Files at This Commit..." to the commit context menu, to walk the
  whole tree at that revision and read any file as it was then.
* Added "Commit Signing..." to the repository menu, for this repository's signing
  settings, and the commit list now shows each commit's signature status.
* Added a Git Flow submenu to the repository menu: set up the branch names and
  prefixes, and start or finish a feature, release or hotfix. The branch, merge
  and tag commands are run directly, so git-flow doesn't have to be installed.
* Added git bisect: mark a commit bad to start, mark others good or bad, and a
  banner shows what's checked out, what's left to test, and the first bad commit
  when git finds it.
* Stashes now appear in the commit list against the commit they were made on, as
  well as in the Stashes panel.

* Added "File History" to the file and folder context menus: the commits that
  touched a path, the diff each one made, rename tracking and paging.
* Added a "Blame" tab to the File History dialog, with a per-line gutter, "Blame
  Previous" to walk back through earlier revisions - following renames - and
  actions to show the commit or copy its SHA.
* Added "Rebase Interactively from Here..." to the commit context menu. Commits
  can be reordered, and picked, reworded, edited, squashed, fixed up or dropped.
  A rebase that stops for a conflict or an edit step is reported by the existing
  rebase banner.
* Added "Resolve Conflicts..." to the diff viewer's conflict bar: a 3-way
  resolver that takes each conflict block on its own - ours, theirs, both or
  base - with all-ours and all-theirs, a text-edit fallback and a result
  preview. Saving stages the resolved file, and a result that still has conflict
  markers is refused.

## v1.9.1

### New Features

* Added "Push Tags..." to the repository menu, to push local tags without pushing a branch.
* Added "Sync Tags from Origin..." to the repository menu, which resets local tags that differ from origin back to the commits origin has them on. Local-only tags are left alone.

### Improvements

* Tags that can't be pushed because origin already has them at a different commit now offer to reset them to origin, instead of just naming the git command to run.

### Bug Fixes

* The remote list is no longer empty in a partial clone, where `git remote -v` appends a filter spec to each line.
* Release builds now upload installers with a retry instead of timing out on a slow transfer, and the release stays a draft until every installer is uploaded.

## v1.9.0

### New Features

* Added "Clean Up Abandoned Pack Files..." to the repository menu, to reclaim space left behind by interrupted fetches.

### Improvements

* The commit list now reloads after a fetch, pull or refresh.
* Refresh now reloads the repository from disk without fetching, so it also picks up changes made outside ugit. Fetch handles tags.
* Background fetches no longer run at the same time as a repack, which could discard history.
* "Git GC" is now "Repack Repository", and no longer prunes.
* The ahead/behind indicator now checks the remote instead of fetching on a timer, and only fetches when something has changed.
* Background remote checks are skipped for inactive tabs and back off after failures.
* A failed remote check is now reported in the repository panel instead of retried silently.

### Bug Fixes

* A failed fetch when tagging a commit on a remote branch is now reported.
* The Refresh button now spins and is disabled while a refresh is running.

## v1.7.3

### Bug Fixes

* A branch whose history can't be fully read now shows the commits that could be read, instead of an error.
* Git GC now shows progress and reports when it finishes, or if it fails.

## v1.7.2

### Improvements

* Linux releases now include a `.deb` installer.

## v1.7.1

### Bug Fixes

* Errors from the repository menu and the commit panel now show a dialog.

## v1.7.0

### New Features

* Added "Open Remote URL", "Open PR" and "Open Branch Compare" to the branch context menu.

### Improvements

* Context menus opened near the window edge now stay on screen.

## v1.6.1

### Improvements

* Pushing tags now skips tags that conflict with the remote instead of failing the push.
* A push with skipped tags now reports a warning instead of an error.

## v1.6.0

### New Features

* Save a stash as a patch file from the stash context menu, optionally including untracked files.

## v1.5.1

### Bug Fixes

* Restored the Branch and Stash toolbar buttons.

## v1.5.0

### New Features

* Lore repository support. Lore repositories open in their own tab, with a Files tree, a Changes view, per-file history and a revision graph.
* Create and clone Lore repositories, including background clones, sparse clones and shared stores.
* Lore file locks, links and layers, branch merge with a conflict resolver, and stash support.
* Image and audio previews for Lore assets.
* View and edit Lore repository, branch, revision and file metadata, and find revisions by number or metadata.
* Install Lore and run a local Lore server from within ugit.
* Tabs now show a repository type icon for Git and Lore.
* Added Lore documentation.

### Improvements

* The Clone and Init dialogs are now shared between Git and Lore.
* Visual cleanup of the Settings dialog, stash list, worktree list and toolbar.

## v1.4.0

### New Features

* Staging a large file that isn't tracked by Git LFS now prompts at commit time, with a one-click "Track & Commit".
* Right-click a file to track it with Git LFS, by extension or on its own. Git LFS is installed if needed.
* Files tracked by Git LFS now show an "LFS" badge.
* Added large file warning settings to Preferences.

### Improvements

* The Git LFS "Add Track Pattern" action now uses a dialog with pattern suggestions.
* LFS actions now report when Git LFS isn't installed, with an install link.

## v1.3.0

### New Features

* Cloning now runs in the background in its own tab, with live progress and a Retry action.
* Added a "Shallow clone" option with a configurable depth to the Clone dialog.

### Bug Fixes

* A failed clone no longer reports success.

## v1.0.1

* Init New Repository can now assign a branch name and a remote.

## v0.2.0

### New Features

* Stash selected files, keeping or discarding the changes in the working directory.

## v0.1.15

### Bug Fixes

* Remote branch info was sometimes stale when checking for pulls before a commit.
* Renamed "Blocked Branches" to "Locked Branches", fixed the pre-commit check, and added an indicator to the Branch List.

## v0.1.14

### Bug Fixes

* Enter and Escape now work in confirm dialogs.
* Enter in the commit message field now applies the commit.

## v0.1.13

### Bug Fixes

* Fixed the window going blank on a git error.
* Fixed copying text on macOS.

### Improvements

* Double-click a remote branch to check it out.
* Added an Edit menu.

### New Features

* Added filter fields to Branches and Remotes.

## v0.1.12

### Bug Fixes

* Fixed branch checkout.

### Improvements

* Dialog Cancel buttons are now always on the right.

## v0.1.11

### New Features

* Added "Rebase instead of Merge" to the Pull dialog.

### Improvements

* Escape now closes dialogs.
* Dialog Cancel buttons are now consistent across dialogs.
* Double-click a commit to check it out.
* Double-click a stash to apply it.

### Bug Fixes

* Creating a stash now updates the Stashes list.
* Fixed "Save as patch".

## v0.1.10

### New Features

* Branch Stash: stash local changes when switching branches, and re-apply them automatically on return.

### Bug Fixes

* CTRL+A no longer selects all text in the window.

### Improvements

* Performance improvements.
* CTRL+A in the Staged or Unstaged file list selects all files.

## v0.1.9

### New Features

* Added a Light color scheme, selectable from View → Color Mode.
* Added a "..." menu to the diff view with Stage, Unstage and Discard actions.

### Bug Fixes

* Fixed remote branch "Open in Browser" and "Copy URL".

## v0.1.8

### New Features

* Added Side-By-Side, Swipe and Difference modes for image diffs.
* Added a conflict merge tool to the diff viewer.
* Added documentation links to the Help menu.
* Added "New Branch from Branch" for local branches.
* Added "Merge" for remote branches.

### Improvements

* Moved the diff view options from the View menu into the diff viewer.

## v0.1.7

### New Features

* Added Pull and Push to the branch context menu, including for non-current branches.
* Added "Add Tag" to the branch context menu.
* "Open With Editor" replaces "Open with Visual Studio Code", with a configurable editor in Preferences.
* Commit Block List: warns and blocks a commit on a branch listed in Preferences.

### Bug Fixes

* Creating a commit now updates the count on the Push button.
* Fixed discarding a chunk in a file diff.

### Improvements

* Updated the layout of the Preferences dialog.

## v0.1.6

### New Features

* Added "Git GC" to the repository menu.

## v0.1.5

### New Features

* Added "Open Remote URL", "Open PR", "Open Branch Compare" and "Copy Remote URL" to the repository menu.
* Added "Rebase onto current branch" to the local branch context menu.
* Added Checkout, Delete, Pull, New Tag and New Branch to the remote branch context menu.

## v0.1.4

### New Features

* Added "Discard All" and "Stage All" to the Unstaged Files menu.
* Added "Unstage All" to the Staged Files menu.
