## v1.7.3

### Bug Fixes

* A branch whose history can't be read all the way through — a commit object missing from the object database, for example — now shows the commits git was able to read, along with a one-line explanation, instead of an error dialog containing the entire partial log.
* Git GC now runs behind the busy overlay and reports when it's finished, rather than running unannounced. A failed GC is now reported instead of being treated as a success.

## v1.7.2

### Improvements

* Linux releases now include a `.deb` installer alongside the AppImage, with a desktop entry so the window is associated with ugit.

## v1.7.1

### Bug Fixes

* Errors raised from the repository menu and the commit panel now open the error dialog instead of being recorded but never shown.

## v1.7.0

### New Features

* Added "Open Remote URL", "Open PR" and "Open Branch Compare" to the branch context menu. Previously these were only available from the repository "..." menu.

### Improvements

* Context menus opened near the edge of the window now stay fully on screen.

## v1.6.1

### Improvements

* Pushing tags now compares the local tags against the remote first. Tags the remote already has at a different commit are skipped and reported rather than failing the whole push, and the rest are pushed in a single command.
* Push results that completed with skipped tags now show as "Push Completed with Warnings" instead of being titled "Error".

## v1.6.0

### New Features

* Right-click a stash and choose "Save as Patch..." to write it out as a patch file, with a separate "Save as Patch (include untracked)" when the stash captured untracked files.

## v1.5.1

### Bug Fixes

* Restored the Branch and Stash toolbar buttons that were removed in v1.5.0.

## v1.5.0

### New Features

* Lore repository support. Lore repositories open in their own tab alongside Git repositories, with a hierarchical Files tree, a Changes view, per-file history, revision details and a revision graph.
* Lore: create and clone repositories, including background cloning in its own tab, sparse clones by include-path, and shared-store support.
* Lore: file locks, links and layers management, branch merge with an interactive conflict resolver, and client-side stash emulation with apply and delete.
* Lore: image and audio previews with the same diff modes as the Git diff viewer.
* Lore: repository, branch, revision and file metadata viewing and editing, repository verify and info, and Find Revision by number or metadata.
* Lore: install and version detection from Settings, configurable `lore` and `loreserver` binary paths, and a local Lore server you can start, stop and health-check from File → Local Lore Server.
* Tabs now show a repository type icon — orange for Git, theme-tinted for Lore.
* Added `docs/lore.md` documenting the Lore workflow, including stash and `.loreignore`.

### Improvements

* The Clone and Init dialogs are now shared between Git and Lore repositories.
* Visual cleanup of the Settings dialog, stash list, worktree list and toolbar.

## v1.4.0

### New Features

* Large files are now flagged before they're committed. Staging a file at or above a configurable size (default 100 MB) that isn't already tracked by Git LFS will prompt you when you commit, with a one-click "Track & Commit" that runs `git lfs track`, re-stages the files and `.gitattributes`, and continues the commit.
* Right-click a file in the Staged or Unstaged list to track it with Git LFS — either all files of that extension (e.g. `*.psd`) or just that one file. Git LFS is installed automatically if it isn't set up yet.
* Files tracked by Git LFS now show an "LFS" badge in the file lists.
* Added "Warn about large files not tracked by Git LFS" and a "Large File Warning Size" threshold to Preferences.

### Improvements

* The Git LFS "Add Track Pattern" action now uses a proper dialog with pattern suggestions instead of a plain text prompt.
* When Git LFS isn't installed on the system, LFS actions now show an actionable message with the install link instead of failing silently.

## v1.3.0

### New Features

* Cloning a repository now runs in the background in its own tab. Other repository tabs stay usable while a large clone runs, switching tabs no longer interrupts it, and the clone tab shows live progress (with a Retry action if it fails).
* Added a "Shallow clone" option with a configurable depth to the Clone dialog, applied per clone.

### Bug Fixes

* A failed clone no longer reports success silently.

## v1.0.1

* Improve Init New Repository. Assign a branch name and a remote repository during initialization.

## v0.2.0

### New Features

* Stash selected files, with an option to keep the changes in the working directory or remove them.

## v0.1.15

### Bug Fixes

* Remote branch sometimes had stale info when checking for pulls before commit.
* Rename "Blocked Branches" to "Locked Branches", fixed checking for them before allowing a commit, add indicator to Branch List label.

## v0.1.14

### Bug Fixes

* Enter and Escape aren't working with confirm dialogs.
* Pressing Enter from commit text field will apply commit.

## v0.1.13

### Bug Fixes

* Fix for window going blank When git has an error.
* Fix copying text on macOS.

### Improvements

* Double-click remote branch to do a checkout.
* Add Edit menu.

### New Features

* Add Filter field to Remotes to filter the remote branches displayed.
* Add Filter field to Branches to filter the local branches displayed.

## v0.1.12

### Bug Fixes

* Fix Branch checkout not working

### Improvements

* Move the Cancel button for dialogs to always be on the right side.

## v0.1.11

### New Features

* Add "Rebase instead of Merge" to Pull Dialog.

### Improvements

* Escape will now close dialogs.
* Make the Cancel button for all dialogs consistently on the left.
* Double-click on a commit to check it out.
* Double-click on a stash to apply the stash.

### Bug Fixes

* Creating a stash wasn't updating the Stashes list.
* Fix "Save as patch".

## v0.1.10

### New Features

* Branch Stash. If you have local changes when switching branches, you can chose Branch Stash to stash the local changes.
When you switch back to that branch, those changes will be automatically re-applied.

### Bug Fixes

* CTRL+A will no longer select all of the text in the window.

### Improvements

* Refactor the react code to improve performance.
* CTRL+A in the Staged or Unstaged file list will select all files.

## v0.1.9

### New Features

* Add Light color scheme, selectable from the View / Color Mode menu.
* Add "..." menu to DiffView. If a file is unstaged, this will have "Stage" and "Discard". If the file is staged, it will have "Unstage" and "Unstage and Discard".

### Bug Fixes

* Fix remote branch "Open in Browser" and "Copy URL"

## v0.1.8

### New Features

* Added DiffViewer modes or modified images: Side-By-Side, Swipe, and Difference.
* Add Conflict Merge tool to DiffViewer for resolving conflicted files.
* Add documentation links to the Help menu.
* Implement "New Branch from Branch" for local branches.
* Implement 'Merge' for remote branches.

### Improvements

* Move Diff View options from the View menu to the DiffViewer.

## v0.1.7

### New features

* Add Pull to the branch context menu. For non-current branches, this will do a fetch of that branch.
* Add Push to the branch context menu. This will also work for non-current branches.
* Add "Add Tag" to the branch context menu. This will add the tag the last commit.
* Change "Open with Visual Studio Code" to "Open With Editor", and added a Preference setting to change the editor used.
* Commit Block List, defined in Preferences, will check the current branch before letting you do a Commit. If the current branch is in the block list, it will notify you that you probably forgot to create a branch and prevent the Commit until you do that.

### Bug Fixes

* Fix: Creating a Commit doesn't update the count on the Push toolbar button.
* Fix: Discard of a chunk in a file change diff.

### Improvements

* Updated the layout of the Preferences dialog.

## v0.1.6

### New Features

* Add `Git GC` to RepoInfo menu, to perform a git garbage collection pass on the repo.

## v0.1.5

### New Features

* Add `Open Remote URL` to the RepoInfo menu, to open the remote branch in a browser.
* Add `Open PR` to the RepoInfo menu, to open the PR creation URL in a browser.
* Add `Open Branch Compare` to the RepoInfo menu, to open the branch comparison URL in a browser.
* Add `Copy Remote URL` to the RepoInfo menu, to copy the remote url to the clipboard.
* Implement `Rebase 'branch' onto 'current-branch'` from Local Branch context menu, to perform a rebase.
* Implement `Checkout` from Remote Branch context menu, to create a Local Branch from a Remote branch.
* Implement `Delete` from Remote Branch context menu, to delete a Remote Branch.
* Implement `Pull` from Remote Branch context menu, to pull the remote branch into the currnet Local Branch.
* Implement `New Tag` from Remote Branch context menu, to create a new tag on the Remote Branch.
* Implement `New Branch` from Remote Branch context menu, to create a new branch off of the Remote Branch.

## v0.1.4

### New Features

* Add menu to Unstaged Files with: `Discard All` and `Stage All`.
* Add menu to Staged Files with: `Unstage All`.
