import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import './Dialog.css';

const PARENT_FOLDER_KEY = 'ugit-clone-parent-folder';

export type RepoKind = 'git' | 'lore';

export interface CloneParams {
  type: RepoKind;
  repoUrl: string;
  parentFolder: string;
  name: string;
  /** Git: shallow depth (0 = full). */
  depth: number;
  /** Lore: gitignore-style sparse view filter (empty = full checkout). */
  viewContent: string;
  /** Lore: bare clone. */
  bare: boolean;
  /** Lore: clone against the default shared store (--use-shared-store). */
  useSharedStore: boolean;
}

interface CloneDialogProps {
  onClose: () => void;
  onClone: (params: CloneParams) => Promise<void>;
}

type LoreScope = 'all' | 'paths' | 'bare';

/**
 * Turn a newline-separated list of include paths into a Lore view filter (`.lore/view`):
 * exclude everything, then re-include each path. A bare folder (no glob) becomes `path/**`,
 * a trailing slash becomes `.../**`, and explicit globs are kept as-is.
 */
function buildLoreView(includePaths: string): string {
  const lines = includePaths.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  const includes = lines.map(raw => {
    let p = raw.replace(/^!+/, '').replace(/^\/+/, '');
    if (p.endsWith('/')) p = p + '**';
    else if (!p.includes('*')) p = p + '/**';
    return '!' + p;
  });
  return ['**', ...includes].join('\n');
}

/** Extract a default local folder name from a clone URL (handles git .git and lore:// URLs). */
function extractName(url: string): string {
  let s = url.trim().replace(/\/+$/, '');
  if (s.endsWith('.git')) s = s.slice(0, -4);
  const last = s.split('/').pop() || '';
  if (url.startsWith('git@')) {
    const colon = last.indexOf(':');
    if (colon !== -1) return last.substring(colon + 1);
  }
  return last;
}

/** Unified clone dialog for Git and Lore. The type is detected from the URL (lore://) and can
 *  be overridden; the shown settings change per type. */
function CloneDialog({ onClose, onClone }: CloneDialogProps) {
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [parentFolder, setParentFolder] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<RepoKind>('git');
  const [shallow, setShallow] = useState<boolean>(false);
  const [depth, setDepth] = useState<number>(1);
  const [scope, setScope] = useState<LoreScope>('all');
  const [includePaths, setIncludePaths] = useState<string>('');
  const [useSharedStore, setUseSharedStore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem(PARENT_FOLDER_KEY);
    if (saved) setParentFolder(saved);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Auto-fill URL from clipboard on mount.
  useEffect(() => {
    navigator.clipboard.readText().then(text => {
      if (text && (text.startsWith('http') || text.startsWith('git@') || text.startsWith('lore://') || text.includes('://'))) {
        setRepoUrl(text);
      }
    }).catch(() => { /* clipboard unavailable */ });
  }, []);

  useEffect(() => { if (parentFolder) localStorage.setItem(PARENT_FOLDER_KEY, parentFolder); }, [parentFolder]);

  // Detect a Lore URL; switch type and derive the name. (A git URL leaves a manual Lore choice.)
  useEffect(() => {
    if (repoUrl.trim().startsWith('lore://')) setType('lore');
    if (repoUrl) setName(extractName(repoUrl));
  }, [repoUrl]);

  const browseFolder = async () => {
    try {
      const result = await ipcRenderer.invoke('show-open-dialog', { properties: ['openDirectory'], title: 'Select Parent Folder' });
      if (!result.canceled && result.filePaths.length > 0) setParentFolder(result.filePaths[0]);
    } catch (error) { console.error('Error browsing folder:', error); }
  };

  const isValid = repoUrl.trim() && parentFolder.trim() && name.trim()
    && (type !== 'lore' || scope !== 'paths' || includePaths.trim());

  const handleClone = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onClone({
        type,
        repoUrl: repoUrl.trim(),
        parentFolder: parentFolder.trim(),
        name: name.trim(),
        depth: type === 'git' && shallow && depth > 0 ? Math.floor(depth) : 0,
        viewContent: type === 'lore' && scope === 'paths' ? buildLoreView(includePaths) : '',
        bare: type === 'lore' && scope === 'bare',
        useSharedStore: type === 'lore' && useSharedStore,
      });
    } finally { setLoading(false); }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header"><h3>Clone</h3></div>

        <div className="dialog-body">
          <div className="dialog-field" style={{ display: 'block' }}>
            <label className="dialog-checkbox-label" style={{ marginRight: 16 }}>
              <input type="radio" name="clone-type" checked={type === 'git'} onChange={() => setType('git')} />
              <span>Git</span>
            </label>
            <label className="dialog-checkbox-label">
              <input type="radio" name="clone-type" checked={type === 'lore'} onChange={() => setType('lore')} />
              <span>Lore</span>
            </label>
          </div>

          <div className="dialog-field">
            <label htmlFor="repo-url">Repository URL:</label>
            <input id="repo-url" type="text" className="dialog-input"
              placeholder={type === 'lore' ? 'lore://server:port/repo-name' : 'Git repository URL'}
              value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
          </div>

          <div className="dialog-field">
            <label htmlFor="parent-folder">Parent Folder:</label>
            <div className="dialog-field-horizontal">
              <input id="parent-folder" type="text" className="dialog-input" placeholder="Select parent folder"
                value={parentFolder} onChange={(e) => setParentFolder(e.target.value)} />
              <button type="button" className="dialog-button dialog-button-browse" onClick={browseFolder}>Browse...</button>
            </div>
          </div>

          <div className="dialog-field">
            <label htmlFor="repo-name">Name:</label>
            <input id="repo-name" type="text" className="dialog-input"
              placeholder={type === 'lore' ? 'Local folder name (defaults to the repo name)' : 'Repository name'}
              value={name} onChange={(e) => setName(e.target.value)} />
            <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Clones into <code>{(parentFolder || '<parent>').replace(/[\\/]+$/, '')}/{name || '<name>'}</code>
            </small>
          </div>

          {type === 'git' && (
            <div className="dialog-field" style={{ display: 'block' }}>
              <label className="dialog-checkbox-label">
                <input type="checkbox" checked={shallow} onChange={(e) => setShallow(e.target.checked)} />
                <span>Shallow clone</span>
              </label>
              {shallow && (
                <div className="dialog-field-horizontal" style={{ marginTop: 8 }}>
                  <label htmlFor="clone-depth" style={{ marginBottom: 0 }}>Depth:</label>
                  <input id="clone-depth" type="number" min="1" max="100000" className="dialog-input"
                    value={depth} onChange={(e) => setDepth(parseInt(e.target.value) || 1)} />
                </div>
              )}
              <small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Fetch only the most recent commits (--depth). Leave unchecked for a full clone.
              </small>
            </div>
          )}

          {type === 'lore' && (
            <div className="dialog-field" style={{ display: 'block' }}>
              <label style={{ marginBottom: 6 }}>What to check out:</label>
              <label className="dialog-checkbox-label" style={{ display: 'block', marginBottom: 4 }}>
                <input type="radio" name="lore-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
                <span>Everything (full clone)</span>
              </label>
              <label className="dialog-checkbox-label" style={{ display: 'block', marginBottom: 4 }}>
                <input type="radio" name="lore-scope" checked={scope === 'paths'} onChange={() => setScope('paths')} />
                <span>Only these paths (sparse)</span>
              </label>
              {scope === 'paths' && (
                <div style={{ margin: '4px 0 8px 22px' }}>
                  <textarea id="lore-include" className="dialog-input"
                    style={{ minHeight: 56, resize: 'vertical', fontFamily: 'monospace' }}
                    placeholder={'Content/Characters\nSource/\nContent/*.material'}
                    value={includePaths} onChange={(e) => setIncludePaths(e.target.value)} />
                  <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    One path per line — a folder pulls in everything under it; globs (<code>*.material</code>) are kept as-is.
                    {includePaths.trim() && <> Becomes: <code>{buildLoreView(includePaths).replace(/\n/g, ' ')}</code></>}
                  </small>
                </div>
              )}
              <label className="dialog-checkbox-label" style={{ display: 'block' }}>
                <input type="radio" name="lore-scope" checked={scope === 'bare'} onChange={() => setScope('bare')} />
                <span>Metadata only (bare)</span>
              </label>
              {scope === 'bare' && (
                <small style={{ display: 'block', marginTop: 4, marginLeft: 22, color: 'var(--text-warning, #c08000)', fontSize: '0.8rem' }}>
                  ⚠ Fetches the revision tree but no files — the Files view will show every file as <code>D</code> (deleted)
                  until you set a view and sync. For inspection/tooling, not editing.
                </small>
              )}

              <label className="dialog-checkbox-label" style={{ display: 'block', marginTop: 12 }}>
                <input type="checkbox" checked={useSharedStore} onChange={(e) => setUseSharedStore(e.target.checked)} />
                <span>Use shared store</span>
              </label>
              <small style={{ display: 'block', marginTop: 4, marginLeft: 22, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Draw content from a machine-wide shared store instead of duplicating it in this clone.
                Requires a default store — create one via <strong>File → Lore Shared Stores…</strong>
              </small>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleClone} disabled={!isValid || loading}>
            {loading ? 'Cloning...' : 'Clone'}
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default CloneDialog;
