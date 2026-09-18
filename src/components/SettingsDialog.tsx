import React, { useState, useEffect, useCallback } from 'react';
import { ipcRenderer } from 'electron';
import { useSettings } from '../contexts/SettingsContext';
import { useAlert } from '../contexts/AlertContext';
import { resolveLoreBin, resolveLoreServerBin, setLoreBinOverride, setLoreServerOverride } from '../lore';
import './Dialog.css';
import CustomActionsEditor from './CustomActionsEditor';
import './SettingsDialog.css';

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { showConfirm } = useAlert();
  const { settings, loadingSettings, settingsError, updateSetting, resetSettings } = useSettings();
  const [localRefreshTime, setLocalRefreshTime] = useState<number>(5);
  const [lockedBranchPatterns, setLockedBranchPatterns] = useState<string>('');
  const [pushAllTags, setPushAllTags] = useState<boolean>(false);
  const [maxCommits, setMaxCommits] = useState<number>(100);
  const [externalEditor, setExternalEditor] = useState<string>('code');
  const [lfsWarnEnabled, setLfsWarnEnabled] = useState<boolean>(true);
  const [lfsWarnThresholdMB, setLfsWarnThresholdMB] = useState<number>(100);
  const [loreBinPath, setLoreBinPath] = useState<string>('');
  const [loreServerPath, setLoreServerPath] = useState<string>('');
  const [detect, setDetect] = useState<{ loreVersion: string | null; serverVersion: string | null } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [commitMessageRuler, setCommitMessageRuler] = useState<number>(50);
  const [showAvatars, setShowAvatars] = useState<boolean>(false);
  const [issueTrackerUrl, setIssueTrackerUrl] = useState<string>('');
  const [issueTrackerPattern, setIssueTrackerPattern] = useState<string>('');

  // Detect installed lore/loreserver using the currently-entered (or resolved) paths.
  const runDetect = useCallback(async () => {
    setLoreBinOverride(loreBinPath.trim() || null);
    setLoreServerOverride(loreServerPath.trim() || null);
    try {
      const r = await ipcRenderer.invoke('lore-detect', resolveLoreBin(), resolveLoreServerBin());
      setDetect({ loreVersion: r.loreVersion, serverVersion: r.serverVersion });
    } catch { setDetect({ loreVersion: null, serverVersion: null }); }
  }, [loreBinPath, loreServerPath]);

  useEffect(() => { runDetect(); }, [runDetect]);

  const installLore = async () => {
    setInstalling(true);
    try {
      const res = await ipcRenderer.invoke('lore-install');
      await runDetect();
      showConfirm(res.ok ? 'Lore installed. You may need to restart ugit if the binaries still aren\'t found.' : `Install failed:\n\n${res.output}`, 'Install Lore');
    } catch (err) {
      showConfirm(err instanceof Error ? err.message : String(err), 'Install Lore');
    } finally { setInstalling(false); }
  };

  // Update local state when settings load
  React.useEffect(() => {
    if (settings) {
      setLocalRefreshTime(settings.localFileRefreshTime);
      setLockedBranchPatterns(settings.lockedBranchPatterns.join(', '));
      setPushAllTags(settings.pushAllTags);
      setMaxCommits(settings.maxCommits);
      setExternalEditor(settings.externalEditor);
      setCommitMessageRuler(settings.commitMessageRuler ?? 50);
      setShowAvatars(!!settings.showAvatars);
      setIssueTrackerUrl(settings.issueTrackerUrl || '');
      setIssueTrackerPattern(settings.issueTrackerPattern || '');
      setLfsWarnEnabled(settings.lfsWarnEnabled);
      setLfsWarnThresholdMB(settings.lfsWarnThresholdMB);
      setLoreBinPath(settings.loreBinPath ?? '');
      setLoreServerPath(settings.loreServerPath ?? '');
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

  const handleSave = async () => {
    if (!settings)
      return;

    setIsSaving(true);
    try {
      const branchList = lockedBranchPatterns
        .split(',')
        .map(branch => branch.trim())
        .filter(branch => branch.length > 0);

      await updateSetting('localFileRefreshTime', localRefreshTime);
      await updateSetting('lockedBranchPatterns', branchList);
      await updateSetting('pushAllTags', pushAllTags);
      await updateSetting('maxCommits', maxCommits);
      await updateSetting('externalEditor', externalEditor);
      await updateSetting('lfsWarnEnabled', lfsWarnEnabled);
      await updateSetting('lfsWarnThresholdMB', lfsWarnThresholdMB);
      await updateSetting('loreBinPath', loreBinPath.trim());
      await updateSetting('loreServerPath', loreServerPath.trim());
      await updateSetting('commitMessageRuler', commitMessageRuler);
      await updateSetting('showAvatars', showAvatars);
      await updateSetting('issueTrackerUrl', issueTrackerUrl.trim());
      await updateSetting('issueTrackerPattern', issueTrackerPattern.trim());

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
              <label htmlFor="lockedBranchPatterns">
                Locked Branch Patterns
              </label>
              <small className="setting-subtitle">Commits are prevented on branches that match these patterns.</small>
              <input
                id="lockedBranchPatterns"
                type="text"
                value={lockedBranchPatterns}
                onChange={(e) => setLockedBranchPatterns(e.target.value)}
                placeholder="trunk, main, */staging"
              />
              <small>Use * as wildcard, comma-separated (e.g. "trunk, */staging" locks trunk and 6000.0/staging).</small>
            </div>

            <div className="setting-group">
              <label htmlFor="lfsWarnEnabled" className="checkbox-label">
                <input
                  id="lfsWarnEnabled"
                  type="checkbox"
                  checked={lfsWarnEnabled}
                  onChange={(e) => setLfsWarnEnabled(e.target.checked)}
                />
                <span>Warn about large files not tracked by Git LFS</span>
              </label>
              <small>Before committing, flag staged files at or above the size below that aren't already tracked by Git LFS.</small>
            </div>

            <div className="setting-group half-width">
              <label htmlFor="lfsWarnThresholdMB">
                Large File Warning Size
              </label>
              <div className="input-with-unit">
                <input
                  id="lfsWarnThresholdMB"
                  type="number"
                  min="1"
                  max="10000"
                  value={lfsWarnThresholdMB}
                  onChange={(e) => setLfsWarnThresholdMB(parseInt(e.target.value) || 100)}
                  disabled={!lfsWarnEnabled}
                />
                <span className="unit">MB</span>
              </div>
              <small>GitHub warns at 50 MB and rejects pushes over 100 MB.</small>
            </div>
          </div>

          <div className="settings-section">
            <h4 className="settings-section-title">Commits &amp; History</h4>

            <div className="setting-group half-width">
              <label htmlFor="commitMessageRuler">Commit Message Guide</label>
              <div className="input-with-unit">
                <input
                  id="commitMessageRuler"
                  type="number"
                  min="0"
                  max="200"
                  value={commitMessageRuler}
                  onChange={(e) => setCommitMessageRuler(parseInt(e.target.value) || 0)}
                />
                <span className="unit">chars</span>
              </div>
              <small>A line in the commit box at this column, and the countdown beside it. 0 hides both.</small>
            </div>

            <div className="setting-group">
              <label htmlFor="showAvatars" className="checkbox-label">
                <input
                  id="showAvatars"
                  type="checkbox"
                  checked={showAvatars}
                  onChange={(e) => setShowAvatars(e.target.checked)}
                />
                <span>Show author pictures from Gravatar</span>
              </label>
              <small>
                Off by default: fetching a picture tells gravatar.com the hash of that author's
                email address. With it off, initials are shown instead.
              </small>
            </div>

            <div className="setting-group">
              <label htmlFor="issueTrackerUrl">Issue Tracker URL</label>
              <input
                id="issueTrackerUrl"
                type="text"
                value={issueTrackerUrl}
                onChange={(e) => setIssueTrackerUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/issues/{id}"
              />
              <small>Issue references in commit messages become links. {'{id}'} is replaced with the reference. Empty turns this off.</small>
            </div>

            <div className="setting-group">
              <label htmlFor="issueTrackerPattern">Issue Reference Pattern</label>
              <input
                id="issueTrackerPattern"
                type="text"
                value={issueTrackerPattern}
                onChange={(e) => setIssueTrackerPattern(e.target.value)}
                placeholder="#(\d+)"
              />
              <small>A regular expression whose first group is the id. Use e.g. ([A-Z]+-\d+) for Jira keys.</small>
            </div>
          </div>

          <CustomActionsEditor />

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
                  Max Display Commits
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

          <div className="settings-section">
            <h4 className="settings-section-title">Lore</h4>

            <div className="setting-group">
              <div className="settings-detect">
                <span>
                  <strong>lore CLI:</strong>{' '}
                  {detect == null ? 'checking…' : detect.loreVersion
                    ? <span className="detect-ok">{detect.loreVersion}</span>
                    : <span className="detect-missing">not found</span>}
                </span>
                <span>
                  <strong>loreserver:</strong>{' '}
                  {detect == null ? 'checking…' : detect.serverVersion
                    ? <span className="detect-ok">{detect.serverVersion}</span>
                    : <span className="detect-missing">not found</span>}
                </span>
                <button type="button" className="button-secondary" disabled={installing} onClick={installLore}>
                  {installing ? 'Installing…' : (detect && detect.loreVersion ? 'Reinstall Lore' : 'Install Lore')}
                </button>
              </div>
              <small>Install runs Epic's official installer for your platform (downloads <code>lore</code> + <code>loreserver</code> onto your PATH).</small>
            </div>

            <div className="setting-group">
              <label htmlFor="loreBinPath">Lore Executable Path</label>
              <input
                id="loreBinPath"
                type="text"
                value={loreBinPath}
                onChange={(e) => setLoreBinPath(e.target.value)}
                onBlur={runDetect}
                placeholder="Auto-detect (LORE_BIN, ~/bin, PATH)"
              />
              <small>Full path to the <code>lore</code> binary. Leave blank to auto-detect via <code>LORE_BIN</code>, then <code>~/bin</code>, then <code>PATH</code>.</small>
            </div>

            <div className="setting-group">
              <label htmlFor="loreServerPath">Lore Server Path</label>
              <input
                id="loreServerPath"
                type="text"
                value={loreServerPath}
                onChange={(e) => setLoreServerPath(e.target.value)}
                onBlur={runDetect}
                placeholder="Auto-detect (LORE_SERVER_BIN, ~/bin, PATH)"
              />
              <small>Full path to the <code>loreserver</code> binary (used by <strong>File → Local Lore Server</strong>). Leave blank to auto-detect.</small>
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
            onClick={handleSave} 
            disabled={isSaving}
            className="button-primary"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button 
            onClick={onClose} 
            disabled={isSaving}
            className="button-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
