// Helpers for reasoning about Git LFS tracking on the renderer side.
//
// `.gitattributes` patterns follow gitignore-style matching: a pattern with no
// slash matches a file's basename in any directory, while a pattern containing
// a slash is matched against the repo-relative path. We only need enough of
// that behavior to decide whether a given working-tree file is already covered
// by an existing `git lfs track` rule.

/** Format a byte count as a short human-readable string (e.g. "84.2 MB"). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0)
    return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const rounded = exponent === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}

/** Convert a single gitattributes/gitignore-style glob to an anchored RegExp. */
function patternToRegExp(pattern: string): RegExp | null {
  let p = pattern.trim();
  if (!p || p.startsWith('#'))
    return null;

  const anchored = p.includes('/');
  // A leading slash just anchors to the repo root; drop it for matching.
  if (p.startsWith('/'))
    p = p.slice(1);

  // Escape regex metacharacters, then re-expand the glob wildcards. `*` does
  // not cross directory boundaries in git's matching, `?` matches one non-slash
  // character.
  const escaped = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');

  // Patterns with a slash match the full path; bare patterns match the
  // basename, so allow an optional leading directory prefix.
  return new RegExp(anchored ? `^${escaped}$` : `(^|/)${escaped}$`);
}

/** Returns true if `filePath` (repo-relative, forward slashes) matches any pattern. */
export function matchesAnyLfsPattern(filePath: string, patterns: ReadonlyArray<string>): boolean {
  if (!filePath || !patterns || patterns.length === 0)
    return false;
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some(raw => {
    const re = patternToRegExp(raw);
    return re ? re.test(normalized) : false;
  });
}

/**
 * Suggest an LFS track pattern for a file. Prefer a `*.ext` glob so the rule
 * covers siblings of the same type; fall back to the exact path when the file
 * has no extension.
 */
export function suggestLfsPattern(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return `*${name.slice(dot)}`;
  }
  return filePath.replace(/\\/g, '/');
}
