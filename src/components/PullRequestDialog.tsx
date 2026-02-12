import React from 'react';
import { shell } from 'electron';
import './Dialog.css';
import './PullRequestDialog.css';

interface PullRequestDialogProps {
  prUrl: string;
  branchName: string;
  onClose: () => void;
}

function PullRequestDialog({ prUrl, branchName, onClose }: PullRequestDialogProps) {
  const handleOpenUrl = () => {
    shell.openExternal(prUrl);
    onClose();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(prUrl);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content pr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Create Pull Request</h3>
        </div>
        <div className="dialog-body">
          <p className="pr-dialog-message">
            A pull request URL was generated for branch <strong>{branchName}</strong>:
          </p>
          <div className="pr-url-container">
            <input
              type="text"
              className="pr-url-input"
              value={prUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button className="pr-copy-button" onClick={handleCopyUrl} title="Copy URL">
              Copy
            </button>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Close
          </button>
          <button className="dialog-button dialog-button-primary" onClick={handleOpenUrl}>
            Open in Browser
          </button>
        </div>
      </div>
    </div>
  );
}

export default PullRequestDialog;
