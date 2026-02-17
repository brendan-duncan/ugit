import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Commit } from '../git/GitAdapter';
import { useSettings } from '../hooks/useSettings';
import './CommitList.css';

interface CommitListProps {
  commits: Array<Commit>;
  selectedCommit: Commit | null;
  onSelectCommit: (commit: Commit | null) => void;
  onContextMenu: (action: string, commit: Commit, currentBranch: string, tagName?: string) => void;
  currentBranch: string;
}

interface CommitFilters {
  author: string;
  message: string;
  sha: string;
  dateFrom: string;
  dateTo: string;
}

function CommitList({ commits, selectedCommit, onSelectCommit, onContextMenu, currentBranch }: CommitListProps) {
  const { settings } = useSettings();
  const [contextMenu, setContextMenu] = useState(null);
  const [tagSubmenuOpen, setTagSubmenuOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CommitFilters>({
    author: '',
    message: '',
    sha: '',
    dateFrom: '',
    dateTo: ''
  });
  const contextMenuRef = useRef(null);

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
    setFilters({
      author: '',
      message: '',
      sha: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  // Apply filters and max commits limit
  const filteredCommits = useMemo(() => {
    const maxCommits = settings?.maxCommits || 100;

    let result = commits.filter(commit => {
      // Author filter - substring match (case-insensitive)
      if (filters.author && !commit.author_name.toLowerCase().includes(filters.author.toLowerCase())) {
        return false;
      }

      // Message filter - substring match (case-insensitive)
      if (filters.message && !commit.message.toLowerCase().includes(filters.message.toLowerCase())) {
        return false;
      }

      // SHA filter - starts with match (case-insensitive)
      if (filters.sha && !commit.hash.toLowerCase().startsWith(filters.sha.toLowerCase())) {
        return false;
      }

      // Date range filter
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
          toDate.setHours(23, 59, 59, 999); // End of day
          if (commitDate > toDate) {
            return false;
          }
        }
      }

      return true;
    });

    // Apply max commits limit
    return result.slice(0, maxCommits);
  }, [commits, filters, settings]);

  const hasActiveFilters = filters.author || filters.message || filters.sha || filters.dateFrom || filters.dateTo;

  if (commits.length === 0) {
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
        <h4>
          Commits ({filteredCommits.length}{commits.length !== filteredCommits.length && ` of ${commits.length}`})
        </h4>
        <button
          className={`commit-filter-toggle ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          title="Toggle filters"
        >
          🔍
        </button>
      </div>

      {showFilters && (
        <div className="commit-filters" onClick={(e) => e.stopPropagation()}>
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
          {hasActiveFilters && (
            <div className="commit-filter-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearFilters();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="commit-filter-clear"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}

      <div className="commit-list-content">
        {filteredCommits.map((commit, index) => {
          const isSelected = selectedCommit && selectedCommit.hash === commit.hash;
          return (
            <div
              key={commit.hash}
              className={`commit-item ${isSelected ? 'selected' : ''} ${!commit.onOrigin ? 'not-on-origin' : ''}`}
              onClick={() => onSelectCommit(commit)}
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
              <span className="commit-author">{commit.author_name}</span>
              <span className="commit-hash">{commit.hash.substring(0, 7)}</span>
              <span className="commit-date">{commit.date}</span>
            </div>
          );
        })}
      </div>

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
                Tags ▶
                {tagSubmenuOpen && (
                  <div className="context-submenu">
                    {contextMenu.commit.tags.map((tag) => (
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
        </div>
      )}
    </div>
  );
}

export default CommitList;
