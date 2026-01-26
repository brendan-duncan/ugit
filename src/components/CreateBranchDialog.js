import React, { useState, useEffect } from 'react';
import './CreateBranchDialog.css';

const CHECKOUT_AFTER_KEY = 'ugit-create-branch-checkout-after';

function CreateBranchDialog({ onClose, onCreateBranch, currentBranch, gitAdapter }) {
  const [branchName, setBranchName] = useState('');
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(() => {
    const saved = localStorage.getItem(CHECKOUT_AFTER_KEY);
    return saved === 'true';
  });
  const [branchExists, setBranchExists] = useState(false);
  const [existingBranchName, setExistingBranchName] = useState('');

  // Auto-fill with current branch name when dialog opens
  useEffect(() => {
    setBranchName(currentBranch || '');
  }, [currentBranch]);

  // Save checkbox state when it changes
  useEffect(() => {
    localStorage.setItem(CHECKOUT_AFTER_KEY, checkoutAfterCreate.toString());
  }, [checkoutAfterCreate]);

  // Check if branch name already exists
  const checkBranchExists = async (name) => {
    if (!name.trim()) {
      setBranchExists(false);
      setExistingBranchName('');
      return;
    }

    if (!gitAdapter || !gitAdapter.repoPath) {
      setBranchExists(false);
      setExistingBranchName('');
      return;
    }

    try {
      const branches = await gitAdapter.branchLocal();
      const branchExists = branches.all.includes(name);
      setBranchExists(branchExists);
      setExistingBranchName(branchExists ? name : '');
    } catch (error) {
      console.error('Error checking branch existence:', error);
      setBranchExists(false);
      setExistingBranchName('');
    }
  };

  // Validate branch name when it changes
  useEffect(() => {
    if (branchName.trim()) {
      checkBranchExists(branchName);
    } else {
      setBranchExists(false);
      setExistingBranchName('');
    }
  }, [branchName]);

  const handleCreate = async () => {
    onClose();
    await onCreateBranch(branchName, checkoutAfterCreate);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Create Branch</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Create branch at: <strong>{currentBranch}</strong>
          </div>

          <div className="dialog-field">
            <label htmlFor="branch-name">Branch name:</label>
            <input
              id="branch-name"
              type="text"
              className={`dialog-input ${branchExists && branchName.trim() ? 'error' : ''}`}
              placeholder="Enter branch name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {branchExists && branchName.trim() && (
              <div className="branch-exists-warning">
                Branch name "{existingBranchName}" already exists
              </div>
            )}
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={checkoutAfterCreate}
                onChange={(e) => setCheckoutAfterCreate(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Check out after create</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className={`dialog-button dialog-button-primary ${!branchName.trim() || branchExists ? 'disabled' : ''}`}
            onClick={handleCreate}
            disabled={!branchName.trim() || branchExists}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateBranchDialog;