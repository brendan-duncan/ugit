import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './RenameBranchDialog.css';

interface RenameBranchDialogProps {
  onClose: () => void;
  onRename: (newName: string) => void;
  currentBranchName: string;
}

function RenameBranchDialog({ onClose, onRename, currentBranchName }: RenameBranchDialogProps) {
  const [newName, setNewName] = useState<string>(currentBranchName);

  // Update new name when current branch name changes
  useEffect(() => {
    setNewName(currentBranchName);
  }, [currentBranchName]);

  const handleRename = () => {
    if (newName.trim() && newName.trim() !== currentBranchName.trim()) {
      onRename(newName.trim());
    }
  };

  const isRenameDisabled = !newName.trim() || newName.trim() === currentBranchName.trim();

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Rename Local Branch</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label>New Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              className="dialog-input"
              placeholder="Enter new branch name"
              autoFocus
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter' && !isRenameDisabled) {
                  handleRename();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button
            className="dialog-button dialog-button-primary"
            onClick={handleRename}
            disabled={isRenameDisabled}
          >
            Rename
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default RenameBranchDialog;