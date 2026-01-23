import React from 'react';
import './CommitInfo.css';

function CommitInfo({ commit, files }) {
  if (!commit) {
    return (
      <div className="commit-info">
        <div className="commit-info-empty">Select a commit to view details</div>
      </div>
    );
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'M': return 'Modified';
      case 'A': return 'Added';
      case 'D': return 'Deleted';
      case 'R': return 'Renamed';
      case 'C': return 'Copied';
      default: return status;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'M': return 'file-modified';
      case 'A': return 'file-added';
      case 'D': return 'file-deleted';
      case 'R': return 'file-renamed';
      case 'C': return 'file-copied';
      default: return '';
    }
  };

  return (
    <div className="commit-info">
      <div className="commit-info-header">
        <h4>Commit Details</h4>
      </div>
      <div className="commit-info-content">
        <div className="commit-info-row">
          <span className="commit-info-label">Hash:</span>
          <span className="commit-info-value">{commit.hash}</span>
        </div>
        <div className="commit-info-row">
          <span className="commit-info-label">Author:</span>
          <span className="commit-info-value">{commit.author_name} &lt;{commit.author_email}&gt;</span>
        </div>
        <div className="commit-info-row">
          <span className="commit-info-label">Date:</span>
          <span className="commit-info-value">{commit.date}</span>
        </div>
        <div className="commit-info-row">
          <span className="commit-info-label">Message:</span>
          <span className="commit-info-value commit-full-message">{commit.message}</span>
        </div>
        {commit.body && (
          <div className="commit-info-row">
            <span className="commit-info-label">Body:</span>
            <pre className="commit-info-value commit-body">{commit.body}</pre>
          </div>
        )}
        {files && files.length > 0 && (
          <div className="commit-info-row">
            <span className="commit-info-label">Files Changed ({files.length}):</span>
            <div className="commit-info-value commit-files-list">
              {files.map((file, index) => (
                <div key={index} className={`commit-file-item ${getStatusClass(file.status)}`}>
                  <span className="commit-file-status">{getStatusLabel(file.status)}</span>
                  <span className="commit-file-path">{file.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CommitInfo;
