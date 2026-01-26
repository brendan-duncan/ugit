import React, { useState, useEffect } from 'react';
import './PullDialog.css';

function LocalChangesDialog({ onClose, onProceed, targetBranch }) {
  const STORAGE_KEY = 'local-changes-dialog-option';
  
  // Load saved option from localStorage on mount
  const getSavedOption = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'leave-alone';
    } catch {
      return 'leave-alone';
    }
  };
  
  const [selectedOption, setSelectedOption] = useState(getSavedOption());
  
  // Save to localStorage whenever option changes
  const handleOptionChange = (option) => {
    setSelectedOption(option);
    try {
      localStorage.setItem(STORAGE_KEY, option);
    } catch (error) {
      console.warn('Failed to save local changes dialog option:', error);
    }
  };

  const handleProceed = () => {
    onProceed(selectedOption);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Local Changes Detected</h3>
        </div>

        <div className="dialog-body">
          <p>You have local changes. What would you like to do before switching to <strong>{targetBranch}</strong>?</p>
          
          <div className="dialog-field">
            <label className="dialog-radio-label">
              <input
                type="radio"
                name="local-changes-option"
                value="leave-alone"
                checked={selectedOption === 'leave-alone'}
                onChange={(e) => handleOptionChange(e.target.value)}
                className="dialog-radio"
              />
              <span>Leave Alone - Keep changes as they are and switch branches</span>
            </label>
          </div>

          <div className="dialog-field">
            <label className="dialog-radio-label">
              <input
                type="radio"
                name="local-changes-option"
                value="stash-and-reapply"
                checked={selectedOption === 'stash-and-reapply'}
                onChange={(e) => handleOptionChange(e.target.value)}
                className="dialog-radio"
              />
              <span>Stash and Reapply - Stash changes, switch branches, then reapply changes</span>
            </label>
          </div>

          <div className="dialog-field">
            <label className="dialog-radio-label">
              <input
                type="radio"
                name="local-changes-option"
                value="discard"
                checked={selectedOption === 'discard'}
                onChange={(e) => handleOptionChange(e.target.value)}
                className="dialog-radio"
              />
              <span>Discard - Permanently discard all local changes</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleProceed}>
            Proceed
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default LocalChangesDialog;