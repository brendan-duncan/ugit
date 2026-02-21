# UGit — Git Client

<div align="center">
<img src="images/ugit_icon.png" style="width:100px; display:block; margin: 0 auto;">
</div>

UGit is a free, open-source Git GUI client for Windows. macOS, and Linux. It provides a visual interface for managing Git repositories, handling common Git operations like staging, committing, branching, and syncing with remotes.

---

## Quality Of Life Features

- [Checks if there are remote changes before creating a commit](local_changes.md#commit-without-pulling).
- [Lets you specify branches to prevent commits for, preventing unwanted commits for non-PR branches](local_changes.md#branch-commit-block-list).
- [Merge conflict resolution](diff_viewer.md#conflict-resolution).
- [Image Diff viewer](diff_viewer.md#image-diffs).

---

## Getting Started

### [Opening a Repository](open_repo.md)

1. **File → Open Repository** (or `Ctrl+O`)
2. Select a folder containing a `.git` directory
3. The repository loads with all its data

### [Cloning a Repository](clone_repo.md)

1. **File → Clone...** (or `Ctrl+Shift+C`)
2. Enter the repository URL
3. Choose a parent folder
4. Click Clone

### [Initializing a New Repository](init_repo.md)

1. **File → Init New Repository**
2. Select a folder
3. The folder becomes a Git repository

---

## Interface Overview

![UGit](images/ugit.png)

---

## Main Features

### [Repo Info](repo_info.md)

- Displays information about the current state of the repository.
- Local Changes lists the files that have been modified or added to the repository.

### [Local Changes](local_changes.md)

- View modified files (staged and unstaged)
- Stage/unstage individual files or all at once
- Discard changes to files
- Create commits with messages

### [DiffViewer](diff_viewer.md)

- **Text diffs** — Syntax-highlighted code differences
- **Image diffs** — Three modes:
  - Side-by-side comparison
  - Swipe (draggable divider)
  - Difference (highlights changes)
- **Chunk staging** — Stage or discard specific chunks

### [Branches](local_branches.md)

- View all local branches
- Create new branches
- Switch branches
- Merge branches
- Rebase branches
- Delete branches

### [Remotes](remotes.md)

- Add and remove remotes
- Fetch from remotes
- Pull and push changes
- Manage remote branches

### [Stashes](stashes.md)

- Save uncommitted changes temporarily
- Apply or pop stashes
- Delete stashes

### Commits

- View commit history
- Browse commits by branch
- View commit details and files
- Create tags
- Cherry-pick, revert, and more

---

## Common Workflows

### Making Changes

1. Modify files in your project
2. View changes in the DiffViewer
3. Stage files you want to commit
4. Write a commit message
5. Click Commit

### Working with Branches

1. Create a new branch: **Branches → New Branch**
2. Switch to your branch: **double-click** the branch
3. Make and commit changes
4. Merge or rebase when ready

### Syncing with Remote

1. **Pull** — Fetch and merge remote changes
2. **Push** — Upload your commits to remote
3. **Fetch** — Download remote changes without merging

### Handling Conflicts

1. UGit detects merge conflicts
2. Use the conflict resolution controls to choose versions
3. Or open in VS Code to resolve manually
4. Commit the resolved file

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Repository | `Ctrl+O` |
| Clone | `Ctrl+Shift+C` |
| Stage Selected | `Ctrl+S` |
| Unstage Selected | `Ctrl+U` |
| Commit | `Ctrl+Enter` |

---

## Menu Reference

### File Menu

- **Open Repository** — Open an existing repository
- **Clone...** — Clone from a remote URL
- **Init New Repository** — Create a new repository
- **Close Repository** — Close the current repository
- **Recent Repositories** — Quick access to recent projects
- **Preferences** — Configure settings
- **Exit** — Close the application

### Edit Menu

- **Undo/Redo** — Standard editing commands
- **Cut/Copy/Paste** — Text editing

### View Menu

- **Diff View Mode** — Switch between line-by-line and side-by-side
- **Toggle Panels** — Show/hide various panels
- **Refresh** — Refresh the repository view

### Repository Menu

- **Commit** — Commit staged changes
- **Pull** — Pull from remote
- **Push** — Push to remote
- **Fetch** — Fetch from remote
- **Branch** — Create or manage branches
- **Tag** — Create or manage tags

---

## Settings

Access via **File → Preferences**:

- Default diff view mode
- External editor
- Commit block list
- Auto-fetch interval
