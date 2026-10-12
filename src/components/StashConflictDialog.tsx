import React, { useEffect } from 'react';
import './Dialog.css';

interface StashConflictDialogProps {
  onClose: () => void;
  // Which step stopped: the pull itself, or re-applying the stashed changes.
  kind: 'pull-conflict' | 'apply-conflict';
  stashMessage: string;
  conflictedFiles?: string[];
}

function StashConflictDialog({ onClose, kind, stashMessage, conflictedFiles = [] }: StashConflictDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const shown = conflictedFiles.slice(0, 10);
  const more = conflictedFiles.length - shown.length;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{kind === 'pull-conflict' ? 'Pull Conflicts' : 'Stash Conflicts'}</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-error">
            {kind === 'pull-conflict'
              ? 'The pull stopped with conflicts. Nothing was committed.'
              : 'Your changes conflict with what was pulled. Nothing was committed.'}
          </div>
          <div className="dialog-info">
            {kind === 'pull-conflict' ? (
              <>
                <p>Your local changes are safe in the stash "{stashMessage}" and haven't been re-applied.</p>
                <p>Resolve the conflicts and finish the pull - commit the merge, or continue the
                  rebase. ugit will then offer to restore your changes, and you can commit them.</p>
              </>
            ) : (
              <>
                <p>Your changes were re-applied, with conflicts in:</p>
                <ul>
                  {shown.map(file => <li key={file}>{file}</li>)}
                  {more > 0 && <li>and {more} more</li>}
                </ul>
                <p>Resolve them, then commit. A copy of your changes stays in the stash
                  "{stashMessage}" until the conflicts are resolved.</p>
              </>
            )}
          </div>
        </div>

        <div className="dialog-footer">
          <button
            className="dialog-button dialog-button-primary"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default StashConflictDialog;
