import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './RenameStashDialog.css';

interface RenameStashDialogProps {
  onClose: () => void;
  onRename: (newName: string) => void;
  currentStashName: string;
  stashIndex: number;
}

function RenameStashDialog({ onClose, onRename, currentStashName, stashIndex }: RenameStashDialogProps) {
  const [newName, setNewName] = useState<string>(currentStashName);

  // Update new name when current stash name changes
  useEffect(() => {
    setNewName(currentStashName);
  }, [currentStashName]);

  const handleRename = () => {
    if (newName.trim() && newName.trim() !== currentStashName.trim()) {
      onRename(newName.trim());
    }
  };

  const isRenameDisabled = !newName.trim() || newName.trim() === currentStashName.trim();

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Rename Stash</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label>Name:</label>
            <input
              type="text"
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              className="dialog-input"
              placeholder="Enter new stash name"
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

export default RenameStashDialog;