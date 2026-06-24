# Using Lore in ugit

A practical guide to working with [Lore](https://epicgames.github.io/lore/) repositories in
ugit — from putting an existing game project under version control, through day-to-day work, to
a team collaborating on it. Lore is a **centralized, Perforce-style** VCS built for large game
projects: a server is the source of truth, big binary assets are first-class, and files can be
**exclusively locked** while you edit them.

ugit shows a Lore repository in its own **Lore panel** (a tab tinted violet). The panel is
GUI-first; the one place you still touch the command line is running/standing up the **Lore
server**, covered below.

> Status: experimental. Everything here works against a local dev server. The auth/login flow
> is wired to Lore's documented JWT/OIDC contract but not verified against a secured server (the
> dev server runs with auth disabled).

---

## 1. How the pieces fit

- **Lore server** — the source of truth. Holds every revision and the canonical branch
  pointers; arbitrates pushes and locks. A team runs one shared server; you run a local one for
  development. Repositories are addressed by URL: `lore://host:port/name`.
- **Working copy** — a local checkout on your machine (a folder with a `.lore/` directory).
  It can be a **sparse** subset of a huge repo; assets are fetched lazily.
- **ugit Lore panel** — the GUI you work in: stage/commit, branches, merge, locks, the
  repository tree, per-asset history, sync/push.

The mental model is Perforce, not git: you're always working against a central server, and for
unmergeable binary assets you **lock before you edit** so two people can't clobber each other.

---

## 2. The Lore server (CLI)

You need a server before you can create or clone a repo. For a real team this is a hosted,
durable, authenticated `loreserver`; for development you run a local one.

**Start the local dev server** (PowerShell):

```powershell
powershell D:\src\lore-dev\start-server.ps1
```

It listens on **41337** (QUIC + gRPC) and **41339** (HTTP), stores data durably under
`D:\src\lore-dev\store`, runs with **auth disabled**, and uses a self-signed cert. Check it:

```powershell
Invoke-WebRequest http://127.0.0.1:41339/health_check -UseBasicParsing | Select-Object StatusCode
```

Stop it with `powershell D:\src\lore-dev\stop-server.ps1`.

**For a team**, the server is shared infrastructure (often run via the `loreserver` binary with
a durable store, real TLS cert, and auth enabled). Everyone points their clones at the same
`lore://` URL. Auth uses JWT/OIDC — authenticate the CLI once with `lore login` (browser, or
`--token-type … --token …`); ugit then reuses that identity (there is no separate login form in
the GUI yet). ugit finds the `lore` CLI via `$LORE_BIN`, then `~/bin`, then `PATH`.

---

## 3. Put an existing game project under Lore

Say you have `D:\games\MyGame` full of source and assets and no version control yet.

1. Make sure the server is running (Part 2).
2. In ugit: **File → Init New Repository…**, then pick the folder `D:\games\MyGame`.
3. In the dialog, choose **Lore** (the type radio at the top):
   - **Server URL:** `lore://127.0.0.1:41337/`
   - **Repository Name:** `MyGame` (the dialog shows the full `lore://…/MyGame` it will create)
   - Click **Create**.
4. ugit creates the repo on the server and a `.lore/` in your folder, then opens it as a violet
   **Lore tab**. Your existing files show up as untracked.
5. In the **Changes** view, click **Stage all**, type a message ("Import existing project"), and
   **Commit**. Then **Push** to publish it to the server.

Now teammates can clone `lore://<server>/MyGame` and you're all working against the same repo.

> Large/binary assets (textures, geometry, etc.) are committed like anything else — Lore chunks
> them content-addressably. You don't need LFS or special config.

---

## 4. Tour of the Lore panel

**Toolbar:** Refresh · Sync · Push · Branch · and three view toggles — **Changes**, **Files**,
**Graph** (the active one is highlighted). On the right, the **sync gauge** shows
`local rev ⇄ remote rev`, colored green when in sync, amber when ahead/behind — your at-a-glance
"am I up to date with the server?" indicator.

### Changes view (the commit flow)
- **Changes not staged** / **Staged for commit** lists. Each row has **Stage/Unstage** and
  **Lock/Unlock**. Click a file to see its diff (text) on the right.
- A **commit box** at the bottom; commit creates a new local revision (push to publish).
- **Branches** in the sidebar: switch by clicking, **+ New** to create, and **Merge** to merge a
  branch into the current one.
- **Locks** section: every locked file with its owner; release from here.
- **Sparse view** section: view/edit the `.lore/view` filter (see below).
- **Links / Layers** sections: compose sub-repositories.
- **History** (right): revisions with **Amend** (latest message), **Revert**, and **Pick**
  (cherry-pick). Click a revision to see its changed files.

### Files view (the repository tree) — the default
The working set as a **sparse tree of the repo** (like a Perforce depot/workspace tree):
- Folders expand **lazily** (children load on demand), so huge projects stay responsive.
- Each row shows the **size**, a **🔒 lock owner** if locked, and a **change marker** (A/M/D)
  if modified. (`D` on *every* file means nothing is checked out on disk — see the bare-clone
  note in Part 8.)
- Select a file to see, on the right: its **info** (size/hash/status), an **image preview** (for
  png/jpg/etc.) or a **binary asset card** (for other binaries) or a **text diff**, and its
  **per-file history** — click a revision to diff that asset at that point in time.

### Graph view
A lane-based **revision graph** across branches, with merges shown, and **HEAD** / **remote**
markers so you can see exactly what's local-only (unpushed) versus on the server.

---

## 5. Working day to day

A typical loop:

1. **Sync** to get the latest from the server (the gauge turns green / "in-sync").
2. Make changes. For **binary assets you'll edit, lock them first** (see Part 6).
3. In **Changes**, Stage the files and **Commit** with a message (this is local).
4. **Push** to publish your revision to the server. The sync gauge returns to in-sync.

For larger work, create a **branch**, commit there, and **Merge** it back — resolving any text
conflicts with the resolver (Part 7).

---

## 6. Multiple people on one project (the Lore way)

This is where Lore's centralized, lock-oriented model matters. From Lore's perspective:

- **The server is the single source of truth.** Everyone clones the same `lore://` repo and
  reconciles through it — there is no peer-to-peer sharing. Your local commits aren't visible to
  anyone until you **Push**; you see others' work when you **Sync**.

- **Lock unmergeable assets before editing.** Two people can't meaningfully merge a binary
  `.uasset` or a texture. The Lore workflow is **exclusive locking**: before editing such a file,
  select it and click **Lock**. Everyone else sees `🔒 <your name>` on that file in the Files
  tree and Changes list, so they know not to touch it. Commit, push, then **Unlock**. (On the
  auth-disabled dev server the owner shows as `<unknown>`; a real server shows real identities.)

- **Text can branch and merge.** Source code and other text can be worked on in parallel
  branches and merged; conflicts are resolved per-hunk (Part 7).

- **Stay in sync.** The sync gauge tells each person whether they're behind the server. Sync
  often; push when you've committed something others need. If you try to push and you're behind,
  sync first.

- **Sparse clones for big projects.** Nobody needs the whole multi-hundred-GB project on disk.
  Use a **sparse view** so each person clones only their area (see Part 8). Lazy fetch pulls
  assets on demand.

Concrete example — an artist and a programmer share `MyGame`:
- The **artist** locks `Content/Meshes/hero.uasset`, edits it in their DCC tool, commits, pushes,
  unlocks. The programmer saw the lock the whole time and left it alone.
- The **programmer** edits `Source/*.cpp` on a `feature/ai` branch, commits, pushes the branch,
  then merges to `main` — resolving any `.cpp` conflicts in the resolver.
- Both **Sync** regularly; the gauge keeps them honest about being current.

---

## 7. Resolving merge conflicts

When you **Merge** a branch and text files conflict, the panel enters a merge state:
- A **merge banner** appears (with the incoming revision and an **Abort** button).
- A **Conflicts** section lists the conflicted files. Per file you can quick-resolve with
  **Mine** / **Theirs**, or click **Resolve…** to open the **interactive 3-way resolver**.
- In the resolver, each conflict block shows **Ours / Base / Theirs**; pick one (or *both*) per
  block, or switch to **Text edit** for a manual merge. A live preview shows the result.
- Save resolves that file. When all conflicts are resolved, the commit button becomes
  **Complete merge**.

(Binary conflicts shouldn't happen if you locked the asset — that's the point of locking.)

---

## 8. Sparse clones & views (checking out part of a big repo)

A Lore working copy can hold just a **subset** of a huge repository — you don't need the whole
multi-hundred-GB project on disk. Which files get materialized is controlled by a **view filter**:
a gitignore-style file stored at `.lore/view`.

The filter reads top-down:

- `**` — exclude everything.
- `!pattern` — **re-include** matching paths.

So you typically start by excluding everything, then add back the areas you want:

```
**
!Content/*.ts
!Content/*.material
```

That checks out only the `.ts` scripts and `.material` files under `Content/`. (Cloning the
56-file `TPS_Demo` with that filter materializes just the 10 matching files.) Anything excluded
is simply absent — and because Lore knows it's *outside your view*, those files do **not** show
up as changes. A blank filter means a full checkout.

### Clone sparsely from the start

This is the normal way to get a partial checkout:

1. **File → Clone…**
2. Pick **Lore** (auto-selected once the URL starts with `lore://`).
   - **Repository URL:** `lore://127.0.0.1:41337/TPS_Demo`
   - **Parent Folder / Name:** where to put the local folder.
3. In the **Sparse view filter (optional)** box, paste your `**` / `!pattern` filter (leave it
   blank for a full clone).
4. **Clone.** Only the matching files are fetched and written.

From the CLI this is `lore repository clone <url> <path> --view <file>` (the file must be
BOM-free; ugit handles that for you).

### Change the view later

Open the repo, go to the **Changes** view's **Sparse view** section, and click **Edit**. Set the
same gitignore-style filter and save. Editing the view governs **future** syncs — it does *not*
retroactively re-materialize the current checkout. To pull in newly-included files (or drop
newly-excluded ones), **Sync** afterward. From the CLI that reconciliation is
`lore sync --reset`.

### "Bare" clones, and why the Files view shows `D` on everything

The Clone dialog also offers a **Bare** checkbox. A bare clone fetches the latest **revision
tree** but **zero files** — it's for inspecting history or tooling, not day-to-day editing.
Because every tracked file is absent from disk, ugit's **Files** view (which scans the working
tree against the revision tree) marks **every file with a `D`** (deleted). That's expected for a
bare clone — there's simply nothing checked out, not a real deletion you committed.

To turn a bare clone into a working one, give it a view (Changes → **Sparse view** → **Edit** —
empty for everything, or a `**`/`!` filter for a subset) and then **Sync** (CLI: `lore sync
--reset`) to materialize the files. For normal work, prefer a **full** or **sparse** clone over
bare.

---

## 9. Troubleshooting & known limits

| Symptom | Fix |
| --- | --- |
| Panel shows a connection error | Server not running — `start-server.ps1`. |
| Tab opens the git view, not Lore | The folder has no `.lore/` (wrong folder, or not created yet). |
| "lore not recognized" / spawn error | Set `$env:LORE_BIN` before launching ugit, or put `lore` on PATH. |
| `Stage` did nothing from the CLI | The CLI resolves paths against the current directory; the GUI handles this for you. |
| Lock owner shows `<unknown>` | Expected on the auth-disabled dev server. |
| Files view shows `D` on **every** file | You did a **bare** clone (no files on disk). Set a view and Sync, or re-clone full/sparse — see Part 8. |
| Sparse clone fetched everything | The view filter was empty or didn't start with `**`. Excludes-then-`!`re-includes; a blank box = full checkout. |

**Not yet in the GUI:** non-default branch operations beyond switch/create/merge; bisect; the
auth login round-trip is unverified (needs a secured server with an OIDC/JWK issuer); the file
tree shows the materialized/sparse view (not un-fetched paths).
