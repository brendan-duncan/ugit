import fs from 'fs';
import path from 'path';

export type RepoType = 'git' | 'lore' | 'unknown';

/**
 * Detect what kind of repository lives at `repoPath` by looking for its marker directory.
 * Git uses `.git`; Lore uses `.lore` (containing config.toml + the local store). Cheap
 * (existsSync) so it's safe to call during render for tabs that lack a stored type.
 */
export function detectRepositoryType(repoPath: string): RepoType {
  try {
    if (fs.existsSync(path.join(repoPath, '.lore'))) return 'lore';
    if (fs.existsSync(path.join(repoPath, '.git'))) return 'git';
  } catch (error) {
    console.warn(`Failed to detect repository type for ${repoPath}:`, error);
  }
  return 'unknown';
}
