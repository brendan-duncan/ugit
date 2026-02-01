import React, { useState, useEffect, useRef } from 'react';
import './Dialog.css';

interface AddRemoteDialogProps {
  onClose: () => void;
  onAddRemote: (name: string, url: string) => void | Promise<void>;
}

function AddRemoteDialog({ onClose, onAddRemote }: AddRemoteDialogProps) {
  const [remoteName, setRemoteName] = useState<string>('');
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus on the name input when dialog opens
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  const handleAdd = async (): Promise<void> => {
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
      await onAddRemote(remoteName.trim(), remoteUrl.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add remote');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  const handleUrlKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Add Remote</h3>
        </div>

        <div className="dialog-body">
          {error && (
            <div className="dialog-error">
              {error}
            </div>
          )}
          
          <div className="dialog-field">
            <label htmlFor="remote-name">Remote Name:</label>
            <input
              ref={nameInputRef}
              id="remote-name"
              type="text"
              value={remoteName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoteName(e.target.value)}
              className="dialog-input"
              placeholder="upstream"
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="remote-url">Remote URL:</label>
            <input
              id="remote-url"
              type="text"
              value={remoteUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoteUrl(e.target.value)}
              className="dialog-input"
              placeholder="https://github.com/user/repo.git"
              onKeyPress={handleUrlKeyPress}
              disabled={loading}
            />
          </div>

          <div className="dialog-info">
            <p>Enter a name and URL for the new remote repository.</p>
            <p>The name can contain letters, numbers, hyphens, and underscores.</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleAdd}
            disabled={loading || !remoteName.trim() || !remoteUrl.trim()}
          >
            {loading ? 'Adding...' : 'Add Remote'}
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

export default AddRemoteDialog;