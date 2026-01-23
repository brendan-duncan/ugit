import React, { useState } from 'react';
import './PullDialog.css';

function PullDialog({ onClose, onPull, branches, currentBranch }) {
  const [selectedBranch, setSelectedBranch] = useState(currentBranch || '');
  const [stashAndReapply, setStashAndReapply] = useState(false);

  const handlePull = () => {
    onPull(selectedBranch, stashAndReapply);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Pull from Remote</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label htmlFor="branch-select">Branch to pull from origin:</label>
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
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={stashAndReapply}
                onChange={(e) => setStashAndReapply(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Stash and reapply local changes</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="dialog-button dialog-button-primary" onClick={handlePull}>
            Pull
          </button>
        </div>
      </div>
    </div>
  );
}

export default PullDialog;
