import React, { useState, useEffect } from 'react';
import './StashViewer.css';

const GitFactory = window.require('./src/git/GitFactory');
const { ipcRenderer } = window.require('electron');

function StashViewer({ stash, stashIndex, repoPath }) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStashDiff = async () => {
      try {
        setLoading(true);
        const backend = await ipcRenderer.invoke('get-git-backend');
        const git = await GitFactory.createAdapter(repoPath, backend);

        // Get the diff for the stash
        const diffResult = await git.showStash(stashIndex);
        setDiff(diffResult);
        setLoading(false);
      } catch (error) {
        console.error('Error loading stash diff:', error);
        setDiff('Error loading stash contents');
        setLoading(false);
      }
    };

    if (stash && repoPath !== undefined) {
      loadStashDiff();
    }
  }, [stash, stashIndex, repoPath]);

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
      <div className="stash-content">
        {loading ? (
          <div className="stash-loading">Loading stash contents...</div>
        ) : (
          <pre className="stash-diff-text">{diff}</pre>
        )}
      </div>
    </div>
  );
}

export default StashViewer;
