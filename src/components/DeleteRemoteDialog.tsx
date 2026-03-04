import React, { useEffect } from 'react';
import './Dialog.css';

interface DeleteRemoteDialogProps {
  onClose: () => void;
  onDeleteRemote: (name: string) => void | Promise<void>;
  remoteName: string;
  remoteUrl: string;
}

function DeleteRemoteDialog({ onClose, onDeleteRemote, remoteName, remoteUrl }: DeleteRemoteDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDelete = async (): Promise<void> => {
    if (onDeleteRemote) {
      await onDeleteRemote(remoteName);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Delete Remote</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-info">
            <p>Are you sure you want to delete the remote "<strong>{remoteName}</strong>"?</p>
            <p>Remote URL: {remoteUrl}</p>
            <p>This action cannot be undone.</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-cancel" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleDelete}
          >
            Delete Remote
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteRemoteDialog;