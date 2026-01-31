import React from 'react';
import './PullDialog.css';

function CleanWorkingDirectoryDialog({ onClose, onClean }) {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Clean Working Directory</h3>
        </div>

        <div className="dialog-body">
          <p>Remove all untracked files.</p>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="dialog-button dialog-button-primary" onClick={onClean}>
            Clean
          </button>
        </div>
      </div>
    </div>
  );
}

export default CleanWorkingDirectoryDialog;