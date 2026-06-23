import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLore } from '../hooks/useLore';
import { useAlert } from '../contexts/AlertContext';
import { LoreFileChange } from '../lore';
import LoreDiffView from './LoreDiffView';
import './LoreRepositoryView.css';
import './Toolbar.css';

interface LoreRepositoryViewProps {
  repoPath: string;
  isActiveTab: boolean;
  onTabStatusChange?: (status: { ahead: number; behind: number } | null) => void;
  refreshSignal?: number;
}

const CODE_COLORS: Record<string, string> = {
  A: 'var(--success-color)',
  M: 'var(--accent-color)',
  D: 'var(--danger-color)',
};

function changeColor(code: string): string {
  return CODE_COLORS[code[0]?.toUpperCase()] || 'var(--text-secondary)';
}

/**
 * Lore repository panel. Presents Lore's own model (numbered revisions, staged/unstaged split,
 * sync-to-remote state, branches, file locks) but reuses the git RepositoryView chrome
 * (toolbar, resizable sidebar, content viewer) so Lore tabs feel consistent with git tabs.
 */
function LoreRepositoryView({ repoPath, isActiveTab, onTabStatusChange, refreshSignal = 0 }: LoreRepositoryViewProps) {
  const { showAlert } = useAlert();
  const { client, status, history, branches, locks, links, layers, view, isLoading, error, commandState, refresh } = useLore({
    repoPath,
    onError: (err) => showAlert(err.message, 'Lore error'),
  });

  const lockedPaths = new Set(locks.map(l => l.path));

  const [commitMessage, setCommitMessage] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [editingView, setEditingView] = useState(false);
  const [viewDraft, setViewDraft] = useState('');
  const [leftWidth, setLeftWidth] = useState<number>(28);
  const draggingSplitter = useRef(false);

  const busy = isLoading || working;
  const ahead = status ? Math.max(0, status.local.number - status.remote.number) : 0;
  const behind = status ? Math.max(0, status.remote.number - status.local.number) : 0;

  // Report ahead/behind to the tab indicator from the parsed sync state.
  const prevTabStatus = useRef<string>('');
  useEffect(() => {
    if (!onTabStatusChange) return;
    if (!status) { onTabStatusChange(null); return; }
    const key = `${ahead}/${behind}`;
    if (key !== prevTabStatus.current) {
      prevTabStatus.current = key;
      onTabStatusChange(ahead || behind ? { ahead, behind } : null);
    }
  }, [status, ahead, behind, onTabStatusChange]);

  // Reload when the parent bumps the refresh signal.
  const prevRefresh = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal !== prevRefresh.current) {
      prevRefresh.current = refreshSignal;
      refresh();
    }
  }, [refreshSignal, refresh]);

  // Sidebar splitter drag.
  const onSplitterDown = () => { draggingSplitter.current = true; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingSplitter.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftWidth(Math.min(60, Math.max(15, pct)));
  };
  const onMouseUp = () => { draggingSplitter.current = false; };

  const runAction = useCallback(async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore error');
    } finally {
      setWorking(false);
    }
  }, [refresh, showAlert]);

  const onSelectFile = useCallback(async (file: LoreFileChange) => {
    setSelectedPath(file.path);
    setDiffText('');
    setDiffLoading(true);
    try {
      setDiffText(await client!.diffText([file.path]));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore diff error');
    } finally {
      setDiffLoading(false);
    }
  }, [client, showAlert]);

  const doSync = () => runAction(async () => {
    const r = await client!.sync();
    showAlert(
      r.upToDate
        ? `Already up to date (revision ${r.toRevision?.number ?? '?'}).`
        : r.toRevision
          ? `Synced ${r.branch ?? ''} to revision ${r.toRevision.number}.`.trim()
          : (r.raw.trim() || 'Sync complete.'),
      'Lore sync',
    );
  });

  const doPush = () => runAction(async () => {
    const r = await client!.push();
    if (r.pushed.length) {
      const lines = r.pushed.map(p => `revision ${p.number} -> branch ${p.branch}`).join('\n');
      const summary = r.bytes ? `Pushed ${r.pushed.length} revision(s) (${r.bytes}):\n${lines}` : `Pushed:\n${lines}`;
      showAlert(summary, 'Lore push');
    } else {
      showAlert(r.raw.trim() || 'Nothing to push.', 'Lore push');
    }
  });

  const doLock = (path: string) => runAction(async () => { await client!.lockAcquire([path]); });
  const doUnlock = (path: string) => runAction(async () => { await client!.lockRelease([path]); });

  const doSwitchBranch = (name: string) => { if (name !== status?.branch) runAction(async () => { await client!.switchBranch(name); }); };
  const doMerge = (branch: string) => runAction(async () => {
    const r = await client!.mergeStart(branch);
    showAlert(
      r.committed
        ? `Merged ${branch} (clean, auto-committed).`
        : `Merge of ${branch} stopped with ${r.conflicted.length} conflict(s): ${r.conflicted.join(', ')}.\nResolve them, then Commit to finish.`,
      'Lore merge',
    );
  });
  const doResolve = (path: string, side: 'mine' | 'theirs') => runAction(async () => { await client!.mergeResolve([path], side); });
  const doMergeAbort = () => runAction(async () => { await client!.mergeAbort(); });
  const doCreateBranch = () => runAction(async () => {
    const name = newBranchName.trim();
    if (!name) throw new Error('Branch name is required');
    await client!.createBranch(name);
    await client!.switchBranch(name);
    setNewBranchName('');
    setShowNewBranch(false);
  });

  const startEditView = () => { setViewDraft(view ?? '**\n!path/**\n'); setEditingView(true); };
  const doSaveView = () => runAction(async () => {
    await client!.writeView(viewDraft);
    setEditingView(false);
  });

  const stageAll = () => runAction(async () => { await client!.stage((status?.unstaged ?? []).map(f => f.path)); });
  const stageOne = (file: LoreFileChange) => runAction(async () => { await client!.stage([file.path]); });
  const unstageOne = (file: LoreFileChange) => runAction(async () => { await client!.unstage([file.path]); });
  const doCommit = () => runAction(async () => {
    const msg = commitMessage.trim()
      || (status?.merge?.inProgress ? `Merge ${status.merge.incoming?.slice(0, 8) ?? ''}`.trim() : '');
    if (!msg) throw new Error('Commit message is required');
    await client!.commit(msg);
    setCommitMessage('');
  });

  const renderFileRow = (file: LoreFileChange, staged: boolean) => (
    <div
      key={`${file.section}:${file.path}`}
      className={`lore-row ${selectedPath === file.path ? 'selected' : ''}`}
      onClick={() => onSelectFile(file)}
    >
      <span className="lore-code" style={{ color: changeColor(file.code) }}>{file.code}</span>
      {lockedPaths.has(file.path) && <span title="Locked" style={{ color: 'var(--warning-color)' }}>🔒</span>}
      <span className="lore-row-name" title={file.path}>{file.path}</span>
      <span className="lore-row-actions">
        <button
          className="lore-mini-btn"
          disabled={working}
          onClick={(e) => { e.stopPropagation(); lockedPaths.has(file.path) ? doUnlock(file.path) : doLock(file.path); }}
          title={lockedPaths.has(file.path) ? 'Release lock' : 'Lock for edit'}
        >
          {lockedPaths.has(file.path) ? 'Unlock' : 'Lock'}
        </button>
        <button
          className="lore-mini-btn"
          disabled={working}
          onClick={(e) => { e.stopPropagation(); staged ? unstageOne(file) : stageOne(file); }}
        >
          {staged ? 'Unstage' : 'Stage'}
        </button>
      </span>
    </div>
  );

  if (error && !status) {
    return (
      <div className="repository-view">
        <div className="loading" style={{ color: 'var(--danger-color)' }}>
          <h3>Lore error</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          <button className="lore-mini-btn" onClick={refresh}>Retry</button>
        </div>
      </div>
    );
  }

  const lastCommand = commandState.length > 0 ? commandState[commandState.length - 1].command : '';

  return (
    <div className="repository-view">
      {/* Toolbar (reuses git toolbar styling) */}
      <div className="toolbar">
        <button className="toolbar-button" onClick={refresh} disabled={busy}>
          <span className={`toolbar-button-icon ${busy ? 'spinning' : ''}`}>↻</span>
          <span className="toolbar-button-label">Refresh</span>
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-button" onClick={doSync} disabled={busy}>
          <span className="toolbar-button-icon">⤓</span>
          <span className="toolbar-button-label">{behind > 0 ? `Sync (${behind})` : 'Sync'}</span>
        </button>
        <button className="toolbar-button" onClick={doPush} disabled={busy}>
          <span className="toolbar-button-icon">⬆</span>
          <span className="toolbar-button-label">{ahead > 0 ? `Push (${ahead})` : 'Push'}</span>
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-button" onClick={() => setShowNewBranch(true)} disabled={busy}>
          <span className="toolbar-button-icon">🌿</span>
          <span className="toolbar-button-label">Branch</span>
        </button>
        <div className="toolbar-separator" />
        {commandState.length > 0 &&
          <div className="toolbar-status"><span className="toolbar-busy-spinner" title={lastCommand}>↻</span></div>}
      </div>

      <div className="repo-content-horizontal" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        {isLoading && !status && <div className="loading">Loading Lore repository...</div>}

        {status && (
          <>
            {/* Sidebar: repo info + branches + locks */}
            <div className="repo-sidebar" style={{ width: `${leftWidth}%` }}>
              <div className="lore-info-card">
                <div className="lore-info-row">
                  <span className="lore-info-label">Lore branch</span>
                  <span className="lore-info-value">{status.branch}</span>
                </div>
                <div className="lore-info-row">
                  <span className="lore-info-label">revision</span>
                  <span className="lore-info-value">{status.local.number}</span>
                </div>
                <div className="lore-info-row">
                  <span className="lore-info-label">remote</span>
                  <span className={`lore-badge ${status.syncState}`}>{status.syncState}</span>
                </div>
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Branches</span>
                  <button className="lore-mini-btn" disabled={busy} onClick={() => setShowNewBranch(true)}>+ New</button>
                </div>
                {showNewBranch && (
                  <div className="lore-row always-actions">
                    <input
                      autoFocus
                      className="lore-new-branch-input lore-row-name"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') doCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
                      placeholder="new branch name"
                    />
                    <span className="lore-row-actions">
                      <button className="lore-mini-btn" disabled={busy || !newBranchName.trim()} onClick={doCreateBranch}>Create</button>
                      <button className="lore-mini-btn" onClick={() => setShowNewBranch(false)}>Cancel</button>
                    </span>
                  </div>
                )}
                {(branches?.local ?? []).map(b => (
                  <div
                    key={b.name}
                    className={`lore-row ${b.name === status.branch ? 'current' : ''}`}
                    onClick={() => doSwitchBranch(b.name)}
                    title={b.name === status.branch ? 'Current branch' : 'Switch to this branch'}
                  >
                    <span className="lore-row-name">{b.name}</span>
                    {b.name !== status.branch && !status.merge?.inProgress && (
                      <span className="lore-row-actions">
                        <button
                          className="lore-mini-btn"
                          disabled={busy}
                          onClick={(e) => { e.stopPropagation(); doMerge(b.name); }}
                          title={`Merge ${b.name} into ${status.branch}`}
                        >
                          Merge
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {!branches?.local.length && <div className="lore-empty">no branches</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header"><span>Locks {locks.length ? `(${locks.length})` : ''}</span></div>
                {locks.length ? locks.map(l => (
                  <div key={l.path} className="lore-row always-actions">
                    <span title="Locked" style={{ color: 'var(--warning-color)' }}>🔒</span>
                    <span className="lore-row-name" title={`by ${l.owner}`}>{l.path}</span>
                    <span className="lore-lock-owner">{l.owner}</span>
                    <span className="lore-row-actions">
                      <button className="lore-mini-btn" disabled={busy} onClick={() => doUnlock(l.path)}>Release</button>
                    </span>
                  </div>
                )) : <div className="lore-empty">no locked files</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Sparse view</span>
                  {!editingView && <button className="lore-mini-btn" disabled={busy} onClick={startEditView}>Edit</button>}
                </div>
                {editingView ? (
                  <div style={{ padding: '4px 10px 8px' }}>
                    <textarea
                      className="lore-commit-input"
                      style={{ minHeight: 72, fontFamily: 'monospace' }}
                      value={viewDraft}
                      onChange={(e) => setViewDraft(e.target.value)}
                      placeholder={'**\n!src/**'}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0' }}>
                      gitignore-style: <code>**</code> excludes all, <code>!path/**</code> re-includes.
                      Applies to clone &amp; future syncs (not a live re-checkout).
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="lore-mini-btn" disabled={busy} onClick={doSaveView}>Save</button>
                      <button className="lore-mini-btn" onClick={() => setEditingView(false)}>Cancel</button>
                    </div>
                  </div>
                ) : view ? (
                  <pre style={{ margin: 0, padding: '4px 10px 8px', fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{view.trim()}</pre>
                ) : (
                  <div className="lore-empty">Full checkout (no view filter)</div>
                )}
              </div>

              {(links.length > 0 || layers.length > 0) && (
                <div className="lore-sidebar-section">
                  <div className="lore-section-header"><span>Composition</span></div>
                  {links.length > 0 && <div className="lore-empty">Links: {links.length}</div>}
                  {layers.length > 0 && <div className="lore-empty">Layers: {layers.length}</div>}
                </div>
              )}
            </div>

            <div className="horizontal-splitter-handle" onMouseDown={onSplitterDown}>
              <div className="horizontal-splitter-line" />
            </div>

            {/* Content: changes + commit | diff + history */}
            <div className="repo-content-viewer" style={{ width: `${100 - leftWidth}%`, display: 'flex', flexDirection: 'column' }}>
              {status.merge?.inProgress && (
                <div className="lore-merge-banner">
                  <span>Merging — incoming <code>{status.merge.incoming?.slice(0, 8)}</code></span>
                  <span>{status.conflicted.length > 0
                    ? `${status.conflicted.length} conflict(s) to resolve`
                    : 'conflicts resolved — Commit to finish'}</span>
                  <span style={{ flex: 1 }} />
                  <button className="lore-mini-btn" disabled={busy} onClick={doMergeAbort}>Abort merge</button>
                </div>
              )}
              <div className="lore-content-cols" style={{ flex: 1, minHeight: 0 }}>
                <div className="lore-changes-col">
                  <div className="lore-changes-scroll">
                    {status.conflicted.length > 0 && (
                      <>
                        <div className="lore-changes-group-header conflict"><span>Conflicts ({status.conflicted.length})</span></div>
                        {status.conflicted.map(f => (
                          <div
                            key={`conflict:${f.path}`}
                            className={`lore-row ${selectedPath === f.path ? 'selected' : ''}`}
                            onClick={() => onSelectFile(f)}
                          >
                            <span className="lore-code" style={{ color: 'var(--danger-color)' }}>!</span>
                            <span className="lore-row-name" title={f.path}>{f.path}</span>
                            <span className="lore-row-actions">
                              <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); doResolve(f.path, 'mine'); }} title="Resolve using my changes">Use mine</button>
                              <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); doResolve(f.path, 'theirs'); }} title="Resolve using their changes">Use theirs</button>
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="lore-changes-group-header">
                      <span>Changes not staged</span>
                      <button className="lore-mini-btn" onClick={stageAll} disabled={busy || !status.unstaged.length}>Stage all</button>
                    </div>
                    {status.unstaged.length ? status.unstaged.map(f => renderFileRow(f, false)) : <div className="lore-empty">none</div>}

                    <div className="lore-changes-group-header"><span>Staged for commit</span></div>
                    {status.staged.length ? status.staged.map(f => renderFileRow(f, true)) : <div className="lore-empty">none</div>}
                  </div>
                  <div className="lore-commit-box">
                    <textarea
                      className="lore-commit-input"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message"
                    />
                    <button
                      className="lore-primary-btn"
                      onClick={doCommit}
                      disabled={busy || !status.staged.length || (!commitMessage.trim() && !status.merge?.inProgress)}
                    >
                      {status.merge?.inProgress ? 'Complete merge' : 'Commit'} {status.staged.length ? `(${status.staged.length})` : ''}
                    </button>
                  </div>
                </div>

                <div className="lore-detail-col">
                  <div className="lore-detail-header">{selectedPath ? `Diff: ${selectedPath}` : 'Diff'}</div>
                  <div className="lore-diff-area">
                    {!selectedPath ? (
                      <div className="lore-empty">Select a file to view its diff.</div>
                    ) : diffLoading ? (
                      <div className="lore-empty">Loading diff…</div>
                    ) : (
                      <LoreDiffView diff={diffText} />
                    )}
                  </div>
                  <div className="lore-history-area">
                    <div className="lore-detail-header">History</div>
                    {history.length ? history.map(h => (
                      <div key={h.number} className="lore-history-row">
                        <span className="lore-history-num">{h.number}</span>{h.message}
                      </div>
                    )) : <div className="lore-empty">no revisions</div>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LoreRepositoryView;
