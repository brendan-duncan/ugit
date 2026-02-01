import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './CreateTagFromCommitDialog.css';

interface CreateTagFromCommitDialogProps {
  onClose: () => void;
  onCreateTag: (tagName: string, tagMessage: string) => void | Promise<void>;
  commitHash: string;
  commitMessage: string;
}

function CreateTagFromCommitDialog({ onClose, onCreateTag, commitHash, commitMessage }: CreateTagFromCommitDialogProps): React.ReactElement {
  const [tagName, setTagName] = useState<string>('');
  const [tagMessage, setTagMessage] = useState<string>('');
  const [tagExists, setTagExists] = useState<boolean>(false);
  const [existingTagName, setExistingTagName] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  
  // Validate tag name when it changes
  useEffect(() => {
    if (tagName.trim()) {
      // Basic tag name validation
      const isValid = /^[a-zA-Z0-9\-_\.]+$/.test(tagName.trim());
      setTagExists(!isValid);
      setExistingTagName(!isValid ? 'Invalid tag name' : '');
    } else {
      setTagExists(false);
      setExistingTagName('');
    }
  }, [tagName]);

  const handleCreate = async () => {
    if (isCreating || !tagName.trim() || tagExists) return;

    setIsCreating(true);
    try {
      await onCreateTag(tagName.trim(), tagMessage.trim());
      onClose();
    } catch (error) {
      console.error('Error creating tag:', error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="dialog-header">
          <h3>Create Tag from Commit</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Create tag for commit:
          </div>
          <div className="commit-info">
            <div className="commit-hash">{commitHash}</div>
            <div className="commit-message">{commitMessage}</div>
          </div>

          <div className="dialog-field">
            <label htmlFor="tag-name">Tag name:</label>
            <input
              id="tag-name"
              type="text"
              className={`dialog-input ${tagExists && tagName.trim() ? 'error' : ''}`}
              placeholder="Enter tag name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              disabled={isCreating}
              autoFocus
            />
            {tagExists && tagName.trim() && (
              <div className="tag-exists-warning">
                {existingTagName}
              </div>
            )}
          </div>

          <div className="dialog-field">
            <label htmlFor="tag-message">Tag message (optional):</label>
            <textarea
              id="tag-message"
              className="dialog-textarea"
              placeholder="Enter tag message"
              value={tagMessage}
              onChange={(e) => setTagMessage(e.target.value)}
              disabled={isCreating}
              rows={3}
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose} disabled={isCreating}>
            Cancel
          </button>
          <button
            className={`dialog-button dialog-button-primary ${!tagName.trim() || tagExists || isCreating ? 'disabled' : ''}`}
            onClick={handleCreate}
            disabled={!tagName.trim() || tagExists || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateTagFromCommitDialog;