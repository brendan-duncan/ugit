import React, { useMemo, useState } from 'react';
import { ipcRenderer } from 'electron';
import { RepositoryEntry, RepositoryGroup } from '../utils/settings';
import { useSettings } from '../contexts/SettingsContext';
import './Dialog.css';
import './RepositoryManagerDialog.css';

// Where a repository with no group of its own lives, so everything is reachable
// without forcing the user to organize first.
const UNGROUPED = 'Ungrouped';

interface RepositoryManagerDialogProps {
  // Repositories the app has opened before, offered for adding.
  recentRepos: string[];
  onClose: () => void;
  onOpenRepository: (repoPath: string) => void;
}

function folderName(repoPath: string): string {
  const parts = repoPath.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : repoPath;
}

/**
 * The repository manager: the repositories worked on, in groups the user makes,
 * with favourites pinned to the top. The recent list stays as it is; this is for
 * the ones kept on purpose.
 */
function RepositoryManagerDialog({ recentRepos, onClose, onOpenRepository }: RepositoryManagerDialogProps): React.ReactElement {
  const { getSetting, updateSetting } = useSettings();
  const groups: RepositoryGroup[] = getSetting('repositoryGroups') || [];

  const [filter, setFilter] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const save = async (next: RepositoryGroup[]) => {
    setError(null);
    const saved = await updateSetting('repositoryGroups', next);
    if (!saved)
      setError("Couldn't save the repository list.");
  };

  /** Every repository in the manager, with the group it belongs to. */
  const entries = useMemo(() => {
    const all: Array<{ group: string; entry: RepositoryEntry }> = [];
    for (const group of groups) {
      for (const entry of group.repositories || [])
        all.push({ group: group.name, entry });
    }
    return all;
  }, [groups]);

  const known = useMemo(() => new Set(entries.map(item => item.entry.path)), [entries]);
  const needle = filter.trim().toLowerCase();

  const matches = (entry: RepositoryEntry) =>
    !needle || entry.name.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle);

  const addRepository = async (repoPath: string, groupName: string = UNGROUPED) => {
    if (known.has(repoPath))
      return;

    const next = groups.map(group => ({ ...group, repositories: [...(group.repositories || [])] }));
    let group = next.find(candidate => candidate.name === groupName);
    if (!group) {
      group = { name: groupName, repositories: [] };
      next.push(group);
    }
    group.repositories.push({ path: repoPath, name: folderName(repoPath) });
    await save(next);
  };

  const browseForRepository = async () => {
    const result = await ipcRenderer.invoke('show-open-dialog', {
      title: 'Add Repository',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths && result.filePaths[0])
      await addRepository(result.filePaths[0]);
  };

  const removeRepository = async (groupName: string, repoPath: string) => {
    const next = groups
      .map(group => group.name === groupName
        ? { ...group, repositories: (group.repositories || []).filter(entry => entry.path !== repoPath) }
        : group)
      // An empty group the user didn't name themselves isn't worth keeping.
      .filter(group => group.name !== UNGROUPED || (group.repositories || []).length > 0);
    await save(next);
  };

  const toggleFavorite = async (groupName: string, repoPath: string) => {
    const next = groups.map(group => group.name !== groupName ? group : {
      ...group,
      repositories: (group.repositories || []).map(entry =>
        entry.path === repoPath ? { ...entry, favorite: !entry.favorite } : entry)
    });
    await save(next);
  };

  const moveToGroup = async (repoPath: string, fromGroup: string, toGroup: string) => {
    if (fromGroup === toGroup)
      return;

    const moving = entries.find(item => item.entry.path === repoPath)?.entry;
    if (!moving)
      return;

    const next = groups.map(group => ({ ...group, repositories: [...(group.repositories || [])] }));
    const from = next.find(group => group.name === fromGroup);
    if (from)
      from.repositories = from.repositories.filter(entry => entry.path !== repoPath);

    let to = next.find(group => group.name === toGroup);
    if (!to) {
      to = { name: toGroup, repositories: [] };
      next.push(to);
    }
    to.repositories.push(moving);

    await save(next.filter(group => group.name !== UNGROUPED || group.repositories.length > 0));
  };

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name || groups.some(group => group.name === name))
      return;
    await save([...groups, { name, repositories: [] }]);
    setNewGroupName('');
  };

  const removeGroup = async (groupName: string) => {
    // The repositories in it aren't lost, just ungrouped.
    const group = groups.find(candidate => candidate.name === groupName);
    const orphans = group ? (group.repositories || []) : [];
    const next = groups.filter(candidate => candidate.name !== groupName);

    if (orphans.length > 0) {
      let ungrouped = next.find(candidate => candidate.name === UNGROUPED);
      if (!ungrouped) {
        ungrouped = { name: UNGROUPED, repositories: [] };
        next.push(ungrouped);
      }
      ungrouped.repositories = [...(ungrouped.repositories || []), ...orphans];
    }

    await save(next);
  };

  const groupNames = groups.map(group => group.name);
  const notAdded = recentRepos.filter(repoPath => !known.has(repoPath));

  return (
    <div className="dialog-overlay">
      <div className="dialog-content repo-manager-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header repo-manager-header">
          <h3>Repository Manager</h3>
          <div className="repo-manager-header-controls">
            <input
              className="dialog-input repo-manager-filter"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button className="repo-manager-mini" onClick={browseForRepository}>Add Repository...</button>
          </div>
        </div>

        <div className="dialog-body repo-manager-body">
          {error && <div className="repo-manager-error">{error}</div>}

          {groups.length === 0 && (
            <div className="repo-manager-empty">
              Nothing here yet. Add a repository, or take one from the recent list below.
            </div>
          )}

          {groups.map(group => {
            const shown = (group.repositories || [])
              .filter(matches)
              // Favourites first, then by name.
              .sort((a, b) => (a.favorite === b.favorite ? a.name.localeCompare(b.name) : a.favorite ? -1 : 1));

            return (
              <div key={group.name} className="repo-manager-group">
                <div className="repo-manager-group-head">
                  <span className="repo-manager-group-name">{group.name}</span>
                  <span className="repo-manager-group-count">
                    {(group.repositories || []).length}
                  </span>
                  {group.name !== UNGROUPED && (
                    <button
                      className="repo-manager-mini"
                      onClick={() => removeGroup(group.name)}
                      title="Remove the group, keeping its repositories"
                    >
                      Remove Group
                    </button>
                  )}
                </div>

                {shown.length === 0 ? (
                  <div className="repo-manager-group-empty">
                    {(group.repositories || []).length === 0 ? 'Empty' : 'Nothing matches the filter'}
                  </div>
                ) : shown.map(entry => (
                  <div key={entry.path} className="repo-manager-row">
                    <button
                      className={`repo-manager-star ${entry.favorite ? 'on' : ''}`}
                      onClick={() => toggleFavorite(group.name, entry.path)}
                      title={entry.favorite ? 'Remove from favourites' : 'Mark as a favourite'}
                    >
                      {entry.favorite ? '★' : '☆'}
                    </button>
                    <span
                      className="repo-manager-name"
                      title={entry.path}
                      onDoubleClick={() => { onOpenRepository(entry.path); onClose(); }}
                    >
                      {entry.name}
                    </span>
                    <span className="repo-manager-path" title={entry.path}>{entry.path}</span>
                    <select
                      className="repo-manager-group-select"
                      value={group.name}
                      onChange={(e) => moveToGroup(entry.path, group.name, e.target.value)}
                      title="Move to another group"
                    >
                      {[...new Set([...groupNames, UNGROUPED])].map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <button
                      className="repo-manager-mini"
                      onClick={() => { onOpenRepository(entry.path); onClose(); }}
                    >
                      Open
                    </button>
                    <button
                      className="repo-manager-mini"
                      onClick={() => removeRepository(group.name, entry.path)}
                      title="Remove from the manager; the repository itself isn't touched"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            );
          })}

          {notAdded.length > 0 && (
            <div className="repo-manager-group">
              <div className="repo-manager-group-head">
                <span className="repo-manager-group-name">Recently opened</span>
                <span className="repo-manager-group-count">{notAdded.length}</span>
              </div>
              {notAdded.filter(repoPath => !needle || repoPath.toLowerCase().includes(needle)).map(repoPath => (
                <div key={repoPath} className="repo-manager-row">
                  <span className="repo-manager-star" />
                  <span className="repo-manager-name">{folderName(repoPath)}</span>
                  <span className="repo-manager-path" title={repoPath}>{repoPath}</span>
                  <button className="repo-manager-mini" onClick={() => addRepository(repoPath)}>
                    Add
                  </button>
                  <button
                    className="repo-manager-mini"
                    onClick={() => { onOpenRepository(repoPath); onClose(); }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-footer repo-manager-footer">
          <div className="repo-manager-new-group">
            <input
              className="dialog-input"
              placeholder="New group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }}
            />
            <button className="repo-manager-mini" onClick={addGroup} disabled={!newGroupName.trim()}>
              Add Group
            </button>
          </div>
          <button className="dialog-button button-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default RepositoryManagerDialog;
