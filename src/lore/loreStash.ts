import fs from 'fs';
import path from 'path';
import { LoreClient } from './LoreClient';

// Client-side stash emulation for Lore (which has no native stash). Stashes live in
// .lore/stashes/<id>/ — local-only (never pushed) and invisible to Lore's VCS operations.
// Each stash is a manifest.json plus a blobs/ folder holding the captured file bytes.

const STASH_DIR = '.lore/stashes';

export interface LoreStashFile {
  /** Repo-relative path. */
  path: string;
  /** Change code at capture time: 'A' (added/untracked), 'M' (modified), 'D' (deleted). */
  change: string;
  /** True if the file was staged when stashed. */
  staged: boolean;
  /** Blob filename under blobs/ holding the captured bytes (absent for deletions). */
  blob?: string;
}

export interface LoreStash {
  id: string;
  /** Short description. */
  message: string;
  /** Long/extended description. */
  description: string;
  /** Branch the stash was created on. */
  branch: string;
  /** ISO timestamp. */
  date: string;
  files: LoreStashFile[];
}

/** A change to stash. */
export interface StashInput { path: string; change: string; staged: boolean; }

export class LoreStashStore {
  constructor(private client: LoreClient) {}

  private base(): string { return path.join(this.client.repoPath, STASH_DIR); }
  private stashDir(id: string): string { return path.join(this.base(), id); }

  /** List stashes, newest first. */
  list(): LoreStash[] {
    try {
      const base = this.base();
      if (!fs.existsSync(base)) return [];
      return fs.readdirSync(base)
        .map(id => { try { return JSON.parse(fs.readFileSync(path.join(base, id, 'manifest.json'), 'utf8')) as LoreStash; } catch { return null; } })
        .filter((s): s is LoreStash => s != null)
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }

  /**
   * Capture the given changes into a new stash. When `keep` is false (the default git behavior),
   * the changes are then removed from the working tree (revert modified/deleted, delete added).
   */
  async create(opts: { message: string; description: string; branch: string; files: StashInput[]; keep: boolean }): Promise<void> {
    if (opts.files.length === 0) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const sdir = this.stashDir(id);
    const blobs = path.join(sdir, 'blobs');
    fs.mkdirSync(blobs, { recursive: true });

    const manifestFiles: LoreStashFile[] = opts.files.map((f, i) => {
      const entry: LoreStashFile = { path: f.path, change: f.change, staged: f.staged };
      if (f.change.toUpperCase() !== 'D') {
        try {
          const data = fs.readFileSync(path.join(this.client.repoPath, f.path));
          const blob = String(i);
          fs.writeFileSync(path.join(blobs, blob), data);
          entry.blob = blob;
        } catch { /* file vanished — record the entry without bytes */ }
      }
      return entry;
    });

    const stash: LoreStash = {
      id, message: opts.message, description: opts.description, branch: opts.branch,
      date: new Date().toISOString(), files: manifestFiles,
    };
    fs.writeFileSync(path.join(sdir, 'manifest.json'), JSON.stringify(stash, null, 2));

    if (!opts.keep) {
      const stagedPaths = opts.files.filter(f => f.staged).map(f => f.path);
      if (stagedPaths.length) await this.client.unstage(stagedPaths);
      const resetPaths = opts.files.filter(f => f.change.toUpperCase() !== 'A').map(f => f.path);
      const addedPaths = opts.files.filter(f => f.change.toUpperCase() === 'A').map(f => f.path);
      if (resetPaths.length) await this.client.discard(resetPaths);
      addedPaths.forEach(p => this.client.deleteWorkingFile(p));
    }
  }

  /** Restore a stash into the working tree. `pop` deletes the stash after applying. */
  async apply(id: string, pop: boolean): Promise<void> {
    const sdir = this.stashDir(id);
    const manifest = JSON.parse(fs.readFileSync(path.join(sdir, 'manifest.json'), 'utf8')) as LoreStash;
    const restage: string[] = [];
    for (const f of manifest.files) {
      const target = path.join(this.client.repoPath, f.path);
      if (f.change.toUpperCase() === 'D') {
        fs.rmSync(target, { force: true }); // re-apply the deletion
      } else if (f.blob) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(sdir, 'blobs', f.blob), target);
      }
      if (f.staged) restage.push(f.path);
    }
    if (restage.length) await this.client.stage(restage);
    if (pop) this.remove(id);
  }

  /** Update a stash's short/long description. */
  rename(id: string, message: string, description: string): void {
    const file = path.join(this.stashDir(id), 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as LoreStash;
    manifest.message = message;
    manifest.description = description;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  }

  /** Delete a stash. */
  remove(id: string): void {
    fs.rmSync(this.stashDir(id), { recursive: true, force: true });
  }
}
