import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Commit, SearchQuery, StashCommit } from '../git/GitAdapter';
import './CommitList.css';

interface CommitSearchState {
  query: SearchQuery;
  results: Commit[];
  truncated: boolean;
  loading: boolean;
}

interface CommitListProps {
  commits: Array<Commit>;
  // Stashes, so each can be shown against the commit it was made on. Omitted for
  // views where they make no sense, like a remote branch.
  stashCommits?: Array<StashCommit>;
  // Context-menu actions on a stash row, handled like the stash panel's.
  onStashContextMenu?: (action: string, stash: StashCommit) => void;
  selectedCommit: Commit | null;
  onSelectCommit: (commit: Commit | null) => void;
  onContextMenu: (action: string, commit: Commit, currentBranch: string, tagName?: string) => void;
  onDoubleClick?: (commit: Commit) => void;
  currentBranch: string;
  page: number;
  totalCount?: number;
  pageSize: number;
  search?: CommitSearchState;
  onLoadPage: (page: number) => void;
  onSearch: (query: SearchQuery) => void;
  onClearSearch: () => void;
}

interface CommitFilters {
  author: string;
  message: string;
  sha: string;
  dateFrom: string;
  dateTo: string;
}

type PanelMode = 'filter' | 'search';

const EMPTY_FILTERS: CommitFilters = {
  author: '',
  message: '',
  sha: '',
  dateFrom: '',
  dateTo: ''
};

/** How a signature status should be coloured. */
function signatureClass(status: string): string {
  if (status === 'G')
    return 'signature-good';
  if (status === 'U')
    return 'signature-unknown';
  return 'signature-bad';
}

/** What `git log %G?` reported about a signature, in words. */
function signatureTitle(status: string, signer?: string): string {
  const by = signer ? ` by ${signer}` : '';
  switch (status) {
    case 'G': return `Good signature${by}`;
    case 'U': return `Good signature${by}, but the key isn't trusted`;
    case 'B': return `Bad signature${by}`;
    case 'X': return `Good signature${by} from an expired key`;
    case 'Y': return `Good signature${by} from a key that has since expired`;
    case 'R': return `Good signature${by} from a revoked key`;
    case 'E': return 'Signature could not be checked';
    default: return `Signature status: ${status}`;
  }
}

function filtersToQuery(f: CommitFilters): SearchQuery {
  const q: SearchQuery = {};
  if (f.message) q.message = f.message;
  if (f.author) q.author = f.author;
  if (f.sha) q.sha = f.sha;
  if (f.dateFrom) q.dateFrom = f.dateFrom;
  if (f.dateTo) q.dateTo = f.dateTo;
  return q;
}

function CommitList({
  commits, stashCommits, onStashContextMenu, selectedCommit, onSelectCommit, onContextMenu,
  onDoubleClick, currentBranch, page, totalCount, pageSize, search, onLoadPage, onSearch, onClearSearch
}: CommitListProps) {
  const [contextMenu, setContextMenu] = useState(null);
  const [tagSubmenuOpen, setTagSubmenuOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('filter');
  const [filters, setFilters] = useState<CommitFilters>(EMPTY_FILTERS);
  const contextMenuRef = useRef(null);

  // If a search is active, keep the panel open so the user can see/edit the query.
  useEffect(() => {
    if (search) {
      setShowFilters(true);
      setPanelMode('search');
    }
  }, [search]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, commit: Commit) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      commit
    });
  };

  const handleMenuAction = (action: string, tagName?: string) => {
    if (onContextMenu && contextMenu) {
      onContextMenu(action, contextMenu.commit, currentBranch, tagName);
    }
    setContextMenu(null);
    setTagSubmenuOpen(false);
  };

  const handleFilterChange = (field: keyof CommitFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTERS);
  };

  const handleRunSearch = () => {
    const query = filtersToQuery(filters);
    if (Object.keys(query).length === 0)
      return;
    onSearch(query);
  };

  const handleClearSearchClick = () => {
    setFilters(EMPTY_FILTERS);
    onClearSearch();
  };

  const handleSwitchMode = (mode: PanelMode) => {
    if (mode === panelMode)
      return;
    // When leaving search mode, drop any active search results.
    if (mode === 'filter' && search) {
      onClearSearch();
    }
    setPanelMode(mode);
  };

  // Apply filter-mode filtering. In search mode the backend already did the filtering.
  const filteredCommits = useMemo(() => {
    if (search)
      return search.results;
    if (panelMode === 'search')
      return commits;

    return commits.filter(commit => {
      if (filters.author && !commit.author_name.toLowerCase().includes(filters.author.toLowerCase())) {
        return false;
      }
      if (filters.message && !commit.message.toLowerCase().includes(filters.message.toLowerCase())) {
        return false;
      }
      if (filters.sha && !commit.hash.toLowerCase().startsWith(filters.sha.toLowerCase())) {
        return false;
      }
      if (filters.dateFrom || filters.dateTo) {
        const commitDate = new Date(commit.date);
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (commitDate < fromDate) {
            return false;
          }
        }
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (commitDate > toDate) {
            return false;
          }
        }
      }
      return true;
    });
  }, [commits, filters, search, panelMode]);

  // A stash is a commit made on top of another one, so it can be shown against
  // that commit instead of only in the side panel.
  const stashesByParent = useMemo(() => {
    const grouped = new Map<string, StashCommit[]>();
    for (const stash of stashCommits || []) {
      const existing = grouped.get(stash.parentHash) || [];
      existing.push(stash);
      grouped.set(stash.parentHash, existing);
    }
    return grouped;
  }, [stashCommits]);

  const handleStashContextMenu = (e: React.MouseEvent, stash: StashCommit) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, stash });
  };

  const handleStashMenuAction = (action: string) => {
    if (onStashContextMenu && contextMenu && contextMenu.stash)
      onStashContextMenu(action, contextMenu.stash);
    setContextMenu(null);
  };

  const hasActiveFilters = filters.author || filters.message || filters.sha || filters.dateFrom || filters.dateTo;

  const searchActive = !!search;
  const totalPages = totalCount !== undefined ? Math.max(1, Math.ceil(totalCount / pageSize)) : undefined;
  const showPagination = !searchActive && (totalCount === undefined || totalCount > pageSize);
  const canPrev = !searchActive && page > 0;
  const canNext = !searchActive && (totalCount === undefined || (page + 1) * pageSize < totalCount);

  const firstShown = page * pageSize + 1;
  const lastShown = page * pageSize + commits.length;

  let headerText: string;
  if (searchActive) {
    if (search.loading) {
      headerText = 'Searching…';
    } else {
      headerText = `Search results: ${search.results.length}${search.truncated ? ' (truncated)' : ''}`;
    }
  } else if (panelMode === 'filter' && hasActiveFilters) {
    headerText = `Commits (${filteredCommits.length} of ${commits.length})`;
  } else {
    headerText = `Commits (${commits.length})`;
  }

  if (commits.length === 0 && !searchActive) {
    return (
      <div className="commit-list">
        <h4>Commits</h4>
        <div className="commit-list-empty">No commits found</div>
      </div>
    );
  }

  return (
    <div className="commit-list">
      <div className="commit-list-header">
        <h4>{headerText}</h4>
        <button
          className={`commit-filter-toggle ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          title="Toggle filters / search"
        >
          🔍
        </button>
      </div>

      {showFilters && (
        <div className="commit-filters" onClick={(e) => e.stopPropagation()}>
          <div className="commit-search-mode-toggle">
            <button
              type="button"
              className={`commit-search-mode-button ${panelMode === 'filter' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('filter')}
            >
              Filter view
            </button>
            <button
              type="button"
              className={`commit-search-mode-button ${panelMode === 'search' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('search')}
            >
              Search history
            </button>
          </div>
          <div className="commit-filter-row">
            <input
              type="text"
              placeholder="Author (contains)"
              value={filters.author}
              onChange={(e) => handleFilterChange('author', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="commit-filter-input"
            />
            <input
              type="text"
              placeholder="Message (contains)"
              value={filters.message}
              onChange={(e) => handleFilterChange('message', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="commit-filter-input"
            />
          </div>
          <div className="commit-filter-row">
            <input
              type="text"
              placeholder="SHA (starts with)"
              value={filters.sha}
              onChange={(e) => handleFilterChange('sha', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="commit-filter-input"
            />
            <input
              type="date"
              placeholder="From Date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="commit-filter-input"
            />
            <input
              type="date"
              placeholder="To Date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="commit-filter-input"
            />
          </div>
          <div className="commit-filter-actions">
            {panelMode === 'search' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRunSearch(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="commit-search-button"
                disabled={!hasActiveFilters || search?.loading}
              >
                {search?.loading ? 'Searching…' : 'Search'}
              </button>
            )}
            {(hasActiveFilters || searchActive) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (searchActive) {
                    handleClearSearchClick();
                  } else {
                    handleClearFilters();
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="commit-filter-clear"
              >
                {searchActive ? 'Clear Search' : 'Clear Filters'}
              </button>
            )}
          </div>
          {search?.truncated && (
            <div className="commit-search-truncated-banner">
              Showing first {search.results.length} matches. Refine your query for more specific results.
            </div>
          )}
        </div>
      )}

      <div className="commit-list-content">
        {searchActive && search.loading && search.results.length === 0 ? (
          <div className="commit-list-empty">Searching history…</div>
        ) : searchActive && !search.loading && search.results.length === 0 ? (
          <div className="commit-list-empty">No results</div>
        ) : (
          filteredCommits.map((commit) => {
            const isSelected = selectedCommit && selectedCommit.hash === commit.hash;
            const stashes = stashesByParent.get(commit.hash) || [];
            return (
              <React.Fragment key={commit.hash}>
              <div
                className={`commit-item ${isSelected ? 'selected' : ''} ${!commit.onOrigin ? 'not-on-origin' : ''}`}
                onClick={() => onSelectCommit(commit)}
                onDoubleClick={() => onDoubleClick?.(commit)}
                onContextMenu={(e) => handleContextMenu(e, commit)}
              >
                {!commit.onOrigin && <span className="commit-remote-indicator">⚡</span>}
                {commit.tags && commit.tags.length > 0 && (
                  <span className="commit-tags">
                    {commit.tags.map((tag) => (
                      <span key={tag} className="commit-tag">{tag}</span>
                    ))}
                  </span>
                )}
                <span className={`commit-message ${!commit.onOrigin ? 'italic' : ''}`}>{commit.message}</span>
                {commit.signature && commit.signature !== 'N' && (
                  <span
                    className={`commit-signature ${signatureClass(commit.signature)}`}
                    title={signatureTitle(commit.signature, commit.signer)}
                  >
                    {commit.signature === 'G' ? '🔒' : '⚠'}
                  </span>
                )}
                <span className="commit-author">{commit.author_name}</span>
                <span className="commit-hash">{commit.hash.substring(0, 7)}</span>
                <span className="commit-date">{commit.date}</span>
              </div>
              {stashes.map((stash) => (
                <div
                  key={stash.hash}
                  className="commit-item commit-item-stash"
                  title={`${stash.selector} - stashed on this commit`}
                  onContextMenu={(e) => handleStashContextMenu(e, stash)}
                >
                  <span className="commit-stash-icon">📦</span>
                  <span className="commit-stash-selector">{stash.selector}</span>
                  <span className="commit-message">{stash.message}</span>
                  <span className="commit-hash">{stash.hash.substring(0, 7)}</span>
                  <span className="commit-date">{stash.date}</span>
                </div>
              ))}
              </React.Fragment>
            );
          })
        )}
      </div>

      {showPagination && (
        <div className="commit-pagination-footer">
          <button
            type="button"
            className="commit-pagination-button"
            disabled={!canPrev}
            onClick={() => onLoadPage(page - 1)}
          >
            ◀ Prev
          </button>
          <span className="commit-pagination-info">
            Page {page + 1} of {totalPages !== undefined ? totalPages : '…'}
            {commits.length > 0 && (
              <span className="commit-pagination-range">
                {' '}· Showing {firstShown}–{lastShown}{totalCount !== undefined ? ` of ${totalCount}` : ''}
              </span>
            )}
          </span>
          <button
            type="button"
            className="commit-pagination-button"
            disabled={!canNext}
            onClick={() => onLoadPage(page + 1)}
          >
            Next ▶
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 1000
          }}
        >
          {contextMenu.stash ? (
            <>
              <div className="context-menu-item" onClick={() => handleStashMenuAction('apply')}>
                Apply Stash...
              </div>
              <div className="context-menu-item" onClick={() => handleStashMenuAction('rename')}>
                Rename Stash...
              </div>
              <div className="context-menu-item" onClick={() => handleStashMenuAction('delete')}>
                Delete Stash...
              </div>
              <div className="context-menu-separator"></div>
              <div className="context-menu-item" onClick={() => handleStashMenuAction('save-patch')}>
                Save as Patch...
              </div>
            </>
          ) : (
          <>
          <div className="context-menu-item" onClick={() => handleMenuAction('new-branch')}>
            New Branch...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('new-tag')}>
            New Tag...
          </div>
          {contextMenu.commit.tags && contextMenu.commit.tags.length > 0 && (
            <>
              <div className="context-menu-separator"></div>
              <div
                className="context-menu-item context-menu-submenu"
                onMouseEnter={() => setTagSubmenuOpen(true)}
                onMouseLeave={() => setTagSubmenuOpen(false)}
              >
                Tags <span>▶</span>
                {tagSubmenuOpen && (
                  <div className="context-submenu">
                    {contextMenu.commit.tags.map((tag: string) => (
                      <React.Fragment key={tag}>
                        <div className="context-menu-item" onClick={() => handleMenuAction('show-tag-details', tag)}>
                          Show '{tag}' details...
                        </div>
                        <div className="context-menu-item" onClick={() => handleMenuAction('copy-tag-name', tag)}>
                          Copy Tag Name
                        </div>
                        <div className="context-menu-separator"></div>
                        <div className="context-menu-item" onClick={() => handleMenuAction('delete-tag', tag)}>
                          Delete '{tag}'...
                        </div>
                        <div className="context-menu-separator"></div>
                        <div className="context-menu-item" onClick={() => handleMenuAction('push-tag', tag)}>
                          Push '{tag}' to origin...
                        </div>
                        {contextMenu.commit.tags.indexOf(tag) < contextMenu.commit.tags.length - 1 && (
                          <div className="context-menu-separator"></div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('rebase-to-here')}>
            Rebase '{currentBranch || 'current'}' to Here
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('reset-to-here')}>
            Reset '{currentBranch || 'current'}' to Here
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('amend-commit')}>
            Amend Commit...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('checkout-commit')}>
            Checkout Commit...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('rebase-interactive')}>
            Rebase Interactively from Here...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('browse-tree')}>
            Browse Files at This Commit...
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('bisect-bad')}>
            Start Bisect - Mark as Bad...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('bisect-good')}>
            Bisect - Mark as Good
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('cherry-pick')}>
            Cherry-pick Commit...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('revert-commit')}>
            Revert Commit...
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('save-patch')}>
            Save as Patch...
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('copy-sha')}>
            Copy Commit SHA
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('copy-info')}>
            Copy Commit Info
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

export default CommitList;
