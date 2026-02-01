import React, { useState, useEffect, useRef } from 'react';
import './Dialog.css';

interface EditRemoteDialogProps {
  onClose: () => void;
  onEditRemote: (name: string, url: string) => void | Promise<void>;
  currentName?: string;
  currentUrl?: string;
}

function EditRemoteDialog({ onClose, onEditRemote, currentName, currentUrl }: EditRemoteDialogProps) {
  const [remoteName, setRemoteName] = useState<string>('');
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRemoteName(currentName || '');
    setRemoteUrl(currentUrl || '');
  }, [currentName, currentUrl]);

  useEffect(() => {
    // Focus on the remote URL input when dialog opens
    if (urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, []);

  const handleEdit = async (): Promise<void> => {
    if (!remoteName.trim() || !remoteUrl.trim()) {
      setError('Please provide both remote name and URL');
      return;
    }

    // Validate remote name format
    if (!/^[a-zA-Z0-9_-]+$/.test(remoteName.trim())) {
      setError('Remote name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onEditRemote(remoteName.trim(), remoteUrl.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to edit remote');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleEdit();
    }
  };

  const urlInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Edit Remote</h3>
        </div>

        <div className="dialog-body">
          {error && (
            <div className="dialog-error">
              {error}
            </div>
          )}
          
          <div className="dialog-field">
            <label htmlFor="edit-remote-name">Remote Name:</label>
            <input
              id="edit-remote-name"
              type="text"
              value={remoteName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoteName(e.target.value)}
              className="dialog-input"
              placeholder="origin"
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="edit-remote-url">Remote URL:</label>
            <input
              ref={urlInputRef}
              id="edit-remote-url"
              type="text"
              value={remoteUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoteUrl(e.target.value)}
              className="dialog-input"
              placeholder="https://github.com/user/repo.git"
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="dialog-info">
            <p>Enter the new URL for the remote repository.</p>
            <p>The remote name cannot be changed if it's different from the current name.</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleEdit}
            disabled={loading || !remoteName.trim() || !remoteUrl.trim()}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button 
            className="dialog-button dialog-button-cancel" 
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditRemoteDialog;