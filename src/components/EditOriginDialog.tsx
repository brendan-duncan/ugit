import React, { useState, useEffect } from 'react';
import './Dialog.css';

interface EditOriginDialogProps {
  onClose: () => void;
  onEditOrigin: (url: string) => void | Promise<void>;
  currentOriginUrl?: string;
}

const EditOriginDialog: React.FC<EditOriginDialogProps> = ({ onClose, onEditOrigin, currentOriginUrl }) => {
  const [originUrl, setOriginUrl] = useState<string>('');

  useEffect(() => {
    setOriginUrl(currentOriginUrl || '');
  }, [currentOriginUrl]);

  const handleEdit = (): void => {
    if (originUrl.trim()) {
      onEditOrigin(originUrl.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleEdit();
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Edit Origin Remote</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label htmlFor="origin-url">Origin URL:</label>
            <input
              id="origin-url"
              type="text"
              value={originUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOriginUrl(e.target.value)}
              className="dialog-input"
              placeholder="https://github.com/user/repo.git"
              autoFocus
              onKeyPress={handleKeyPress}
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleEdit}
            disabled={!originUrl.trim()}
          >
            Save
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditOriginDialog;