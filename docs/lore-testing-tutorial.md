# Testing the Lore functionality in ugit

A hands-on walkthrough to verify the (experimental) Lore support. You'll start a local Lore
server, create a Lore repository, open it in ugit, and exercise the panel: status, staging,
commit, diff, history, sync, and push.

> Status: this is a **scaffold**. A tab detected as a Lore repo renders the new
> `LoreRepositoryView`; git repos are unaffected. There is **no in-app Lore "Open/Create"
> flow yet**, so you create the repo from the CLI (Part 2) and open the folder in ugit
> (Part 4). See [lore-support-todo.md](lore-support-todo.md) for what's built vs. pending.

---

## Prerequisites (one-time)

You should already have these from setup (see [lore-support-todo.md](lore-support-todo.md)):

- `$env:USERPROFILE\bin\lore.exe` and `loreserver.exe` (both v0.8.3).
- Dev workspace `D:\src\lore-dev\` with `start-server.ps1` / `stop-server.ps1`.

Verify the CLI is reachable:

```powershell
& "$env:USERPROFILE\bin\lore.exe" --version    # expect: lore 0.8.3+201
```

If `lore.exe` is somewhere else, ugit finds it via (in order): the `LORE_BIN` env var,
`~/bin/lore.exe`, then `PATH`. To point ugit at a custom location:

```powershell
$env:LORE_BIN = "C:\path\to\lore.exe"   # set before launching ugit
```

---

## Part 1 — Start the local Lore server

```powershell
powershell D:\src\lore-dev\start-server.ps1
```

Expected: `Started loreserver PID …` then `Health: HTTP 200 — server ready.`

Sanity check any time:

```powershell
Invoke-WebRequest http://127.0.0.1:41339/health_check -UseBasicParsing | Select-Object StatusCode
```

The server listens on **41337** (QUIC + gRPC) and **41339** (HTTP), auth disabled, durable
storage under `D:\src\lore-dev\store` (survives restarts). Stop it later with
`powershell D:\src\lore-dev\stop-server.ps1`.

---

## Part 2 — Create a Lore repository from the CLI

You can reuse the existing `D:\src\lore-dev\workspaces\clean-test`, or make a fresh one
(recommended for a clean walkthrough). All commands below run the CLI directly.

```powershell
$lore = "$env:USERPROFILE\bin\lore.exe"
$ws   = "D:\src\lore-dev\workspaces\tutorial"
Remove-Item $ws -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Split-Path $ws) | Out-Null

# Create the repo (server-addressed lore:// URL). Note --repository points at the local folder.
& $lore repository create "lore://127.0.0.1:41337/tutorial-$(Get-Random)" --repository $ws --non-interactive -P
```

Expected: `Created repository tutorial-… in D:/src/lore-dev/workspaces/tutorial with ID …`,
and a `.lore\` folder appears in `$ws` (that marker is how ugit detects it as a Lore repo).

Now add some content and make a first commit so there's history to look at. **Important:**
`stage` resolves paths relative to the current directory, so `cd` into the repo first.

```powershell
Set-Content "$ws\readme.txt" "Tutorial repo`nline two`n" -NoNewline -Encoding utf8
Set-Content "$ws\notes.md"  "# Notes`n`n- first`n"        -NoNewline -Encoding utf8
Push-Location $ws
& $lore status --scan --non-interactive -P     # see two untracked files
& $lore stage readme.txt notes.md --non-interactive -P
& $lore commit "Initial tutorial revision" --non-interactive -P
Pop-Location
```

Expected: commit prints `Revision : 1`, a signature, and `Commit succeeded`.

---

## Part 3 — Build and launch ugit

From the repo root `d:\src\ugit`:

```powershell
npm install            # first time only
npm run build          # webpack + main process
npm start              # launches the Electron app
```

(If you change source, re-run `npm run build` then `npm start`.)

---

## Part 4 — Open the Lore repo in ugit

1. In ugit: **File → Open Repository…**
2. Select `D:\src\lore-dev\workspaces\tutorial` (or `…\clean-test`).
3. The tab should render the **Lore panel** (not the normal git view). You can tell it's the
   Lore view by the header reading **`Lore  branch main  revision 1  in-sync`** with
   **Sync / Push / Refresh** buttons.

> If you instead see the regular git view, the folder wasn't detected as Lore — confirm a
> `.lore\` directory exists in it.

---

## Part 5 — Exercise the panel (the actual test)

Do these in the app and confirm each expected result.

### 5a. See a change appear
Outside ugit, edit a tracked file:
```powershell
Add-Content "D:\src\lore-dev\workspaces\tutorial\readme.txt" "a new line`n"
```
In ugit, click **Refresh**.
- Expected: `readme.txt` shows under **Changes not staged** with an `M` marker.

### 5b. View a diff (diff2html)
Click `readme.txt` in the list.
- Expected: the right pane shows a colored, formatted diff (added line in green) — rendered
  via diff2html, the same renderer the git view uses.

### 5c. Stage / unstage
Click **Stage** on `readme.txt`.
- Expected: it moves to the **Staged for commit** section. The **Stage all** button stages
  every not-staged file at once. **Unstage** moves a file back.

### 5d. Commit
Type a message in the box (e.g. "Edit readme") and click **Commit**.
- Expected: after it completes, the staged list empties, **History** gains a new row at the
  top (revision 2), and the header `revision` bumps to `2`.

### 5e. Create a new file
```powershell
Set-Content "D:\src\lore-dev\workspaces\tutorial\extra.txt" "brand new`n" -NoNewline -Encoding utf8
```
Refresh → it appears as **untracked** (`A`). Selecting it shows the whole file as added.
Stage + commit it the same way.

### 5f. Push to the remote
Click **Push**.
- Expected: an alert with push output like `Pushed revision N -> <hash> to branch main`.
  After it refreshes, the header sync state becomes **`in-sync`** (local and remote revision
  numbers now match).

### 5g. Sync
Click **Sync**.
- Expected (when already up to date): an alert `Already on branch main latest revision N -> …`.

### 5h. Tab indicator
Before pushing (i.e. when local is ahead of remote), the tab should show an ahead/behind
indicator derived from the local-vs-remote revision numbers; it clears after a successful push.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Panel shows a "Lore error" with a connection failure | Server not running — `powershell D:\src\lore-dev\start-server.ps1`. |
| Tab opens the git view, not the Lore view | No `.lore\` in the folder; you opened the wrong directory. |
| "lore is not recognized" / spawn ENOENT in errors | ugit can't find the binary; set `$env:LORE_BIN` before `npm start`, or ensure `~/bin` is on PATH. |
| `stage` from the CLI says `Ignoring invalid path` | You didn't `cd` into the repo; the CLI resolves paths against the current dir, not `--repository`. (ugit handles this for you — it runs with cwd = repo.) |
| Diff pane empty for a file | New/binary file with no textual diff — expected. |

## What is NOT testable yet (known gaps)

- Creating/cloning a Lore repo from inside ugit (use the CLI per Part 2).
- Branch switching/creation, merge, conflict resolution in the UI.
- Sparse views (`.lore/view`), links, layers, file locks.
- Structured push/sync summaries (output is shown raw in an alert for now).
