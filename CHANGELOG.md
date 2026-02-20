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
