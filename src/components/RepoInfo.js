import React from 'react';
import './RepoInfo.css';

function RepoInfo({ gitAdapter, currentBranch, originUrl, modifiedCount, selectedItem, onSelectItem, usingCache }) {
  const isSelected = selectedItem && selectedItem.type === 'local-changes';

  // Extract the repository directory name from the full path
  const repoName = gitAdapter?.repoPath?.split(/[\\/]/).pop() || 'Repository';

  return (
    <div className="repo-info">
      <div className="repo-name">{repoName}</div>
      {originUrl && (
        <div className="repo-origin">
          Origin: <strong>{originUrl}</strong>
        </div>
      )}
{currentBranch && (
          <div className="repo-branch">
            Branch: <strong>{currentBranch}</strong>
          </div>
        )}
      <div className="local-changes-section">
        <div 
          className={`local-changes-item ${isSelected ? 'selected' : ''}`}
          onClick={() => onSelectItem({ type: 'local-changes' })}
        >
          <span className="changes-icon">📝</span>
          Local Changes
          {modifiedCount > 0 && (
            <span className="modified-count">({modifiedCount})</span>
          )}
          {usingCache && <span className="cache-indicator"> (cached)</span>}
        </div>
      </div>
    </div>
  );
}

export default RepoInfo;