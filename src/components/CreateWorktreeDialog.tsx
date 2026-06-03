import React, { useState, useEffect, useMemo } from 'react';
import { ipcRenderer } from 'electron';
import './Dialog.css';
import './CloneDialog.css';
import './CreateWorktreeDialog.css';

export interface CreateWorktreeParams {
  worktreePath: string;
  ref: string;
  newBranch: boolean;
  startPoint?: string;
  force: boolean;
}

interface CreateWorktreeDialogProps {
  onClose: () => void;
  onCreate: (params: CreateWorktreeParams) => Promise<void>;
  branches: string[];
  currentBranch: string;
  repoPath: string;
  // When launched from a branch's "Check out in new worktree" action, pre-select
  // this existing branch and seed the folder name from it.
  prefillBranch?: string | null;
}

// Split a path into its parent directory and final segment using whichever
// separator the path uses (Windows backslash or POSIX forward slash).
function splitPath(p: string): { parent: string; base: string; sep: string } {
  const sep = p.includes('\\') ? '\\' : '/';
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  const base = parts.pop() || p;
  return { parent: parts.join(sep), base, sep };
}

// Make a branch name safe to use as a directory name.
function sanitizeBranch(branch: string): string {
  return branch.replace(/[\\/]/g, '-');
}

const CreateWorktreeDialog: React.FC<CreateWorktreeDialogProps> = ({ onClose, onCreate, branches, currentBranch, repoPath, prefillBranch }) => {
  const { parent: repoParent, base: repoBase, sep } = useMemo(() => splitPath(repoPath), [repoPath]);

  const [branchMode, setBranchMode] = useState<'existing' | 'new'>(prefillBranch ? 'existing' : 'new');
  const [existingBranch, setExistingBranch] = useState<string>(prefillBranch || currentBranch || branches[0] || '');
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [startPoint, setStartPoint] = useState<string>(currentBranch || branches[0] || '');
  const [parentFolder, setParentFolder] = useState<string>(repoParent);
  const [folderName, setFolderName] = useState<string>('');
  const [force, setForce] = useState<boolean>(false);
  const [userEditedFolder, setUserEditedFolder] = useState<boolean>(false);

  // The branch the worktree will be on, used for the default folder-name suggestion.
  const effectiveBranch = branchMode === 'new' ? newBranchName : existingBranch;

  // Suggest a folder name from the repo + branch until the user types their own.
  useEffect(() => {
    if (userEditedFolder)
      return;
    const suffix = effectiveBranch ? `-${sanitizeBranch(effectiveBranch)}` : '';
    setFolderName(`${repoBase}${suffix}`);
  }, [effectiveBranch, repoBase, userEditedFolder]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleBrowse = async () => {
    try {
      const result = await ipcRenderer.invoke('show-open-dialog', {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Location for Worktree',
        defaultPath: parentFolder || repoParent,
      });
      if (!result.canceled && result.filePaths.length > 0) {
        setParentFolder(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error browsing folder:', error);
    }
  };

  const newBranchExists = branchMode === 'new' && !!newBranchName.trim() && branches.includes(newBranchName.trim());

  const isValid =
    !!parentFolder.trim() &&
    !!folderName.trim() &&
    (branchMode === 'existing' ? !!existingBranch : (!!newBranchName.trim() && !newBranchExists));

  const worktreePath = `${parentFolder.replace(/[\\/]+$/, '')}${sep}${folderName.trim()}`;

  const handleCreate = async () => {
    if (!isValid)
      return;
    onClose();
    await onCreate({
      worktreePath,
      ref: branchMode === 'new' ? newBranchName.trim() : existingBranch,
      newBranch: branchMode === 'new',
      startPoint: branchMode === 'new' ? startPoint : undefined,
      force,
    });
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Add Worktree</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Check out a branch into a separate working directory that shares this repository's history.
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="radio"
                name="worktree-branch-mode"
                checked={branchMode === 'existing'}
                onChange={() => setBranchMode('existing')}
              />
              <span>Use existing branch</span>
            </label>
            {branchMode === 'existing' && (
              <select
                className="dialog-input"
                value={existingBranch}
                onChange={(e) => setExistingBranch(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="radio"
                name="worktree-branch-mode"
                checked={branchMode === 'new'}
                onChange={() => setBranchMode('new')}
              />
              <span>Create new branch</span>
            </label>
            {branchMode === 'new' && (
              <>
                <input
                  type="text"
                  className={`dialog-input ${newBranchExists ? 'error' : ''}`}
                  placeholder="New branch name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
                {newBranchExists && (
                  <div className="branch-exists-warning">
                    Branch "{newBranchName.trim()}" already exists
                  </div>
                )}
                <label className="dialog-sublabel">Start point:</label>
                <select
                  className="dialog-input"
                  value={startPoint}
                  onChange={(e) => setStartPoint(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="dialog-field">
            <label htmlFor="worktree-parent">Location:</label>
            <div className="dialog-field-horizontal">
              <input
                id="worktree-parent"
                type="text"
                className="dialog-input"
                placeholder="Parent folder"
                value={parentFolder}
                onChange={(e) => setParentFolder(e.target.value)}
              />
              <button type="button" className="dialog-button dialog-button-browse" onClick={handleBrowse}>
                Browse...
              </button>
            </div>
          </div>

          <div className="dialog-field">
            <label htmlFor="worktree-folder">Folder name:</label>
            <input
              id="worktree-folder"
              type="text"
              className="dialog-input"
              placeholder="Worktree folder name"
              value={folderName}
              onChange={(e) => { setFolderName(e.target.value); setUserEditedFolder(true); }}
            />
            <div className="dialog-path-preview" title={worktreePath}>{worktreePath}</div>
          </div>

          <div className="dialog-field">
            <label className="dialog-checkbox-label">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="dialog-checkbox"
              />
              <span>Force (allow a branch already checked out, or a non-empty folder)</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button
            className={`dialog-button dialog-button-primary ${!isValid ? 'disabled' : ''}`}
            onClick={handleCreate}
            disabled={!isValid}
          >
            Add Worktree
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateWorktreeDialog;
