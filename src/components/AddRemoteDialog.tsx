import React, { useState, useEffect, useRef } from 'react';
import './Dialog.css';

interface AddRemoteDialogProps {
  onClose: () => void;
  onAddRemote: (name: string, url: string) => void | Promise<void>;
  // Check a URL can be reached before committing to it. Read-only.
  onTestConnection?: (url: string) => Promise<{ ok: boolean; message: string }>;
}

function AddRemoteDialog({ onClose, onAddRemote, onTestConnection }: AddRemoteDialogProps) {
  const [remoteName, setRemoteName] = useState<string>('');
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleTest = async (): Promise<void> => {
    if (!onTestConnection || !remoteUrl.trim())
      return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTestConnection(remoteUrl.trim()));
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || String(err) });
    } finally {
      setTesting(false);
    }
  };

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
              onKeyDown={handleKeyPress}
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
              onKeyDown={handleUrlKeyPress}
              disabled={loading}
            />
          </div>

          {onTestConnection && (
            <div className="dialog-field remote-test-row">
              <button
                className="dialog-button dialog-button-cancel remote-test-button"
                onClick={handleTest}
                disabled={testing || !remoteUrl.trim()}
                title="Ask the remote for its branches, without changing anything"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              {testResult && (
                <span className={`remote-test-result ${testResult.ok ? 'ok' : 'failed'}`}>
                  {testResult.ok ? '✓' : '✕'} {testResult.message}
                </span>
              )}
            </div>
          )}

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
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddRemoteDialog;