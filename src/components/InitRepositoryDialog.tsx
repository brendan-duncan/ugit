import React, { useState, useEffect } from 'react';
import { RepoKind } from './CloneDialog';
import './Dialog.css';

export interface InitParams {
  type: RepoKind;
  /** Git */
  branchName: string;
  remoteName: string;
  remoteUrl: string;
  /** Lore */
  serverUrl: string;
  repoName: string;
}

interface InitRepositoryDialogProps {
  repoPath: string;
  onClose: () => void;
  onInit: (params: InitParams) => Promise<void>;
}

/** Unified "Initialize Repository" dialog for Git and Lore. Git inits a .git in the folder;
 *  Lore creates a server-side repository (lore://server/name) checked out into the folder. */
function InitRepositoryDialog({ repoPath, onClose, onInit }: InitRepositoryDialogProps) {
  const folderName = repoPath.split(/[\\/]/).filter(Boolean).pop() || 'repo';
  const [type, setType] = useState<RepoKind>('git');
  const [branchName, setBranchName] = useState<string>('main');
  const [remoteName, setRemoteName] = useState<string>('origin');
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('lore://127.0.0.1:41337/');
  const [repoName, setRepoName] = useState<string>(folderName);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isValid = type === 'git' ? true : (serverUrl.trim() && repoName.trim());

  const handleInit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onInit({
        type,
        branchName: branchName.trim() || 'main',
        remoteName: remoteName.trim() || 'origin',
        remoteUrl: remoteUrl.trim(),
        serverUrl: serverUrl.trim(),
        repoName: repoName.trim(),
      });
    } finally { setLoading(false); }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header"><h3>Initialize Repository</h3></div>

        <div className="dialog-body">
          <div className="dialog-field" style={{ display: 'block' }}>
            <label className="dialog-checkbox-label" style={{ marginRight: 16 }}>
              <input type="radio" name="init-type" checked={type === 'git'} onChange={() => setType('git')} />
              <span>Git</span>
            </label>
            <label className="dialog-checkbox-label">
              <input type="radio" name="init-type" checked={type === 'lore'} onChange={() => setType('lore')} />
              <span>Lore</span>
            </label>
          </div>

          <div className="dialog-message">
            {type === 'git' ? 'Initialize a new Git repository in:' : 'Create a new Lore repository checked out into:'}
            <br />{repoPath}
          </div>

          {type === 'git' ? (
            <>
              <div className="dialog-field">
                <label htmlFor="init-branch-name">Branch Name:</label>
                <input id="init-branch-name" type="text" className="dialog-input" placeholder="main"
                  value={branchName} onChange={(e) => setBranchName(e.target.value)} />
              </div>
              <div className="dialog-field">
                <label htmlFor="init-remote-name">Remote Name:</label>
                <input id="init-remote-name" type="text" className="dialog-input" placeholder="origin"
                  value={remoteName} onChange={(e) => setRemoteName(e.target.value)} />
              </div>
              <div className="dialog-field">
                <label htmlFor="init-remote-url">Remote URL:</label>
                <input id="init-remote-url" type="text" className="dialog-input"
                  placeholder="Optional - leave blank to skip adding a remote"
                  value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="dialog-field">
                <label htmlFor="init-server-url">Server URL:</label>
                <input id="init-server-url" type="text" className="dialog-input" placeholder="lore://host:port/"
                  value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              </div>
              <div className="dialog-field">
                <label htmlFor="init-repo-name">Repository Name:</label>
                <input id="init-repo-name" type="text" className="dialog-input" placeholder="repository name"
                  value={repoName} onChange={(e) => setRepoName(e.target.value)} />
                <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Creates <code>{serverUrl.replace(/\/+$/, '')}/{repoName || '<name>'}</code>
                </small>
              </div>
            </>
          )}
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleInit} disabled={!isValid || loading}>
            {loading ? (type === 'git' ? 'Initializing...' : 'Creating...') : (type === 'git' ? 'Initialize' : 'Create')}
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default InitRepositoryDialog;
