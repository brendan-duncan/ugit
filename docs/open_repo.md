[Overview](README.md)

# Opening a Local Repository

## What is Opening a Repository?

Opening a repository connects ugit to an existing Git project on your computer. Unlike cloning (which downloads from a remote) or initializing (which creates a new repository), opening gives you access to a repository that already exists locally.

---

## How to Open a Repository

### Method 1: From the Menu

1. Click **File** in the menu bar
2. Select **Open Repository...**
3. Navigate to the folder containing the `.git` directory
4. Click **Select Folder** (or **Open**)

### Method 2: Keyboard Shortcut

Press `Ctrl+O` (Windows/Linux) or `Cmd+O` (Mac).

### Method 3: From Recent Repositories

1. Click **File** in the menu bar
2. Look under **Recent Repositories**
3. Click any repository in the list to open it directly

---

## Selecting a Repository Folder

When opening a repository, select the **root folder** of your project — the folder that contains the `.git` directory.

Example structure:
```
my-project/
├── .git/          ← Select this folder
├── src/
├── package.json
└── README.md
```

> ⚠️ Don't select a subfolder inside the repository. Select the root folder that contains `.git`.

---

## What You'll See

When you open a repository, ugit displays:

| Section | Description |
|---------|-------------|
| **Unstaged Files** | Files you've changed but haven't staged |
| **Staged Files** | Files ready to be committed |
| **Commits** | Commit history of the current branch |
| **Branches** | List of local and remote branches |
| **Remotes** | Connected remote repositories (e.g., origin) |

---

## Managing Recent Repositories

ugit automatically tracks your recently opened repositories:

- **Access**: File → Recent Repositories
- **Quick Open**: Click any listed repository to open it immediately
- **Maximum**: The last 10 repositories are stored

---

## Closing a Repository

To close the current repository:

1. Click **File**
2. Select **Close Repository**

This disconnects ugit from the current repository but keeps the application running.

---

## Troubleshooting

### "Not a git repository"

The selected folder doesn't contain a `.git` directory. Make sure you're selecting the correct folder that was initialized or cloned.

### Repository Not Opening

- Verify the `.git` folder exists in the selected directory
- Check that you have read permissions for the folder
- Try closing and reopening ugit

### Recent Repository Gone

If a recent repository no longer appears in the list, it may have been deleted or moved. Use **Open Repository...** to navigate to it again.

### Multiple Repositories

ugit supports multiple repository tabs. To open another repository:

1. Click the **+** tab button
2. Use **File → Open Repository...** to select another folder

---

## Related

- [Cloning a Remote Repository](clone_repo.md) — Download a repository from the internet
- [Initializing a Local Repository](init_repo.md) — Create a new repository from scratch
