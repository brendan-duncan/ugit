import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './PushDialog.css';
import { useSettings } from '../contexts/SettingsContext';

interface PushDialogProps {
  onClose: () => void;
  onPush: (branch: string, remoteBranch: string, pushAllTags: boolean) => void;
  // Push several branches in one go, each to the branch of the same name.
  onPushMultiple?: (branches: string[], pushAllTags: boolean) => void;
  branches: string[];
  currentBranch: string;
}

const PushDialog: React.FC<PushDialogProps> = ({ onClose, onPush, onPushMultiple, branches, currentBranch }) => {
  const { settings, updateSetting } = useSettings();
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranch || '');
  const [remoteBranch, setRemoteBranch] = useState<string>(currentBranch || '');
  const [pushAllTags, setPushAllTags] = useState<boolean>(false);
  // Pushing several branches at once is a different shape of choice - each goes
  // to its own name - so it gets its own mode rather than crowding the selects.
  const [multiple, setMultiple] = useState<boolean>(false);
  const [selected, setSelected] = useState<string[]>(currentBranch ? [currentBranch] : []);

  // Load pushAllTags setting on mount
  useEffect(() => {
    if (settings) {
      setPushAllTags(settings.pushAllTags);
    }
  }, [settings]);

  // Close dialog on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePush = (): void => {
    if (multiple && onPushMultiple) {
      onPushMultiple(selected, pushAllTags);
      return;
    }
    onPush(selectedBranch, remoteBranch, pushAllTags);
  };

  const toggleBranch = (branch: string): void => {
    setSelected(previous => previous.includes(branch)
      ? previous.filter(name => name !== branch)
      : [...previous, branch]);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Push to Remote</h3>
        </div>

        <div className="dialog-body">
          {onPushMultiple && (
            <div className="dialog-field">
              <label className="dialog-checkbox-label">
                <input
                  type="checkbox"
                  className="dialog-checkbox"
                  checked={multiple}
                  onChange={(e) => setMultiple(e.target.checked)}
                />
                <span>Push several branches</span>
              </label>
            </div>
          )}

          {multiple ? (
            <div className="dialog-field">
              <label>Branches (each to the same name on origin):</label>
              <div className="push-branch-list">
                {branches.map((branch) => (
                  <label key={branch} className="push-branch-item">
                    <input
                      type="checkbox"
                      className="dialog-checkbox"
                      checked={selected.includes(branch)}
                      onChange={() => toggleBranch(branch)}
                    />
                    <span>{branch}</span>
                    {branch === currentBranch && <span className="push-branch-current">current</span>}
                  </label>
                ))}
              </div>
            </div>
          ) : (
          <>
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
          </>
          )}

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
          <button
            className="dialog-button button-primary"
            onClick={handlePush}
            disabled={multiple && selected.length === 0}
          >
            {multiple ? `Push ${selected.length} Branch${selected.length === 1 ? '' : 'es'}` : 'Push'}
          </button>
          <button className="dialog-button button-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default PushDialog;
