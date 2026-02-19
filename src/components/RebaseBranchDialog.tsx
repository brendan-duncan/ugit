import React, { useState, useEffect } from 'react';
import { GitAdapter } from '../git/GitAdapter';
import './Dialog.css';

interface RebaseBranchDialogProps {
  onClose: () => void;
  onRebase: (options: { sourceBranch: string; targetBranch: string }) => void;
  sourceBranch: string;
  targetBranch: string;
  gitAdapter: GitAdapter;
}

function RebaseBranchDialog({ onClose, onRebase, sourceBranch, targetBranch, gitAdapter }: RebaseBranchDialogProps) {
  const [conflictCheck, setConflictCheck] = useState({ loading: true, result: null });

  useEffect(() => {
    const checkConflicts = async () => {
      if (!gitAdapter || !sourceBranch || !targetBranch) {
        setConflictCheck({ loading: false, result: null });
        return;
      }

      try {
        const result = await gitAdapter.raw([
          'merge-tree',
          `$(git merge-base ${targetBranch} ${sourceBranch})`,
          targetBranch,
          sourceBranch
        ]);

        const hasConflicts = !!result?.includes('<<<<<<< ');
        
        setConflictCheck({ 
          loading: false, 
          result: {
            hasConflicts,
            message: hasConflicts ? 
              '⚠️ This rebase may cause conflicts' : 
              '✅ This rebase can be completed without conflicts'
          }
        });
      } catch (error) {
        console.warn('Failed to check rebase conflicts:', error);
        setConflictCheck({ 
          loading: false, 
          result: {
            hasConflicts: null,
            message: '⚠️ Unable to check for conflicts'
          }
        });
      }
    };

    checkConflicts();
  }, [gitAdapter, sourceBranch, targetBranch]);

  const handleRebase = () => {
    onRebase({
      sourceBranch,
      targetBranch
    });
  };

  const getConflictStatusClass = () => {
    if (conflictCheck.loading)
      return 'conflict-check-loading';
    if (!conflictCheck.result)
      return 'conflict-check-unknown';
    if (conflictCheck.result.hasConflicts === null)
      return 'conflict-check-unknown';
    return conflictCheck.result.hasConflicts ? 'conflict-check-warning' : 'conflict-check-success';
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Rebase Branch</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label>Rebase:</label>
            <input
              type="text"
              value={sourceBranch || ''}
              disabled
              className="dialog-input"
              style={{ backgroundColor: '#2d2d2d', color: '#cccccc' }}
            />
          </div>
          
          <div className="dialog-field">
            <label>Onto:</label>
            <input
              type="text"
              value={targetBranch || ''}
              disabled
              className="dialog-input"
              style={{ backgroundColor: '#2d2d2d', color: '#cccccc' }}
            />
          </div>

          <div className="dialog-field">
            <label>Conflict Check:</label>
            <div className={`conflict-check ${getConflictStatusClass()}`}>
              {conflictCheck.loading ? (
                'Checking for conflicts...'
              ) : conflictCheck.result ? (
                conflictCheck.result.message
              ) : (
                'Unable to check for conflicts'
              )}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleRebase}
          >
            Rebase
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default RebaseBranchDialog;
