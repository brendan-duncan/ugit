import React from 'react';
import './PullDialog.css';

function ResetToOriginDialog({ onClose, onReset }) {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Reset to origin</h3>
        </div>

        <div className="dialog-body">
          <p>Reset local repository to origin.</p>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="dialog-button dialog-button-primary" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetToOriginDialog;