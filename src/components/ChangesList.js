import React from 'react';
import './ChangesList.css';

function ChangesList({ repoPath, currentBranch, modifiedCount, selectedItem, onSelectItem, usingCache }) {
  const isSelected = selectedItem && selectedItem.type === 'local-changes';

  // Extract the repository directory name from the full path
  const repoName = repoPath.split(/[\\/]/).pop() || repoPath;

  return (
    <div className="changes-list">
      <div className="repo-info">
        <div className="repo-name">{repoName}</div>
        {currentBranch && (
          <div className="repo-branch">
            Current branch: <strong>{currentBranch}</strong>
            {usingCache && <span className="cache-indicator" title="Showing cached data, refreshing in background..."> (cached)</span>}
          </div>
        )}
      </div>
      <div
        className={`changes-item ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelectItem({ type: 'local-changes' })}
      >
        <span className="changes-icon">📝</span>
        <span className="changes-label">Local Changes ({modifiedCount})</span>
      </div>
    </div>
  );
}

export default ChangesList;
