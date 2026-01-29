import React, { useState } from 'react';
import './Dialog.css';
import './PushDialog.css';

function PushDialog({ onClose, onPush, branches, currentBranch }) {
  const [selectedBranch, setSelectedBranch] = useState(currentBranch || '');
  const [remoteBranch, setRemoteBranch] = useState(currentBranch || '');
  const [pushAllTags, setPushAllTags] = useState(false);

  const handlePush = () => {
    onPush(selectedBranch, remoteBranch, pushAllTags);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Push to Remote</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label htmlFor="branch-select">Branch:</label>
            <select
              id="branch-select"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="dialog-select"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>

          <div className="dialog-field">
            <label htmlFor="remote-branch-select">To:</label>
            <select
              id="remote-branch-select"
              value={remoteBranch}
              onChange={(e) => setRemoteBranch(e.target.value)}
              className="dialog-select"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  origin/{branch}
                </option>
              ))}
            </select>
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={pushAllTags}
                onChange={(e) => setPushAllTags(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Push all tags</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="dialog-button dialog-button-primary" onClick={handlePush}>
            Push
          </button>
        </div>
      </div>
    </div>
  );
}

export default PushDialog;
