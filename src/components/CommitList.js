import React from 'react';
import './CommitList.css';

function CommitList({ commits, selectedCommit, onSelectCommit }) {
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
    </div>
  );
}

export default CommitList;
