import React, { useState, useRef, useEffect } from 'react';
import { Commit } from '../git/GitAdapter';
import './CommitList.css';

interface CommitListProps {
  commits: Array<Commit>;
  selectedCommit: Commit | null;
  onSelectCommit: (commit: Commit | null) => void;
  onContextMenu: (action: string, commit: Commit, currentBranch: string) => void;
  currentBranch: string;
}

function CommitList({ commits, selectedCommit, onSelectCommit, onContextMenu, currentBranch }: CommitListProps) {
  const [contextMenu, setContextMenu] = useState(null);
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

  const handleMenuAction = (action: string) => {
    if (onContextMenu && contextMenu) {
      onContextMenu(action, contextMenu.commit, currentBranch);
    }
    setContextMenu(null);
  };

  if (!commits || commits.length === 0) {
    return (
      <div className="commit-list">
        <h4>Commits</h4>
        <div className="commit-list-empty">No commits found</div>
      </div>
    );
  }

  return (
    <div className="commit-list">
      <h4>Commits ({commits.length})</h4>
      <div className="commit-list-content">
        {commits.map((commit, index) => {
          const isSelected = selectedCommit && selectedCommit.hash === commit.hash;
          return (
            <div
              key={commit.hash}
              className={`commit-item ${isSelected ? 'selected' : ''} ${!commit.onOrigin ? 'not-on-origin' : ''}`}
              onClick={() => onSelectCommit(commit)}
              onContextMenu={(e) => handleContextMenu(e, commit)}
            >
              {!commit.onOrigin && <span className="commit-remote-indicator">⚡</span>}
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
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('rebase-to-here')}>
            Rebase '{currentBranch || 'current'}' to Here
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('reset-to-here')}>
            Reset '{currentBranch || 'current'}' to Here
          </div>
          <div className="context-menu-separator"></div>
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
