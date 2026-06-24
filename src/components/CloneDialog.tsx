import { useState, useEffect, useRef, useCallback } from 'react';
import { ipcRenderer } from 'electron';
import { listRemoteRepositories, resolveLoreBin, LoreRemoteRepo } from '../lore';
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

interface LocalServer {
  running: boolean;
  /** lore:// base URL of the local server. */
  url: string;
}

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

/** Last path segment of a (possibly path-like) Lore repo name, e.g. `team/game` → `game`. */
function lastSegment(repo: string): string {
  return repo.trim().replace(/\/+$/, '').split('/').pop() || '';
}

/**
 * Split a full Lore URL into its server base and repo path:
 * `lore://host:port/team/game` → { server: 'lore://host:port', repo: 'team/game' }.
 * A bare `lore://host:port` yields an empty repo.
 */
function splitLoreUrl(url: string): { server: string; repo: string } {
  const m = url.trim().match(/^(lore:\/\/[^/]+)(?:\/(.*))?$/i);
  if (m) return { server: m[1], repo: (m[2] || '').replace(/\/+$/, '') };
  return { server: url.trim().replace(/\/+$/, ''), repo: '' };
}

/** Unified clone dialog for Git and Lore. The type is picked with the radios (and auto-detected
 *  from a pasted lore:// URL); the shown settings change per type. In Lore mode the server URL and
 *  the on-server repository name are separate fields, with a picker for repos on the server. */
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

  // Lore: server base URL + the on-server repository name (separate fields).
  const [serverUrl, setServerUrl] = useState<string>('');
  const [remoteName, setRemoteName] = useState<string>('');
  const [localServer, setLocalServer] = useState<LocalServer | null>(null);
  const [serverRepos, setServerRepos] = useState<LoreRemoteRepo[] | null>(null);
  const [reposLoading, setReposLoading] = useState<boolean>(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const autoLoaded = useRef<boolean>(false);

  // The server to clone from: the typed URL, else the local server when one is running.
  const effectiveServer = (serverUrl.trim() || (localServer?.running ? localServer.url : '')).replace(/\/+$/, '');

  // Resolve the full lore:// URL to clone. The repo segment defaults to the local folder Name
  // when the Repository field is blank; a full lore:// URL pasted into it is used verbatim.
  const resolveLoreUrl = useCallback((): string => {
    const seg = remoteName.trim();
    if (/^lore:\/\//i.test(seg)) return seg.replace(/\/+$/, '');
    if (!effectiveServer || !seg) return '';
    return `${effectiveServer}/${seg}`;
  }, [remoteName, effectiveServer]);

  useEffect(() => {
    const saved = localStorage.getItem(PARENT_FOLDER_KEY);
    if (saved) setParentFolder(saved);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Detect a running local Lore server so we can offer it as the default server.
  useEffect(() => {
    ipcRenderer.invoke('lore-server-status')
      .then((s: { running?: boolean; url?: string }) => setLocalServer({ running: !!s?.running, url: s?.url || '' }))
      .catch(() => { /* leave null */ });
  }, []);

  // Auto-fill from clipboard on mount: a lore:// URL switches to Lore and splits into the
  // server + repo fields; a git/http URL fills the Git URL field.
  useEffect(() => {
    navigator.clipboard.readText().then(text => {
      const t = (text || '').trim();
      if (!t) return;
      if (/^lore:\/\//i.test(t)) {
        setType('lore');
        const { server, repo } = splitLoreUrl(t);
        setServerUrl(server);
        if (repo) setRemoteName(repo);
      } else if (t.startsWith('http') || t.startsWith('git@') || t.includes('://')) {
        setRepoUrl(t);
      }
    }).catch(() => { /* clipboard unavailable */ });
  }, []);

  useEffect(() => { if (parentFolder) localStorage.setItem(PARENT_FOLDER_KEY, parentFolder); }, [parentFolder]);

  // Derive the local folder Name from the source: the URL (git) or the repo name (lore).
  useEffect(() => { if (type === 'git' && repoUrl) setName(extractName(repoUrl)); }, [repoUrl, type]);
  useEffect(() => { if (type === 'lore' && remoteName) setName(lastSegment(remoteName)); }, [remoteName, type]);

  const loadRepos = useCallback(async () => {
    const server = (serverUrl.trim() || (localServer?.running ? localServer.url : '')).replace(/\/+$/, '');
    if (!server) { setReposError('Enter a server URL, or start a local server, to list repositories.'); return; }
    setReposLoading(true);
    setReposError(null);
    try {
      const repos = await listRemoteRepositories(resolveLoreBin(), server);
      repos.sort((a, b) => a.name.localeCompare(b.name));
      setServerRepos(repos);
    } catch (err) {
      setServerRepos(null);
      setReposError((err as Error).message || 'Failed to list repositories.');
    } finally {
      setReposLoading(false);
    }
  }, [serverUrl, localServer]);

  // Load the server's repo list once when Lore mode is active and a server is known (typically the
  // detected local server). After that it's manual via the refresh button, so typing in the server
  // field doesn't spawn a CLI call on every keystroke.
  useEffect(() => {
    if (type !== 'lore' || autoLoaded.current) return;
    const server = serverUrl.trim() || (localServer?.running ? localServer.url : '');
    if (server) { autoLoaded.current = true; loadRepos(); }
  }, [type, serverUrl, localServer, loadRepos]);

  const browseFolder = async () => {
    try {
      const result = await ipcRenderer.invoke('show-open-dialog', { properties: ['openDirectory'], title: 'Select Parent Folder' });
      if (!result.canceled && result.filePaths.length > 0) setParentFolder(result.filePaths[0]);
    } catch (error) { console.error('Error browsing folder:', error); }
  };

  const loreUrl = resolveLoreUrl();
  const isValid = parentFolder.trim() && name.trim()
    && (type === 'git' ? repoUrl.trim() : loreUrl)
    && (type !== 'lore' || scope !== 'paths' || includePaths.trim());

  // Reflect the dropdown selection only when it matches a known server repo (free text → blank).
  const selectValue = serverRepos?.some(r => r.name === remoteName) ? remoteName : '';

  // Type-to-filter: what's typed in the Repository field narrows the server-repo dropdown
  // (case-insensitive substring). An exact match still selects, so the list naturally collapses.
  const repoFilter = remoteName.trim().toLowerCase();
  const filteredRepos = serverRepos
    ? (repoFilter ? serverRepos.filter(r => r.name.toLowerCase().includes(repoFilter)) : serverRepos)
    : null;

  const handleClone = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onClone({
        type,
        repoUrl: type === 'git' ? repoUrl.trim() : loreUrl,
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
    <div className="dialog-overlay">
      <div className="dialog-content">
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

          {type === 'git' && (
            <div className="dialog-field">
              <label htmlFor="repo-url">Repository URL:</label>
              <input id="repo-url" type="text" className="dialog-input"
                placeholder="Git repository URL"
                value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
            </div>
          )}

          {type === 'lore' && (
            <>
              <div className="dialog-field">
                <label htmlFor="lore-server-url">Server URL:</label>
                <input id="lore-server-url" type="text" className="dialog-input"
                  placeholder={localServer?.running ? `${localServer.url} (local server)` : 'lore://server:port'}
                  value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              </div>

              <div className="dialog-field">
                <label htmlFor="lore-remote-name">Repository:</label>
                <input id="lore-remote-name" type="text" className="dialog-input"
                  placeholder="Repository name on the server"
                  value={remoteName} onChange={(e) => setRemoteName(e.target.value)} />
                <div className="dialog-field-horizontal" style={{ marginTop: 6 }}>
                  <select className="dialog-input" style={{ flex: 1 }} value={selectValue}
                    disabled={reposLoading || !filteredRepos || filteredRepos.length === 0}
                    onChange={(e) => { if (e.target.value) setRemoteName(e.target.value); }}>
                    <option value="">
                      {reposLoading ? 'Loading repositories…'
                        : !serverRepos ? 'Repositories not loaded'
                        : serverRepos.length === 0 ? 'No repositories on server'
                        : filteredRepos && filteredRepos.length === 0 ? 'No repositories match'
                        : repoFilter ? `Select a repository… (${filteredRepos!.length} of ${serverRepos.length})`
                        : `Select a repository… (${serverRepos.length})`}
                    </option>
                    {filteredRepos?.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                  <button type="button" className="dialog-button dialog-button-browse"
                    onClick={loadRepos} disabled={reposLoading} title="List repositories on the server">
                    {reposLoading ? '…' : '↻'}
                  </button>
                </div>
                {reposError && (
                  <small style={{ display: 'block', marginTop: 6, color: 'var(--danger-color)', fontSize: '0.8rem' }}>{reposError}</small>
                )}
              </div>
            </>
          )}

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
