import React, { useState } from 'react';
import './CommitInfo.css';
import DiffViewer from './DiffViewer';

function CommitInfo({ commit, files, repoPath }) {
  const [expandedFiles, setExpandedFiles] = useState({});
  const [fileDiffs, setFileDiffs] = useState({});

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

  const toggleFileExpansion = async (filePath, index) => {
    const key = `${filePath}-${index}`;
    
    if (expandedFiles[key]) {
      // Collapse
      setExpandedFiles(prev => ({ ...prev, [key]: false }));
    } else {
      // Expand and load diff if not already loaded
      setExpandedFiles(prev => ({ ...prev, [key]: true }));
      
      if (!fileDiffs[key]) {
        try {
          // Load diff for this specific file from the commit
          const GitFactory = window.require('./src/git/GitFactory');
          const { ipcRenderer } = window.require('electron');
          
          const backend = await ipcRenderer.invoke('get-git-backend');
          const git = await GitFactory.createAdapter(repoPath, backend);
          const diffResult = await git.show(commit.hash, filePath);
          
          setFileDiffs(prev => ({
            ...prev,
            [key]: diffResult
          }));
        } catch (error) {
          console.error(`Error loading diff for ${filePath}:`, error);
          setFileDiffs(prev => ({
            ...prev,
            [key]: `Error loading diff: ${error.message}`
          }));
        }
      }
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
              {files.map((file, index) => {
                const key = `${file.path}-${index}`;
                const isExpanded = expandedFiles[key];
                const diff = fileDiffs[key];
                
                return (
                  <div key={index} className="commit-file-tree-item">
                    <div 
                      className={`commit-file-item ${getStatusClass(file.status)} ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => toggleFileExpansion(file.path, index)}
                    >
                      <span className="commit-file-expand-icon">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span className="commit-file-status">{getStatusLabel(file.status)}</span>
                      <span className="commit-file-path">{file.path}</span>
                    </div>
                    {isExpanded && (
                      <div className="commit-file-diff-container">
                        {diff !== undefined ? (
                          <div className="commit-file-diff">
                            <DiffViewer 
                              file={{ path: file.path, diff, status: file.status }}
                              repoPath={repoPath}
                              isStaged={false}
                            />
                          </div>
                        ) : (
                          <div className="commit-file-diff-loading">Loading diff...</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CommitInfo;
