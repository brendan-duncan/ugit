import React, { useState, useEffect } from 'react';
import './Dialog.css';

interface InitRepositoryDialogProps {
  repoPath: string;
  onClose: () => void;
  onInit: (remoteName: string, remoteUrl: string, branchName: string) => Promise<void>;
}

function InitRepositoryDialog({ repoPath, onClose, onInit }: InitRepositoryDialogProps) {
  const [remoteName, setRemoteName] = useState<string>('origin');
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('main');
  const [loading, setLoading] = useState<boolean>(false);

  // Handle Escape key for cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleInit = async () => {
    setLoading(true);
    try {
      // Fall back to defaults when fields are left blank.
      await onInit(
        remoteName.trim() || 'origin',
        remoteUrl.trim(),
        branchName.trim() || 'main'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Initialize Repository</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Initialize a new Git repository in:
            <br />
            {repoPath}
          </div>

          <div className="dialog-field">
            <label htmlFor="init-branch-name">Branch Name:</label>
            <input
              id="init-branch-name"
              type="text"
              className="dialog-input"
              placeholder="main"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="init-remote-name">Remote Name:</label>
            <input
              id="init-remote-name"
              type="text"
              className="dialog-input"
              placeholder="origin"
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="init-remote-url">Remote Url:</label>
            <input
              id="init-remote-url"
              type="text"
              className="dialog-input"
              placeholder="Optional - leave blank to skip adding a remote"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button
            className="dialog-button dialog-button-primary"
            onClick={handleInit}
            disabled={loading}
          >
            {loading ? 'Initializing...' : 'Initialize'}
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default InitRepositoryDialog;
