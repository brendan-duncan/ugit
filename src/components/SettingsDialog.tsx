import React, { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useAlert } from '../contexts/AlertContext';
import './Dialog.css';
import './SettingsDialog.css';

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { showConfirm } = useAlert();
  const { settings, loadingSettings, settingsError, updateSetting, resetSettings } = useSettings();
  const [localRefreshTime, setLocalRefreshTime] = useState<number>(5);
  const [blockCommitBranches, setBlockCommitBranches] = useState<string>('');
  const [pushAllTags, setPushAllTags] = useState<boolean>(false);
  const [maxCommits, setMaxCommits] = useState<number>(100);
  const [externalEditor, setExternalEditor] = useState<string>('code');
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when settings load
  React.useEffect(() => {
    if (settings) {
      setLocalRefreshTime(settings.localFileRefreshTime);
      setBlockCommitBranches(settings.blockCommitBranches.join(', '));
      setPushAllTags(settings.pushAllTags);
      setMaxCommits(settings.maxCommits);
      setExternalEditor(settings.externalEditor);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings)
      return;

    setIsSaving(true);
    try {
      const branchList = blockCommitBranches
        .split(',')
        .map(branch => branch.trim())
        .filter(branch => branch.length > 0);

      await updateSetting('localFileRefreshTime', localRefreshTime);
      await updateSetting('blockCommitBranches', branchList);
      await updateSetting('pushAllTags', pushAllTags);
      await updateSetting('maxCommits', maxCommits);
      await updateSetting('externalEditor', externalEditor);

      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await showConfirm('Are you sure you want to reset all settings to defaults?');
    if (confirmed) {
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
        <div className="dialog settings-dialog">
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
        <div className="dialog settings-dialog">
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
      <div className="dialog settings-dialog">
        <div className="dialog-header">
          <h3>Settings</h3>
        </div>
        <div className="dialog-content">
          <div className="settings-section">
            <h4 className="settings-section-title">Editor</h4>
            
            <div className="setting-group">
              <label htmlFor="externalEditor">
                External Editor Command
              </label>
              <input
                id="externalEditor"
                type="text"
                value={externalEditor}
                onChange={(e) => setExternalEditor(e.target.value)}
                placeholder="code"
              />
              <small>Command to open files in external editor (e.g., code, code-insiders, subl, idea)</small>
            </div>
          </div>

          <div className="settings-section">
            <h4 className="settings-section-title">Git</h4>

            <div className="setting-group">
              <label htmlFor="pushAllTags" className="checkbox-label">
                <input
                  id="pushAllTags"
                  type="checkbox"
                  checked={pushAllTags}
                  onChange={(e) => setPushAllTags(e.target.checked)}
                />
                <span>Push all tags by default</span>
              </label>
              <small>When enabled, the "Push all tags" checkbox in the Push dialog will be checked by default</small>
            </div>

            <div className="setting-group">
              <label htmlFor="blockCommitBranches">
                Blocked Branch Patterns
              </label>
              <input
                id="blockCommitBranches"
                type="text"
                value={blockCommitBranches}
                onChange={(e) => setBlockCommitBranches(e.target.value)}
                placeholder="trunk, main, */staging"
              />
              <small>Branch patterns where commits should be blocked. Use * as wildcard (comma-separated)</small>
            </div>
          </div>

          <div className="settings-section">
            <h4 className="settings-section-title">Performance</h4>

            <div className="setting-row">
              <div className="setting-group half-width">
                <label htmlFor="localFileRefreshTime">
                  File Refresh Time
                </label>
                <div className="input-with-unit">
                  <input
                    id="localFileRefreshTime"
                    type="number"
                    min="1"
                    max="3600"
                    value={localRefreshTime}
                    onChange={(e) => setLocalRefreshTime(parseInt(e.target.value) || 5)}
                  />
                  <span className="unit">sec</span>
                </div>
                <small>How often to refresh local file status</small>
              </div>

              <div className="setting-group half-width">
                <label htmlFor="maxCommits">
                  Max Commits
                </label>
                <input
                  id="maxCommits"
                  type="number"
                  min="1"
                  max="10000"
                  value={maxCommits}
                  onChange={(e) => setMaxCommits(parseInt(e.target.value) || 100)}
                />
                <small>Maximum number of commits to display in lists</small>
              </div>
            </div>
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
          <div className="footer-spacer"></div>
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
