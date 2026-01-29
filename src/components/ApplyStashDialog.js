import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './ApplyStashDialog.css';

function ApplyStashDialog({ onClose, onApply, stashMessage, stashIndex }) {
  const STORAGE_KEY = 'apply-stash-delete-after';
  
  // Load saved option from localStorage on mount
  const getSavedOption = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return true; // Default to true
    }
  };
  
  const [deleteAfterApplying, setDeleteAfterApplying] = useState(getSavedOption());
  
  // Save to localStorage whenever option changes
  const handleDeleteAfterChange = (checked) => {
    setDeleteAfterApplying(checked);
    try {
      localStorage.setItem(STORAGE_KEY, checked.toString());
    } catch (error) {
      console.warn('Failed to save apply stash dialog option:', error);
    }
  };

  const handleApply = () => {
    onApply({
      stashIndex,
      deleteAfterApplying
    });
  };

  // Strip "On <branch>: " prefix from message for cleaner display
  const displayMessage = stashMessage.replace(/^On [^:]+:\s*/, '');

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Apply Stash</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field apply-stash-message-field">
            <label>Stash to Apply:</label>
            <input
              type="text"
              value={displayMessage}
              disabled
              className="dialog-input"
              style={{ backgroundColor: '#2d2d2d', color: '#cccccc' }}
            />
          </div>
          
          <div className="dialog-field apply-stash-delete-after-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={deleteAfterApplying}
                onChange={(e) => handleDeleteAfterChange(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Delete stash after applying</span>
            </label>
          </div>

          <div className="dialog-field">
            <div style={{ 
              fontSize: '0.85rem', 
              color: '#888888', 
              fontStyle: 'italic',
              marginLeft: '4px'
            }}>
              Stash will not be deleted if a conflict occurs
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleApply}>
            Apply
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApplyStashDialog;