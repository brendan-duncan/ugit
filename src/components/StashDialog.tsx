import React, { useState, useEffect } from 'react';
import './Dialog.css';

interface StashDialogProps {
  onClose: () => void;
  onStash: (message: string, stageNewFiles: boolean) => Promise<void>;
}

const StashDialog: React.FC<StashDialogProps> = ({ onClose, onStash }) => {
  const [message, setMessage] = useState<string>('');
  const [stageNewFiles, setStageNewFiles] = useState<boolean>(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleStash = (): void => {
    onStash(message, stageNewFiles);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Create Stash</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field dialog-field-horizontal">
            <label htmlFor="stash-message">Message:</label>
            <input
              id="stash-message"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="dialog-input"
              placeholder="Stash message (optional)"
              autoFocus
            />
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label" title="By default stash ignores new files until you stage them">
              <input
                type="checkbox"
                checked={stageNewFiles}
                onChange={(e) => setStageNewFiles(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Stage new files</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleStash}>
            Save Stash
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default StashDialog;
