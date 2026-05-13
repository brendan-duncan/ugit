## [v0.1.14](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.13) (May 13, 2026))

### Bug Fixes

* Enter and Escape aren't working with confirm dialogs.
* Pressing Enter from commit text field will apply commit.

## [v0.1.13](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.13) (XXX)

### Bug Fixes

* Fix for window going blank When git has an error.
* Fix copying text on macOS.

### Improvements

* Double-click remote branch to do a checkout.
* Add Edit menu.

### New Features

* Add Filter field to Remotes to filter the remote branches displayed.
* Add Filter field to Branches to filter the local branches displayed.

## [v0.1.12](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.12) (March 5, 2026)

### Bug Fixes

* Fix Branch checkout not working

### Improvements

* Move the Cancel button for dialogs to always be on the right side.

## [v0.1.11](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.11) (March 3, 2026)

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

## [v0.1.10](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.10) (February 27, 2026)

### New Features

* Branch Stash. If you have local changes when switching branches, you can chose Branch Stash to stash the local changes.
When you switch back to that branch, those changes will be automatically re-applied.

### Bug Fixes

* CTRL+A will no longer select all of the text in the window.

### Improvements

* Refactor the react code to improve performance.
* CTRL+A in the Staged or Unstaged file list will select all files.

## [v0.1.9](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.9) (February 23, 2026)

### New Features

* Add Light color scheme, selectable from the View / Color Mode menu.
* Add "..." menu to DiffView. If a file is unstaged, this will have "Stage" and "Discard". If the file is staged, it will have "Unstage" and "Unstage and Discard".

### Bug Fixes

* Fix remote branch "Open in Browser" and "Copy URL"

## [v0.1.8](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.8) (February 21, 2026)

### New Features

* Added DiffViewer modes or modified images: Side-By-Side, Swipe, and Difference.
* Add Conflict Merge tool to DiffViewer for resolving conflicted files.
* Add documentation links to the Help menu.
* Implement "New Branch from Branch" for local branches.
* Implement 'Merge' for remote branches.

### Improvements

* Move Diff View options from the View menu to the DiffViewer.

## [v0.1.7](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.7) (February 20, 2026)

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

## [v0.1.6](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.6) (February 19, 2026)

### New Features

* Add `Git GC` to RepoInfo menu, to perform a git garbage collection pass on the repo.

## [v0.1.5](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.5) (February 19, 2026)

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

## [v0.1.4](https://github.com/brendan-duncan/ugit/releases/tag/v0.1.4) (February 18, 2026)

### New Features

* Add menu to Unstaged Files with: `Discard All` and `Stage All`.
* Add menu to Staged Files with: `Unstage All`.
