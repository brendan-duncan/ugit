# Commits

The Commits panel displays the history of your repository. Each commit represents a snapshot of your project at a specific point in time.

---

## Overview

The Commits panel shows:

| Field | Description |
|-------|-------------|
| **Message** | The commit message |
| **Author** | Who created the commit |
| **Hash** | Unique identifier (short form shown) |
| **Date** | When the commit was created |
| **Tags** | Tags attached to the commit |
| **Remote indicator** | ⚡ shows commits not yet pushed |

---

## Viewing Commits

### Select a Commit

Click on any commit to view its details:

- Commit message (full)
- Author and date
- List of files changed

### Browse by Branch

When viewing branches, the commit list shows only commits on that branch. Select a different branch to see its history.

---

## Filtering Commits

Click the filter button to search through commits:

| Filter | Description |
|--------|-------------|
| **Author** | Filter by commit author |
| **Message** | Filter by commit message text |
| **SHA** | Filter by commit hash (partial) |
| **From Date** | Commits after this date |
| **To Date** | Commits before this date |

Click **Clear Filters** to remove all filters.

---

## Commit Indicators

### Not on Origin

Commits with a ⚡ icon haven't been pushed to the remote yet. These are "local" commits.

### Tags

Tags appear as badges on commits. Common uses:
- Release versions (e.g., `v1.0.0`)
- Milestones

---

## Commit Context Menu

Right-click on any commit for additional actions:

### Branching & Tagging

| Action | Description |
|--------|-------------|
| **New Branch...** | Create a new branch at this commit |
| **New Tag...** | Create a tag at this commit |
| **Tags** | View, copy, delete, or push tags |

### Branch Manipulation

| Action | Description |
|--------|-------------|
| **Rebase 'main' to Here** | Rebase current branch onto this commit |
| **Reset 'main' to Here** | Move branch pointer to this commit |

### Commit Editing

| Action | Description |
|--------|-------------|
| **Amend Commit...** | Modify the most recent commit |
| **Checkout Commit** | Detach HEAD to this commit |
| **Cherry-pick Commit...** | Apply this commit to current branch |
| **Revert Commit...** | Create a new commit undoing this one |
| **Save as Patch...** | Export as a `.patch` file |

---

## Creating a Tag

1. Right-click on a commit
2. Select **New Tag...**
3. Enter a tag name (e.g., `v1.0.0`)
4. Click **Create**

### Push a Tag

1. Right-click on a commit with a tag
2. Go to **Tags → Push 'tagname' to origin**

---

## Amending Commits

Amending lets you modify the most recent commit:

- Change the commit message
- Add forgotten files
- Remove accidentally included files

> ⚠️ **Warning:** Amending rewrites history. Don't amend commits that have been pushed to a shared branch.

---

## Checking Out a Commit

Checking out a commit places you in a **detached HEAD** state:

1. Right-click on a commit
2. Select **Checkout Commit**

Your HEAD now points directly to this commit, not a branch. Any new commits won't belong to any branch.

> 💡 To save work done in detached HEAD state, create a new branch before committing.

---

## Cherry-picking

Cherry-pick applies a commit's changes to your current branch:

1. Right-click on the commit you want
2. Select **Cherry-pick Commit**

This is useful for:
- Porting bug fixes to release branches
- Applying specific commits from one branch to another

---

## Reverting

Reverting creates a new commit that undoes the changes:

1. Right-click on a commit
2. Select **Revert Commit**

Unlike resetting, reverting is safe for shared branches because it doesn't rewrite history.

---

## Resetting

Resetting moves the branch pointer to a different commit:

1. Right-click on a commit
2. Select **Reset 'branch' to Here**

| Mode | Effect |
|------|--------|
| **Soft** | Keeps changes staged |
| **Mixed** (default) | Keeps changes unstaged |
| **Hard** | Discards all changes |

> ⚠️ **Warning:** Hard reset permanently discards uncommitted changes.

---

## Rebasing

Rebasing rewrites commits onto a different base:

1. Right-click on a commit
2. Select **Rebase 'branch' to Here**

> ⚠️ **Warning:** Rebasing rewrites history. Avoid on shared/public branches.

---

## Saving as Patch

Export commits as `.patch` files:

1. Right-click on a commit
2. Select **Save as Patch**

This creates a file you can share or apply elsewhere with `git apply`.

---

## Tips

### Write Good Commit Messages

- First line: Short summary (under 50 characters)
- Body: Explain *what* and *why*, not *how*
- Use imperative mood ("Add feature" not "Added feature")

### Commit Often

- Small, focused commits are easier to understand and revert
- Each commit should represent a single logical change

### Don't Rewrite Public History

- Avoid amending or rebasing commits that have been pushed
- Use revert instead for shared branches

---

## Troubleshooting

### Commit Not Found

- The commit may have been garbage collected
- Check if you're on the correct branch

### Can't Amend

- You can only amend the most recent commit (HEAD)
- Check if you're in detached HEAD state

### Rebase Conflicts

- Resolve conflicts manually
- Mark as resolved, then continue with `git rebase --continue`

---

## Related

- [Branches](branches.md) — Managing branches
- [Local Changes](local_changes.md) — Making commits
- [Tags](branches.md#creating-tags) — Working with tags
- [DiffViewer](diff_viewer.md) — Viewing changes
