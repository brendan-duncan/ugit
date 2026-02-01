import React from 'react';
import './Dialog.css';

interface PullCommitDialogProps {
  onClose: () => void;
  onPullAndCommit: () => void | Promise<void>;
  onCommitOnly: () => void | Promise<void>;
}

function PullCommitDialog({ onClose, onPullAndCommit, onCommitOnly }: PullCommitDialogProps) {
  const handlePullAndCommit = async (): Promise<void> => {
    if (onPullAndCommit) {
      await onPullAndCommit();
    }
  };

  const handleCommitOnly = async (): Promise<void> => {
    if (onCommitOnly) {
      await onCommitOnly();
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Remote Branch Ahead</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-info">
            <p>The remote branch is ahead of local branch. Are you sure you want to commit?</p>
            <p>It's recommended to pull first to get the latest changes from the remote.</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handlePullAndCommit}
          >
            Pull & Commit
          </button>
          <button 
            className="dialog-button dialog-button-secondary" 
            onClick={handleCommitOnly}
          >
            Commit
          </button>
          <button 
            className="dialog-button dialog-button-cancel" 
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default PullCommitDialog;