# Repository Data Caching

ugit implements persistent caching to improve startup times and provide instant feedback when reopening repositories.

## How It Works

### Cache Storage

- Caches are stored in your OS user data directory:
  - **Windows**: `%APPDATA%/ugit/repo-cache/`
  - **macOS**: `~/Library/Application Support/ugit/repo-cache/`
  - **Linux**: `~/.config/ugit/repo-cache/`

- Each repository has its own cache file named using a hash of the repository path
- Cache files are JSON format containing repository state

### Cache Strategy

1. **First Load**:
   - Instantly displays cached data if available
   - Shows a "(cached)" indicator in the UI
   - Refreshes data in the background after 100ms
   - Updates UI once fresh data is loaded

2. **Manual Refresh**:
   - Always fetches fresh data from git
   - Updates the cache with new data

3. **Cache Expiration**:
   - Caches older than 7 days are automatically ignored
   - Fresh data is fetched instead

### What's Cached

The following data is cached for each repository:

- Current branch name
- Unstaged files list
- Staged files list
- Modified files count
- Branch list
- Branch ahead/behind status
- Stash list

### Cache Management

#### Clear All Caches

Use the menu: **View → Clear All Caches**

This removes all cached repository data and forces fresh loads on next open.

#### Cache Updates

Caches are automatically updated:
- After manual refresh (clicking Refresh button)
- After git operations (commit, fetch, pull, push)
- On background refresh (after loading cached data)

## Performance Benefits

### Without Cache
- Startup: 2-5 seconds (depending on repository size)
- Must wait for all git commands to complete
- Blocking UI until data loads

### With Cache
- Startup: ~50-100ms (instant)
- UI shows immediately with cached data
- Background refresh happens transparently
- Only first interaction with stale data

### Large Repositories

For repositories with many branches:
- Branch status checks are parallelized
- Cache dramatically reduces perceived load time
- Background refresh keeps data current

## Technical Details

### Cache File Format

```json
{
  "repoPath": "/path/to/repository",
  "timestamp": 1706000000000,
  "version": 1,
  "data": {
    "currentBranch": "main",
    "unstagedFiles": [...],
    "stagedFiles": [...],
    "modifiedCount": 5,
    "branches": ["main", "develop", ...],
    "branchStatus": {
      "main": { "ahead": 0, "behind": 2 }
    },
    "stashes": [...]
  }
}
```

### Cache Manager API

The cache manager (`src/utils/cacheManager.js`) provides:

- `saveCache(repoPath, data)` - Save repository data
- `loadCache(repoPath)` - Load cached data (returns null if invalid/expired)
- `clearCache(repoPath)` - Clear cache for specific repo
- `clearAllCaches()` - Clear all cached data

### Integration Points

1. **RepositoryView Component**:
   - Loads cache on mount
   - Displays cached data immediately
   - Triggers background refresh
   - Saves cache after data updates

2. **Main Process**:
   - Provides "Clear All Caches" menu option
   - Manages cache directory

## Cache Invalidation

Caches are considered stale and ignored when:

1. Cache file is older than 7 days
2. Cache version doesn't match current version (1)
3. Repository path in cache doesn't match requested path
4. Cache file is corrupted or can't be parsed

## Privacy & Security

- Cache files are stored locally on your machine
- Only repository metadata is cached (no file contents)
- Cache files use standard JSON format
- No sensitive data (passwords, tokens) is cached

## Troubleshooting

### Cache Not Working

If caching doesn't seem to work:

1. Check console for cache errors
2. Verify cache directory exists and is writable
3. Try "Clear All Caches" and reload repository
4. Check that the repository path hasn't changed

### Stale Data

If you see outdated information:

1. Click the Refresh button (forces fresh data)
2. Cache will be updated automatically
3. "(cached)" indicator shows when viewing cached data

### Disk Space

Cache files are small (typically 1-50 KB per repository). To reduce disk usage:

1. Use "Clear All Caches" periodically
2. Caches auto-expire after 7 days
3. Each repo only keeps one cache file
