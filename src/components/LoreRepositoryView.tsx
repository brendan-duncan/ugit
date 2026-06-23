import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLore } from '../hooks/useLore';
import { useAlert } from '../contexts/AlertContext';
import { LoreFileChange } from '../lore';
import LoreDiffView from './LoreDiffView';

interface LoreRepositoryViewProps {
  repoPath: string;
  isActiveTab: boolean;
  onTabStatusChange?: (status: { ahead: number; behind: number } | null) => void;
  refreshSignal?: number;
}

const CODE_COLORS: Record<string, string> = {
  A: '#4caf50', // added
  M: '#2196f3', // modified
  D: '#f44336', // deleted
};

function changeColor(code: string): string {
  return CODE_COLORS[code[0]?.toUpperCase()] || '#aaa';
}

/**
 * Minimal Lore repository panel. Deliberately NOT a clone of RepositoryView — it presents
 * Lore's own model (numbered revisions, staged/unstaged split, sync-to-remote state). This is
 * the scaffold that the dedicated Lore UI grows from. See docs/lore-support-todo.md.
 */
function LoreRepositoryView({ repoPath, isActiveTab, onTabStatusChange, refreshSignal = 0 }: LoreRepositoryViewProps) {
  const { showAlert } = useAlert();
  const { client, status, history, branches, locks, links, layers, isLoading, error, commandState, refresh } = useLore({
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

  // Report ahead/behind to the tab indicator from the parsed sync state.
  const prevTabStatus = useRef<string>('');
  useEffect(() => {
    if (!onTabStatusChange) return;
    if (!status) { onTabStatusChange(null); return; }
    const ahead = Math.max(0, status.local.number - status.remote.number);
    const behind = Math.max(0, status.remote.number - status.local.number);
    const key = `${ahead}/${behind}`;
    if (key !== prevTabStatus.current) {
      prevTabStatus.current = key;
      onTabStatusChange(ahead || behind ? { ahead, behind } : null);
    }
  }, [status, onTabStatusChange]);

  // Reload when the parent bumps the refresh signal.
  const prevRefresh = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal !== prevRefresh.current) {
      prevRefresh.current = refreshSignal;
      refresh();
    }
  }, [refreshSignal, refresh]);

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
      // Renderer-ready unified diff (headers normalized to a/ b/ for diff2html).
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

  const doSwitchBranch = (name: string) => runAction(async () => { await client!.switchBranch(name); });
  const doCreateBranch = () => runAction(async () => {
    const name = newBranchName.trim();
    if (!name) throw new Error('Branch name is required');
    await client!.createBranch(name);
    await client!.switchBranch(name);
    setNewBranchName('');
    setShowNewBranch(false);
  });

  const stageAll = () => runAction(async () => {
    await client!.stage((status?.unstaged ?? []).map(f => f.path));
  });
  const stageOne = (file: LoreFileChange) => runAction(async () => { await client!.stage([file.path]); });
  const unstageOne = (file: LoreFileChange) => runAction(async () => { await client!.unstage([file.path]); });
  const doCommit = () => runAction(async () => {
    if (!commitMessage.trim()) throw new Error('Commit message is required');
    await client!.commit(commitMessage.trim());
    setCommitMessage('');
  });

  const renderFileRow = (file: LoreFileChange, staged: boolean) => (
    <div
      key={`${file.section}:${file.path}`}
      onClick={() => onSelectFile(file)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '2px 6px', cursor: 'pointer',
        background: selectedPath === file.path ? 'rgba(33,150,243,0.15)' : 'transparent',
        fontFamily: 'monospace', fontSize: 12,
      }}
    >
      <span style={{ color: changeColor(file.code), fontWeight: 'bold', width: 16 }}>{file.code}</span>
      {lockedPaths.has(file.path) && <span title="Locked" style={{ color: '#e0a030' }}>🔒</span>}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
      <button
        disabled={working}
        onClick={(e) => { e.stopPropagation(); lockedPaths.has(file.path) ? doUnlock(file.path) : doLock(file.path); }}
        style={{ fontSize: 11 }}
        title={lockedPaths.has(file.path) ? 'Release lock' : 'Lock for edit'}
      >
        {lockedPaths.has(file.path) ? 'Unlock' : 'Lock'}
      </button>
      <button
        disabled={working}
        onClick={(e) => { e.stopPropagation(); staged ? unstageOne(file) : stageOne(file); }}
        style={{ fontSize: 11 }}
      >
        {staged ? 'Unstage' : 'Stage'}
      </button>
    </div>
  );

  if (error) {
    return (
      <div style={{ padding: 16, color: '#f44336' }}>
        <h3>Lore error</h3>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #333', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Lore</strong>
        <label>
          branch{' '}
          <select
            value={status?.branch || ''}
            disabled={working || isLoading}
            onChange={(e) => { if (e.target.value && e.target.value !== status?.branch) doSwitchBranch(e.target.value); }}
          >
            {/* current branch may not be in the list yet on first paint */}
            {status?.branch && !branches?.local.some(b => b.name === status.branch) && (
              <option value={status.branch}>{status.branch}</option>
            )}
            {branches?.local.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </label>
        {showNewBranch ? (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <input
              autoFocus
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
              placeholder="new branch name"
              style={{ fontSize: 12 }}
            />
            <button onClick={doCreateBranch} disabled={working || !newBranchName.trim()}>Create</button>
            <button onClick={() => setShowNewBranch(false)}>Cancel</button>
          </span>
        ) : (
          <button onClick={() => setShowNewBranch(true)} disabled={working || isLoading} title="New branch">+ Branch</button>
        )}
        <span>revision <code>{status ? status.local.number : '…'}</code></span>
        <span style={{ color: '#888' }}>{status?.syncState ?? ''}</span>
        <span style={{ flex: 1 }} />
        {commandState.length > 0 && <span style={{ color: '#888', fontSize: 12 }}>running: {commandState[commandState.length - 1].command}</span>}
        <button onClick={doSync} disabled={isLoading || working}>Sync</button>
        <button onClick={doPush} disabled={isLoading || working}>Push</button>
        <button onClick={refresh} disabled={isLoading || working}>Refresh</button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: changes + commit */}
        <div style={{ width: '40%', minWidth: 260, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: '6px 0' }}>Changes not staged</h4>
              <button onClick={stageAll} disabled={working || !(status?.unstaged.length)}>Stage all</button>
            </div>
            {status?.unstaged.length ? status.unstaged.map(f => renderFileRow(f, false))
              : <div style={{ color: '#777', fontSize: 12, padding: 6 }}>none</div>}

            <h4 style={{ margin: '12px 0 6px' }}>Staged for commit</h4>
            {status?.staged.length ? status.staged.map(f => renderFileRow(f, true))
              : <div style={{ color: '#777', fontSize: 12, padding: 6 }}>none</div>}

            <h4 style={{ margin: '12px 0 6px' }}>Locks {locks.length ? `(${locks.length})` : ''}</h4>
            {locks.length ? locks.map(l => (
              <div key={l.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 6px', fontFamily: 'monospace', fontSize: 12 }}>
                <span title="Locked" style={{ color: '#e0a030' }}>🔒</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`by ${l.owner}`}>{l.path}</span>
                <span style={{ color: '#888', fontSize: 11 }}>{l.owner}</span>
                <button disabled={working} onClick={() => doUnlock(l.path)} style={{ fontSize: 11 }}>Release</button>
              </div>
            )) : <div style={{ color: '#777', fontSize: 12, padding: 6 }}>no locked files</div>}

            {(links.length > 0 || layers.length > 0) && (
              <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
                {links.length > 0 && <div>Links: {links.length}</div>}
                {layers.length > 0 && <div>Layers: {layers.length}</div>}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #333', padding: 6 }}>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button onClick={doCommit} disabled={working || !status?.staged.length || !commitMessage.trim()} style={{ marginTop: 4 }}>
              Commit {status?.staged.length ? `(${status.staged.length})` : ''}
            </button>
          </div>
        </div>

        {/* Right: diff + history */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            <h4 style={{ margin: '4px 0' }}>{selectedPath ? `Diff: ${selectedPath}` : 'Diff'}</h4>
            {!selectedPath ? (
              <div style={{ color: '#777', fontSize: 12, padding: 8 }}>Select a file to view its diff.</div>
            ) : diffLoading ? (
              <div style={{ color: '#777', fontSize: 12, padding: 8 }}>Loading diff…</div>
            ) : (
              <LoreDiffView diff={diffText} />
            )}
          </div>
          <div style={{ borderTop: '1px solid #333', maxHeight: '40%', overflow: 'auto', padding: 8 }}>
            <h4 style={{ margin: '4px 0' }}>History</h4>
            {history.length ? history.map(h => (
              <div key={h.number} style={{ fontFamily: 'monospace', fontSize: 12, padding: '1px 0' }}>
                <span style={{ color: '#888', marginRight: 8 }}>{h.number}</span>{h.message}
              </div>
            )) : <div style={{ color: '#777', fontSize: 12 }}>no revisions</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoreRepositoryView;
