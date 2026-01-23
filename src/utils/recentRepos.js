const RECENT_REPOS_KEY = 'ugit-recent-repos';
const MAX_RECENT_REPOS = 10;

export function getRecentRepos() {
  try {
    const stored = localStorage.getItem(RECENT_REPOS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading recent repos:', error);
    return [];
  }
}

export function addRecentRepo(repoPath) {
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

export function clearRecentRepos() {
  try {
    localStorage.removeItem(RECENT_REPOS_KEY);
  } catch (error) {
    console.error('Error clearing recent repos:', error);
  }
}
