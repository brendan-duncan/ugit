import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './PullDialog.css';

interface PullDialogProps {
  onClose: () => void;
  onPull: (branch: string, stashAndReapply: boolean, rebase: boolean) => void;
  branches: string[];
  currentBranch: string;
}

const PullDialog: React.FC<PullDialogProps> = ({ onClose, onPull, branches, currentBranch }) => {
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranch || '');
  const [stashAndReapply, setStashAndReapply] = useState<boolean>(false);
  const [rebase, setRebase] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Another branch is fast-forwarded in place, so stash and rebase don't apply.
  const otherBranch = selectedBranch !== currentBranch;

  const handlePull = (): void => {
    onPull(selectedBranch, stashAndReapply, rebase);
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
            {otherBranch && (
              <small className="dialog-hint">
                '{selectedBranch}' isn't checked out. It will be fast-forwarded to its
                remote branch without switching to it, and only if it has no commits
                the remote lacks.
              </small>
            )}
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={stashAndReapply && !otherBranch}
                disabled={otherBranch}
                onChange={(e) => setStashAndReapply(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Stash and reapply local changes</span>
            </label>
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={rebase && !otherBranch}
                disabled={otherBranch}
                onChange={(e) => setRebase(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Rebase instead of merge</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handlePull}>
            Pull
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default PullDialog;
