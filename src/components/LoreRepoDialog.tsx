import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import {
  createLoreRepository,
  loreLogin,
  resolveLoreBin,
  isLoreAuthError,
} from '../lore';
import './Dialog.css';

const PARENT_FOLDER_KEY = 'ugit-lore-parent-folder';
const SERVER_KEY = 'ugit-lore-server';

type Mode = 'create' | 'clone';

interface LoreRepoDialogProps {
  onClose: () => void;
  /** Called with the local repo path once create succeeds, so the parent can open it. */
  onCreated: (repoPath: string) => void;
  /** Start a CLONE in the background (parent owns the tab + progress). */
  onStartClone: (url: string, parentFolder: string, repoName: string, viewContent: string, bare: boolean) => void;
  onError: (message: string) => void;
}

/** Derive a repo name from a lore:// URL's last path segment. */
function nameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\/+$/, '');
  const last = cleaned.split('/').pop() || '';
  return last;
}

/**
 * Create or clone a Lore repository. Lore is server-addressed (lore://host:port/name), so this
 * is intentionally NOT the git folder-picker / git CloneDialog — it collects a server URL plus
 * a local destination, and exposes Lore-native clone options (sparse --view, --bare).
 */
function LoreRepoDialog({ onClose, onCreated, onStartClone, onError }: LoreRepoDialogProps) {
  const [mode, setMode] = useState<Mode>('create');
  const [serverUrl, setServerUrl] = useState<string>('lore://127.0.0.1:41337/');
  const [parentFolder, setParentFolder] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [viewContent, setViewContent] = useState<string>('');
  const [bare, setBare] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [authHint, setAuthHint] = useState<boolean>(false);

  useEffect(() => {
    const savedFolder = localStorage.getItem(PARENT_FOLDER_KEY);
    if (savedFolder) setParentFolder(savedFolder);
    const savedServer = localStorage.getItem(SERVER_KEY);
    if (savedServer) setServerUrl(savedServer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // For clone, auto-fill the name from the URL's last segment (user can override).
  useEffect(() => {
    if (mode === 'clone') {
      const derived = nameFromUrl(serverUrl);
      if (derived) setName(derived);
    }
  }, [serverUrl, mode]);

  const browseFolder = async () => {
    try {
      const result = await ipcRenderer.invoke('show-open-dialog', {
        properties: ['openDirectory'],
        title: 'Select Parent Folder',
      });
      if (!result.canceled && result.filePaths.length > 0) setParentFolder(result.filePaths[0]);
    } catch (error) {
      console.error('Error browsing folder:', error);
    }
  };


  const isValid = serverUrl.trim() && parentFolder.trim() && name.trim();

  const fullServerUrl = () => {
    const base = serverUrl.trim().replace(/\/+$/, '');
    const repoName = name.trim();
    return base.endsWith('/' + repoName) ? base : `${base}/${repoName}`;
  };

  const submit = async () => {
    if (!isValid) return;
    setLoading(true);
    setAuthHint(false);
    setProgress([]);
    try {
      const bin = resolveLoreBin();
      const folder = parentFolder.trim();
      const repoName = name.trim();
      localStorage.setItem(PARENT_FOLDER_KEY, folder);
      localStorage.setItem(SERVER_KEY, serverUrl.trim());
      const fullUrl = fullServerUrl();

      if (mode === 'create') {
        const target = `${folder.replace(/[\\/]+$/, '')}/${repoName}`;
        await createLoreRepository(bin, target, fullUrl);
        onCreated(target);
        onClose();
      } else {
        // Clone runs in the background — the parent owns the tab and its progress view.
        onStartClone(fullUrl, folder, repoName, viewContent, bare);
        onClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isLoreAuthError(message)) setAuthHint(true);
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  const doLogin = async () => {
    setLoading(true);
    setProgress([]);
    try {
      const base = serverUrl.trim().replace(/\/+$/, '');
      await loreLogin(resolveLoreBin(), base, {}, (line) => setProgress(prev => [...prev.slice(-200), line]));
      setAuthHint(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Lore Repository</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field" style={{ display: 'block' }}>
            <label className="dialog-checkbox-label" style={{ marginRight: 16 }}>
              <input type="radio" name="lore-mode" checked={mode === 'create'} onChange={() => setMode('create')} />
              <span>Create new</span>
            </label>
            <label className="dialog-checkbox-label">
              <input type="radio" name="lore-mode" checked={mode === 'clone'} onChange={() => setMode('clone')} />
              <span>Clone existing</span>
            </label>
          </div>

          <div className="dialog-message">
            {mode === 'create'
              ? 'Create a new Lore repository on the server and check it out locally.'
              : 'Clone an existing Lore repository from the server.'}
          </div>

          <div className="dialog-field">
            <label htmlFor="lore-server">Server URL:</label>
            <input
              id="lore-server"
              type="text"
              className="dialog-input"
              placeholder="lore://host:port/"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="lore-name">Name:</label>
            <input
              id="lore-name"
              type="text"
              className="dialog-input"
              placeholder="Repository name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="lore-parent">Parent Folder:</label>
            <div className="dialog-field-horizontal">
              <input
                id="lore-parent"
                type="text"
                className="dialog-input"
                placeholder="Select parent folder"
                value={parentFolder}
                onChange={(e) => setParentFolder(e.target.value)}
              />
              <button type="button" className="dialog-button dialog-button-browse" onClick={browseFolder}>
                Browse...
              </button>
            </div>
            <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Checks out to <code>{(parentFolder || '<parent>').replace(/[\\/]+$/, '')}/{name || '<name>'}</code>
            </small>
          </div>

          {mode === 'clone' && (
            <>
              <div className="dialog-field">
                <label htmlFor="lore-view">Sparse view filter (optional):</label>
                <textarea
                  id="lore-view"
                  className="dialog-input"
                  style={{ minHeight: 64, resize: 'vertical', fontFamily: 'monospace' }}
                  placeholder={'**\n!src/**'}
                  value={viewContent}
                  onChange={(e) => setViewContent(e.target.value)}
                />
                <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  gitignore-style: <code>**</code> excludes all, <code>!path/**</code> re-includes.
                  Limits which paths are checked out. Leave blank for a full checkout.
                </small>
              </div>
              <div className="dialog-field" style={{ display: 'block' }}>
                <label className="dialog-checkbox-label">
                  <input type="checkbox" checked={bare} onChange={(e) => setBare(e.target.checked)} />
                  <span>Bare (fetch latest revision tree, no files)</span>
                </label>
              </div>
            </>
          )}
          {progress.length > 0 && (
            <div className="dialog-field" style={{ display: 'block' }}>
              <label>Progress:</label>
              <pre style={{
                maxHeight: 140, overflow: 'auto', fontSize: 11, margin: 0, padding: 8,
                background: 'rgba(0,0,0,0.25)', whiteSpace: 'pre-wrap',
              }}>
                {progress.slice(-50).join('\n')}
              </pre>
            </div>
          )}

          {authHint && (
            <div className="dialog-field" style={{ display: 'block', color: '#e0a030' }}>
              <small>
                This looks like an authentication error. Try <strong>Login</strong> to authenticate
                with the server, then retry. (The local dev server has auth disabled.)
              </small>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={submit} disabled={!isValid || loading}>
            {loading ? (mode === 'create' ? 'Creating...' : 'Cloning...') : (mode === 'create' ? 'Create' : 'Clone')}
          </button>
          <button
            className="dialog-button"
            onClick={doLogin}
            disabled={loading || !serverUrl.trim()}
            title="Authenticate the CLI with the server (lore login)"
          >
            Login
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoreRepoDialog;
