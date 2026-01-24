import React, { useState, useEffect } from 'react';
import './StashViewer.css';
import DiffViewer from './DiffViewer';

const GitFactory = window.require('./src/git/GitFactory');
const { ipcRenderer } = window.require('electron');

function StashViewer({ stash, stashIndex, repoPath }) {
  const [stashFile, setStashFile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStashDiff = async () => {
      try {
        setLoading(true);
        const backend = await ipcRenderer.invoke('get-git-backend');
        const git = await GitFactory.createAdapter(repoPath, backend);

        // Get the diff for the stash
        const diffResult = await git.showStash(stashIndex);
        
        // Create a mock file object for DiffViewer
        setStashFile({
          path: `stash@${stashIndex}: ${stash.message}`,
          status: 'STASH',
          diff: diffResult
        });
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading stash diff:', error);
        setStashFile({
          path: `stash@${stashIndex}`,
          status: 'ERROR',
          diff: 'Error loading stash contents: ' + error.message
        });
        setLoading(false);
      }
    };

    if (stash && repoPath !== undefined) {
      loadStashDiff();
    }
  }, [stash, stashIndex, repoPath]);

  if (!stash) {
    return (
      <div className="stash-viewer">
        <div className="stash-message-section">
          <div className="stash-message-text">No stash selected</div>
        </div>
      </div>
    );
  }

  return (
    <div className="stash-viewer">
      <div className="stash-header">
        <span className="stash-title">stash@{stashIndex}</span>
        <span className="stash-badge">STASH</span>
      </div>
      <div className="stash-message-section">
        <div className="stash-message-label">Message:</div>
        <div className="stash-message-text">{stash.message}</div>
        {stash.hash && (
          <div className="stash-hash-text">Commit: {stash.hash}</div>
        )}
      </div>
      {loading ? (
        <div className="stash-content">
          <div className="stash-loading">Loading stash contents...</div>
        </div>
      ) : (
        <DiffViewer 
          file={stashFile} 
          repoPath={repoPath} 
          isStaged={false}
        />
      )}
    </div>
  );
}

export default StashViewer;
