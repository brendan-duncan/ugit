const RECENT_REPOS_KEY = 'ugit-recent-repos';
const MAX_RECENT_REPOS = 10;

export function getRecentRepos(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_REPOS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading recent repos:', error);
    return [];
  }
}

export function addRecentRepo(repoPath: string): string[] {
  try {
    let recent = getRecentRepos();

    // Remove if already exists
    recent = recent.filter(path => path !== repoPath);

    // Add to front
    recent.unshift(repoPath);

    // Limit to max
    recent = recent.slice(0, MAX_RECENT_REPOS);

    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(recent));

    return recent;
  } catch (error) {
    console.error('Error saving recent repo:', error);
    return getRecentRepos();
  }
}

export function setRecentRepos(repoPaths: string[]): string[] {
  try {
    // Limit to max and ensure no duplicates
    const uniquePaths = [...new Set(repoPaths)];
    const limited = uniquePaths.slice(0, MAX_RECENT_REPOS);
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(limited));
    return limited;
  } catch (error) {
    console.error('Error setting recent repos:', error);
    return getRecentRepos();
  }
}

export function clearRecentRepos(): void {
  try {
    localStorage.removeItem(RECENT_REPOS_KEY);
  } catch (error) {
    console.error('Error clearing recent repos:', error);
  }
}
// Open tabs are kept apart from the recent list: the recent list is capped at
// MAX_RECENT_REPOS, but every tab that was open should come back on restart.
// Stored in tab order (left to right).
const OPEN_TABS_KEY = 'ugit-open-tabs';

// null when nothing has been saved yet (an install from before this key existed).
export function getOpenTabs(): string[] | null {
  try {
    const stored = localStorage.getItem(OPEN_TABS_KEY);
    if (stored === null)
      return null;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error('Error loading open tabs:', error);
    return null;
  }
}

export function setOpenTabs(repoPaths: string[]): void {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify([...new Set(repoPaths)]));
  } catch (error) {
    console.error('Error saving open tabs:', error);
  }
}
