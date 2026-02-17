import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './AmendCommitDialog.css';

interface AmendCommitDialogProps {
  onClose: () => void;
  onAmend: (newMessage: string) => void | Promise<void>;
  commitMessage: string;
}

function AmendCommitDialog({ onClose, onAmend, commitMessage }: AmendCommitDialogProps): React.ReactElement {
  const [message, setMessage] = useState<string>(commitMessage);
  const [isAmending, setIsAmending] = useState<boolean>(false);

  const handleAmend = async () => {
    if (isAmending || !message.trim())
      return;

    setIsAmending(true);
    try {
      await onAmend(message.trim());
      onClose();
    } catch (error) {
      console.error('Error amending commit:', error);
      setIsAmending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAmend();
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="dialog-header">
          <h3>Amend Commit Message</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Enter a new commit message:
          </div>

          <div className="dialog-field">
            <textarea
              className="dialog-input amend-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isAmending}
              autoFocus
              rows={5}
            />
          </div>

          <div className="dialog-info">
            <p>Note: Amending a commit will replace the previous commit.</p>
            <p>If this commit has already been pushed, force push may be required to update the remote.</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose} disabled={isAmending}>
            Cancel
          </button>
          <button
            className={`dialog-button dialog-button-primary ${!message.trim() || isAmending ? 'disabled' : ''}`}
            onClick={handleAmend}
            disabled={!message.trim() || isAmending}
          >
            {isAmending ? 'Amending...' : 'Amend'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AmendCommitDialog;
