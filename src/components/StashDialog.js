import React, { useState } from 'react';
import './PullDialog.css';

function StashDialog({ onClose, onStash }) {
  const [message, setMessage] = useState('');
  const [stageNewFiles, setStageNewFiles] = useState(true);

  const handleStash = () => {
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
