[Overview](README.md)

# Initializing a Local Repository

## What is Initialization?

Initializing a repository creates a new `.git` directory in your project folder. This enables version control for your local files, allowing you to track changes, create commits, and eventually sync with a remote repository.

---

## When to Initialize

Initialize a new repository when:

- You have a local project folder that isn't yet under version control
- You want to start tracking a new project with Git
- You're setting up a project to eventually push to a remote

---

## How to Initialize a Repository

### Step 1: Open the Init Dialog

1. Click **File** in the menu bar
2. Select **Init New Repository...**

### Step 2: Select Folder

1. A folder picker dialog will appear
2. Navigate to the folder you want to initialize as a Git repository
3. Click **Select Folder** (or **Open**)

The selected folder will be initialized as a Git repository.

---

## After Initialization

After initializing, you'll see:

- The repository opens in ugit with an empty commit history
- The **Unstaged Files** section will show all files in your project folder
- You can start by:
  - **Staging files** — Select files to include in your first commit
  - **Creating a commit** — Write a commit message and commit your changes
  - **Adding a remote** — Connect to a remote repository to push your code

---

## What Happens During Initialization

When you initialize a repository:

1. A `.git` folder is created in your project directory
2. An initial `main` branch is created
3. No commits exist yet (the repository starts empty)
4. All existing files in the folder appear as **Unstaged Files**

---

## Example Workflow

### 1. Initialize the Repository

```
File → Init New Repository... → Select your project folder
```

### 2. Stage Your Files

- Click **Stage All** to stage all files
- Or click the **+** button next to individual files

### 3. Create Your First Commit

- Enter a commit message (e.g., "Initial commit")
- Click **Commit**

### 4. (Optional) Add a Remote

If you want to sync with GitHub, GitLab, or another remote:

1. Go to **Remotes** section
2. Click **Add Remote**
3. Enter the remote URL (e.g., `https://github.com/yourname/yourrepo.git`)
4. Push your commits with **Push**

---

## Troubleshooting

### "Not a git repository"

If you see this error, the folder hasn't been properly initialized. Try re-initializing:

1. Close the repository in ugit
2. Use **File → Init New Repository...** and select the folder again

### Files Not Showing

Make sure your files are in the root folder of the repository, not in subfolders (unless you're intentionally organizing that way).

### Already a Git Repository

If the folder already contains a `.git` directory, ugit will open it as an existing repository rather than re-initializing.

---

## Related

- [Cloning a Remote Repository](clone_repo.md) — Download a repository from the internet
- [Opening a Local Repository](open_repo.md) — Open a local repository
