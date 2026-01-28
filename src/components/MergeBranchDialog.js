import React, { useState, useEffect } from 'react';
import './PullDialog.css';

function MergeBranchDialog({ onClose, onMerge, sourceBranch, targetBranch, gitAdapter }) {
  const [selectedOption, setSelectedOption] = useState('default');
  const [conflictCheck, setConflictCheck] = useState({ loading: true, result: null });
  const STORAGE_KEY = 'merge-branch-dialog-option';

  // Load saved option from localStorage on mount
  const getSavedOption = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'default';
    } catch {
      return 'default';
    }
  };

  // Merge options configuration
  const mergeOptions = [
    { value: 'default', label: 'Default (fast-forward if possible)', flag: null },
    { value: 'no-ff', label: 'No Fast-Forward (always create a merge commit, --no-ff)', flag: '--no-ff' },
    { value: 'squash', label: 'Squash (squash merge, --squash)', flag: '--squash' },
    { value: 'no-commit', label: 'Don\'t Commit (merge without commit, --no-commit)', flag: '--no-commit' }
  ];

  // Initialize selected option
  useEffect(() => {
    setSelectedOption(getSavedOption());
  }, []);

  // Save to localStorage whenever option changes
  const handleOptionChange = (option) => {
    setSelectedOption(option);
    try {
      localStorage.setItem(STORAGE_KEY, option);
    } catch (error) {
      console.warn('Failed to save merge branch dialog option:', error);
    }
  };

  // Check for potential conflicts
  useEffect(() => {
    const checkConflicts = async () => {
      if (!gitAdapter || !sourceBranch || !targetBranch) {
        setConflictCheck({ loading: false, result: null });
        return;
      }

      try {
        // Check if merge would cause conflicts by doing a dry run
        // We use git merge-tree to check for conflicts without actually merging
        const result = await gitAdapter.raw([
          'merge-tree', 
          `$(git merge-base ${targetBranch} ${sourceBranch})`,
          targetBranch,
          sourceBranch
        ]);

        // If the result contains conflict markers, there are conflicts
        const hasConflicts = !!result?.includes('<<<<<<< ');
        
        setConflictCheck({ 
          loading: false, 
          result: {
            hasConflicts,
            message: hasConflicts ? 
              '⚠️ This merge may cause conflicts' : 
              '✅ This merge can be completed without conflicts'
          }
        });
      } catch (error) {
        console.warn('Failed to check merge conflicts:', error);
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

  const handleMerge = () => {
    const selectedConfig = mergeOptions.find(opt => opt.value === selectedOption);
    onMerge({
      sourceBranch,
      targetBranch,
      mergeOption: selectedOption,
      flag: selectedConfig?.flag || null
    });
  };

  const getConflictStatusClass = () => {
    if (conflictCheck.loading) return 'conflict-check-loading';
    if (!conflictCheck.result) return 'conflict-check-unknown';
    if (conflictCheck.result.hasConflicts === null) return 'conflict-check-unknown';
    return conflictCheck.result.hasConflicts ? 'conflict-check-warning' : 'conflict-check-success';
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Merge Branch</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label>Merge:</label>
            <input
              type="text"
              value={sourceBranch || ''}
              disabled
              className="dialog-input"
              style={{ backgroundColor: '#2d2d2d', color: '#cccccc' }}
            />
          </div>
          
          <div className="dialog-field">
            <label>Into:</label>
            <input
              type="text"
              value={targetBranch || ''}
              disabled
              className="dialog-input"
              style={{ backgroundColor: '#2d2d2d', color: '#cccccc' }}
            />
          </div>

          <div className="dialog-field">
            <label>Merge Option:</label>
            <select
              value={selectedOption}
              onChange={(e) => handleOptionChange(e.target.value)}
              className="dialog-select"
            >
              {mergeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            onClick={handleMerge}
          >
            Merge
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default MergeBranchDialog;