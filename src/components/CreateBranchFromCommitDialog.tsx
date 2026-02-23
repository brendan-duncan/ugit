import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './CreateBranchFromCommitDialog.css';

interface CreateBranchFromCommitDialogProps {
  onClose: () => void;
  onCreateBranch: (branchName: string, checkoutAfterCreate: boolean) => void | Promise<void>;
  commitHash: string;
  commitMessage: string;
}

function CreateBranchFromCommitDialog({ onClose, onCreateBranch, commitHash, commitMessage }: CreateBranchFromCommitDialogProps): React.ReactElement {
  const [branchName, setBranchName] = useState<string>('');
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState<boolean>(true);
  const [branchExists, setBranchExists] = useState<boolean>(false);
  const [existingBranchName, setExistingBranchName] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Check if branch name already exists
  const checkBranchExists = async (name: string) => {
    if (!name.trim()) {
      setBranchExists(false);
      setExistingBranchName('');
      return;
    }

    // We can't check branch existence without gitAdapter in this simple dialog
    // For now, just validate the name format
    const isValid = /^[a-zA-Z0-9\-_\/]+$/.test(name.trim());
    setBranchExists(!isValid);
    setExistingBranchName(!isValid ? 'Invalid branch name' : '');
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
    if (isCreating || !branchName.trim() || branchExists)
      return;

    setIsCreating(true);
    try {
      await onCreateBranch(branchName.trim(), checkoutAfterCreate);
      onClose();
    } catch (error) {
      console.error('Error creating branch:', error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="dialog-header">
          <h3>Create Branch from Commit</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Create branch from commit:
          </div>
          <div className="commit-info">
            <div className="commit-hash">{commitHash}</div>
            <div className="create-branch-commit-message">{commitMessage}</div>
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
              disabled={isCreating}
              autoFocus
            />
            {branchExists && branchName.trim() && (
              <div className="branch-exists-warning">
                {existingBranchName}
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
                disabled={isCreating}
              />
              <span>Check out after create</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className={`dialog-button dialog-button-primary ${!branchName.trim() || branchExists || isCreating ? 'disabled' : ''}`}
            onClick={handleCreate}
            disabled={!branchName.trim() || branchExists || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateBranchFromCommitDialog;