import React, { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import './Dialog.css';
import './SettingsDialog.css';

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { settings, loadingSettings, settingsError, updateSetting, resetSettings } = useSettings();
  const [localRefreshTime, setLocalRefreshTime] = useState<number>(5);
  const [blockCommitBranches, setBlockCommitBranches] = useState<string>('');
  const [pushAllTags, setPushAllTags] = useState<boolean>(true);
  const [maxCommits, setMaxCommits] = useState<number>(100);
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when settings load
  React.useEffect(() => {
    if (settings) {
      setLocalRefreshTime(settings.localFileRefreshTime);
      setBlockCommitBranches(settings.blockCommitBranches.join(', '));
      setPushAllTags(settings.pushAllTags);
      setMaxCommits(settings.maxCommits);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings)
      return;

    setIsSaving(true);
    try {
      // Parse the branch list
      const branchList = blockCommitBranches
        .split(',')
        .map(branch => branch.trim())
        .filter(branch => branch.length > 0);

      // Update settings
      await updateSetting('localFileRefreshTime', localRefreshTime);
      await updateSetting('blockCommitBranches', branchList);
      await updateSetting('pushAllTags', pushAllTags);
      await updateSetting('maxCommits', maxCommits);

      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      setIsSaving(true);
      try {
        await resetSettings();
        onClose();
      } catch (err) {
        console.error('Failed to reset settings:', err);
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (loadingSettings) {
    return (
      <div className="dialog-overlay">
        <div className="dialog">
          <div className="dialog-header">
            <h3>Settings</h3>
          </div>
          <div className="dialog-content">
            <p>Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="dialog-overlay">
        <div className="dialog">
          <div className="dialog-header">
            <h3>Settings</h3>
          </div>
          <div className="dialog-content">
            <p className="error">Error: {settingsError}</p>
          </div>
          <div className="dialog-footer">
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <h3>Settings</h3>
        </div>
        <div className="dialog-content">
          <div className="setting-group">
            <label htmlFor="localFileRefreshTime">
              Local File Refresh Time (seconds):
            </label>
            <input
              id="localFileRefreshTime"
              type="number"
              min="1"
              max="3600"
              value={localRefreshTime}
              onChange={(e) => setLocalRefreshTime(parseInt(e.target.value) || 5)}
            />
            <small>How often to refresh local file status</small>
          </div>

          <div className="setting-group">
            <label htmlFor="blockCommitBranches">
              Block Commit Branches:
            </label>
            <input
              id="blockCommitBranches"
              type="text"
              value={blockCommitBranches}
              onChange={(e) => setBlockCommitBranches(e.target.value)}
              placeholder="trunk, */staging"
            />
            <small>Branch patterns where commits should be blocked (comma-separated)</small>
          </div>

          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={pushAllTags}
                onChange={(e) => setPushAllTags(e.target.checked)}
              />
              <span>Push all tags by default</span>
            </label>
            <small>When enabled, the "Push all tags" checkbox in the Push dialog will be checked by default</small>
          </div>

          <div className="setting-group">
            <label htmlFor="maxCommits">
              Max Commits to Display:
            </label>
            <input
              id="maxCommits"
              type="number"
              min="1"
              max="10000"
              value={maxCommits}
              onChange={(e) => setMaxCommits(parseInt(e.target.value) || 100)}
            />
            <small>Maximum number of commits to show in the commit list (filters are applied before limit)</small>
          </div>
        </div>
        <div className="dialog-footer">
          <button 
            onClick={handleReset} 
            disabled={isSaving}
            className="button-secondary"
          >
            Reset to Defaults
          </button>
          <button 
            onClick={onClose} 
            disabled={isSaving}
            className="button-secondary"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="button-primary"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}