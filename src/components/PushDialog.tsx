import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './PushDialog.css';
import { useSettings } from '../hooks/useSettings';

interface PushDialogProps {
  onClose: () => void;
  onPush: (branch: string, remoteBranch: string, pushAllTags: boolean) => void;
  branches: string[];
  currentBranch: string;
}

const PushDialog: React.FC<PushDialogProps> = ({ onClose, onPush, branches, currentBranch }) => {
  const { settings, updateSetting } = useSettings();
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranch || '');
  const [remoteBranch, setRemoteBranch] = useState<string>(currentBranch || '');
  const [pushAllTags, setPushAllTags] = useState<boolean>(false);

  // Load pushAllTags setting on mount
  useEffect(() => {
    if (settings) {
      setPushAllTags(settings.pushAllTags);
    }
  }, [settings]);

  const handlePush = (): void => {
    onPush(selectedBranch, remoteBranch, pushAllTags);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Push to Remote</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label htmlFor="branch-select">Branch:</label>
            <select
              id="branch-select"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="dialog-select"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>

          <div className="dialog-field">
            <label htmlFor="remote-branch-select">To:</label>
            <select
              id="remote-branch-select"
              value={remoteBranch}
              onChange={(e) => setRemoteBranch(e.target.value)}
              className="dialog-select"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  origin/{branch}
                </option>
              ))}
            </select>
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={pushAllTags}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setPushAllTags(checked);
                  updateSetting('pushAllTags', checked);
                }}
                className="dialog-checkbox"
              />
              <span>Push all tags</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="dialog-button button-primary" onClick={handlePush}>
            Push
          </button>
        </div>
      </div>
    </div>
  );
}

export default PushDialog;
