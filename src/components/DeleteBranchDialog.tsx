import React, { useState, useEffect } from 'react';
import './Dialog.css';

interface DeleteBranchDialogProps {
  onClose: () => void;
  onConfirm: (options: { deleteRemote: boolean }) => void;
  branchName: string;
}

const DeleteBranchDialog: React.FC<DeleteBranchDialogProps> = ({ onClose, onConfirm, branchName }) => {
  const STORAGE_KEY = 'delete-branch-dialog-option';
  
  // Load saved option from localStorage on mount
  const getSavedOption = (): boolean => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  };
  
  const [deleteRemote, setDeleteRemote] = useState<boolean>(getSavedOption());
  
  // Save to localStorage whenever option changes
  const handleDeleteRemoteChange = (checked: boolean): void => {
    setDeleteRemote(checked);
    try {
      localStorage.setItem(STORAGE_KEY, checked.toString());
    } catch (error) {
      console.warn('Failed to save delete branch dialog option:', error);
    }
  };

  const handleConfirm = () => {
    onConfirm({ deleteRemote });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Delete Branch</h3>
        </div>

        <div className="dialog-body">
          <p>Are you sure you want to delete the branch <strong>{branchName}</strong>?</p>
          <p>This action cannot be undone.</p>
          
          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={deleteRemote}
                onChange={(e) => handleDeleteRemoteChange(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Also delete corresponding remote branch</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleConfirm}>
            Delete
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteBranchDialog;