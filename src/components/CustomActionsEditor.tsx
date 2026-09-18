import React, { useState } from 'react';
import { CustomAction } from '../utils/settings';
import { useSettings } from '../contexts/SettingsContext';
import { PLACEHOLDERS } from '../utils/customActions';
import './CustomActionsEditor.css';

const TARGETS: Array<{ value: CustomAction['target']; label: string }> = [
  { value: 'file', label: 'File context menu' },
  { value: 'commit', label: 'Commit context menu' },
  { value: 'branch', label: 'Branch context menu' },
  { value: 'repository', label: 'Repository menu' }
];

/**
 * The custom actions editor, inside Preferences.
 *
 * Each action is a command line the user owns, so this saves as it goes rather
 * than through the dialog's Save: the list is data, not a form.
 */
function CustomActionsEditor(): React.ReactElement {
  const { getSetting, updateSetting } = useSettings();
  const actions: CustomAction[] = getSetting('customActions') || [];
  const [error, setError] = useState<string | null>(null);

  const save = async (next: CustomAction[]) => {
    setError(null);
    const saved = await updateSetting('customActions', next);
    if (!saved)
      setError("Couldn't save the actions.");
  };

  const addAction = () => {
    const action: CustomAction = {
      // Date.now is enough to tell one action apart from another here.
      id: `action-${Date.now()}`,
      name: 'New Action',
      command: '',
      target: 'file',
      showOutput: true
    };
    save([...actions, action]);
  };

  const changeAction = (id: string, changes: Partial<CustomAction>) => {
    save(actions.map(action => (action.id === id ? { ...action, ...changes } : action)));
  };

  const removeAction = (id: string) => {
    save(actions.filter(action => action.id !== id));
  };

  const move = (id: string, delta: number) => {
    const index = actions.findIndex(action => action.id === id);
    const to = index + delta;
    if (index === -1 || to < 0 || to >= actions.length)
      return;
    const next = [...actions];
    const [action] = next.splice(index, 1);
    next.splice(to, 0, action);
    save(next);
  };

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Custom Actions</h4>

      <div className="setting-group">
        <small>
          Commands of your own, added to ugit's context menus. Each runs in the repository's
          folder, with these placeholders filled in:{' '}
          {PLACEHOLDERS.map((placeholder, index) => (
            <span key={placeholder.token}>
              {index > 0 && ', '}
              <code title={placeholder.meaning}>{placeholder.token}</code>
            </span>
          ))}
          .
        </small>
      </div>

      {error && <div className="custom-actions-error">{error}</div>}

      {actions.length === 0 ? (
        <div className="custom-actions-empty">No custom actions yet.</div>
      ) : (
        <div className="custom-actions-list">
          {actions.map((action, index) => (
            <div key={action.id} className="custom-action-row">
              <div className="custom-action-line">
                <input
                  className="custom-action-name"
                  value={action.name}
                  placeholder="Name shown in the menu"
                  onChange={(e) => changeAction(action.id, { name: e.target.value })}
                />
                <select
                  className="custom-action-target"
                  value={action.target}
                  onChange={(e) => changeAction(action.id, { target: e.target.value as CustomAction['target'] })}
                >
                  {TARGETS.map(target => (
                    <option key={target.value} value={target.value}>{target.label}</option>
                  ))}
                </select>
                <label className="custom-action-output" title="Show what the command printed when it finishes">
                  <input
                    type="checkbox"
                    checked={action.showOutput}
                    onChange={(e) => changeAction(action.id, { showOutput: e.target.checked })}
                  />
                  <span>Show output</span>
                </label>
                <button
                  className="custom-action-mini"
                  onClick={() => move(action.id, -1)}
                  disabled={index === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="custom-action-mini"
                  onClick={() => move(action.id, 1)}
                  disabled={index === actions.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="custom-action-mini danger"
                  onClick={() => removeAction(action.id)}
                  title="Remove this action"
                >
                  ✕
                </button>
              </div>
              <input
                className="custom-action-command"
                value={action.command}
                placeholder='e.g. code --diff "$FILE" or npm test'
                onChange={(e) => changeAction(action.id, { command: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      <div className="setting-group">
        <button className="custom-action-add" onClick={addAction}>Add Action</button>
      </div>
    </div>
  );
}

export default CustomActionsEditor;
