import React, { useState, useEffect } from 'react';
import './Dialog.css';
import './PushDialog.css';
import { useSettings } from '../contexts/SettingsContext';
import { GitAdapter } from '../git/GitAdapter';

interface PushDialogProps {
  onClose: () => void;
  onPush: (branch: string, remoteBranch: string, pushAllTags: boolean) => void;
  // Push several branches in one go, each to its upstream or the same name.
  onPushMultiple?: (targets: Array<{ branch: string; remoteBranch: string }>, pushAllTags: boolean) => void;
  branches: string[];
  currentBranch: string;
  gitAdapter?: GitAdapter | null;
}

const PushDialog: React.FC<PushDialogProps> = ({ onClose, onPush, onPushMultiple, branches, currentBranch, gitAdapter }) => {
  const { settings, updateSetting } = useSettings();
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranch || '');
  const [remoteBranch, setRemoteBranch] = useState<string>(currentBranch || '');
  // Each local branch's upstream on origin, and origin's branches, once loaded.
  const [upstreams, setUpstreams] = useState<Record<string, string>>({});
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  // Once the user picks a target themselves, loading upstreams mustn't override it.
  const [targetChosen, setTargetChosen] = useState(false);

  // Where a branch goes by default: the origin branch it tracks, else the same name.
  const defaultTarget = (branch: string): string => upstreams[branch] || branch;

  useEffect(() => {
    if (!gitAdapter)
      return;
    let cancelled = false;
    gitAdapter.getPushTargets('origin')
      .then(targets => {
        if (cancelled)
          return;
        setUpstreams(targets.upstreams);
        setRemoteBranches(targets.remoteBranches);
      })
      .catch(error => console.error('Error reading push targets:', error));
    return () => { cancelled = true; };
  }, [gitAdapter]);

  useEffect(() => {
    if (!targetChosen)
      setRemoteBranch(defaultTarget(selectedBranch));
  }, [upstreams, selectedBranch]);

  // Every local branch name (pushing creates it if missing) plus what origin has.
  const targetOptions = Array.from(new Set([...branches, ...remoteBranches, remoteBranch].filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
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
      onPushMultiple(selected.map(branch => ({ branch, remoteBranch: defaultTarget(branch) })), pushAllTags);
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
              <label>Branches (each to its upstream on origin, else the same name):</label>
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
                    {defaultTarget(branch) !== branch && <span className="push-branch-target">→ origin/{defaultTarget(branch)}</span>}
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
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setTargetChosen(false);
              }}
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
              onChange={(e) => {
                setRemoteBranch(e.target.value);
                setTargetChosen(true);
              }}
              className="dialog-select"
            >
              {targetOptions.map((branch) => (
                <option key={branch} value={branch}>
                  origin/{branch}{branch === upstreams[selectedBranch] ? ' (upstream)' : ''}
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
