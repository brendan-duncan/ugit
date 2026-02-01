import React from 'react';
import './Dialog.css';

interface StashConflictDialogProps {
  onClose: () => void;
}

function StashConflictDialog({ onClose }: StashConflictDialogProps) {
  const handleOk = () => {
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Stash Conflicts</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-error">
            There are conflicts with local changes and remote branch. Aborting the commit.
          </div>
          <div className="dialog-info">
            <p>Your local changes could not be merged cleanly with the remote changes.</p>
            <p>Please resolve conflicts manually before attempting to commit again.</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleOk}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default StashConflictDialog;