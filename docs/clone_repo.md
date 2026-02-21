[Overview](README.md)

# Cloning a Remote Repository

## What is Cloning?

Cloning creates a local copy of a remote repository. This includes all files, commit history, and branches.

---

## How to Clone a Repository

### Step 1: Open the Clone Dialog

1. Click **File** in the menu bar
2. Select **Clone...**

Alternatively, you can press `Ctrl+Shift+O` (or `Cmd+Shift+O` on Mac).

### Step 2: Enter Repository Details

The clone dialog has three fields:

| Field | Description |
|-------|-------------|
| **Repository URL** | The URL of the remote repository (e.g., `https://github.com/user/repo.git`) |
| **Parent Folder** | The local directory where the repository will be cloned |
| **Name** | The name of the cloned folder (auto-filled from URL) |

#### Supported URL Formats

- `https://github.com/user/repo.git`
- `git@github.com:user/repo.git`
- `ssh://git@gitlab.com/user/repo.git`

> ℹ️ The dialog automatically reads your clipboard. If you copied a Git URL, it will be pre-filled.

### Step 3: Choose Parent Folder

1. Click **Browse...** to select a folder
2. Or type the path directly (e.g., `C:\Users\YourName\Projects`)

### Step 4: Clone

Click **Clone** to start the cloning process.

The clone may take a while depending on repository size and network speed. Once complete, the repository will open automatically in ugit.

---

## After Cloning

After cloning, you can:

- **Browse commits** — View the full commit history
- **Manage branches** — Create, switch, and delete branches
- **View and edit files** — Browse the repository files
- **Pull and push** — Sync changes with the remote
- **Create commits** — Make and push changes

---

## Troubleshooting

### Clone Failed

- Check your internet connection
- Verify the repository URL is correct
- Ensure you have permission to access the repository (for private repos)
- For SSH URLs, make sure your SSH keys are configured

### Authentication Required

For private repositories, you may need to configure authentication:

- **HTTPS**: Use a personal access token as your password
- **SSH**: Ensure your SSH key is added to your Git hosting account

## Related

- [Initializing a Local Repository](init_repo.md) — Create a new repository from scratch
- [Opening a Local Repository](open_repo.md) — Open a local repository
