import React, { useState, useRef, useEffect } from 'react';
import './Toolbar.css';

function Toolbar({ onRefresh, onFetch, onPull, onPush, onStash, onResetToOrigin, refreshing, currentBranch, branchStatus, onCreateBranch }) {
  const [showRepositoryMenu, setShowRepositoryMenu] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowRepositoryMenu(false);
      }
    };

    if (showRepositoryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showRepositoryMenu]);
  // Get status for current branch
  const currentBranchStatus = branchStatus[currentBranch] || { ahead: 0, behind: 0 };
  
  // Create labels with counts
  const pullLabel = currentBranchStatus.behind > 0 ? `Pull (${currentBranchStatus.behind})` : 'Pull';
  const pushLabel = currentBranchStatus.ahead > 0 ? `Push (${currentBranchStatus.ahead})` : 'Push';

  const handleRepositoryMenuToggle = () => {
    setShowRepositoryMenu(!showRepositoryMenu);
  };

  return (
    <div className="toolbar">
      <button className="toolbar-button" onClick={onRefresh} disabled={!onRefresh || refreshing}>
        <span className={`toolbar-button-icon ${refreshing ? 'spinning' : ''}`}>↻</span>
        <span className="toolbar-button-label">Refresh</span>
      </button>
      <div className="toolbar-separator"></div>
      <button className="toolbar-button" onClick={onFetch} disabled={!onFetch}>
        <span className="toolbar-button-icon">⬇</span>
        <span className="toolbar-button-label">Fetch</span>
      </button>
      <button className="toolbar-button" onClick={onPull} disabled={!onPull}>
        <span className="toolbar-button-icon">⤓</span>
        <span className="toolbar-button-label">{pullLabel}</span>
      </button>
      <button className="toolbar-button" onClick={onPush} disabled={!onPush}>
        <span className="toolbar-button-icon">⬆</span>
        <span className="toolbar-button-label">{pushLabel}</span>
      </button>
      <div className="toolbar-separator"></div>
      <button className="toolbar-button" onClick={onStash} disabled={!onStash}>
        <span className="toolbar-button-icon">📦</span>
        <span className="toolbar-button-label">Stash</span>
      </button>
      <button className="toolbar-button" onClick={onCreateBranch} disabled={!currentBranch}>
        <span className="toolbar-button-icon">🌿</span>
        <span className="toolbar-button-label">Branch</span>
      </button>
      <div className="toolbar-separator"></div>
      <div className="toolbar-dropdown" ref={menuRef}>
        <button className="toolbar-button" onClick={handleRepositoryMenuToggle}>
          <span className="toolbar-button-icon">📂</span>
          <span className="toolbar-button-label">Repository</span>
          <span className="toolbar-dropdown-arrow">▼</span>
        </button>
        {showRepositoryMenu && (
          <div className="toolbar-dropdown-menu">
            <div className="toolbar-dropdown-item" onClick={() => { setShowRepositoryMenu(false); onResetToOrigin(); }}>
              Reset to origin...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Toolbar;
