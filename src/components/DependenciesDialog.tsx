import React, { useState, useEffect, useCallback } from 'react';
import { LoreClient } from '../lore';
import './Dialog.css';

interface DependenciesDialogProps {
  client: LoreClient;
  path: string;
  onClose: () => void;
  onError?: (message: string) => void;
}

/** View and edit a file's dependency graph: the files it depends on and the files that depend on it. */
function DependenciesDialog({ client, path, onClose, onError }: DependenciesDialogProps) {
  const [deps, setDeps] = useState<string[]>([]);
  const [dependents, setDependents] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [toAdd, setToAdd] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        client.dependencyList(path),
        client.dependencyList(path, { reverse: true }),
      ]);
      setDeps(d);
      setDependents(r);
    } catch (e) { onError?.(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [client, path, onError]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { onError?.(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const add = () => run(async () => {
    const targets = toAdd.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!targets.length) return;
    await client.dependencyAdd(path, targets);
    setToAdd('');
  });

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480 }}>
        <div className="dialog-header"><h3>Dependencies — {path}</h3></div>

        <div className="dialog-body">
          <div className="dialog-message">
            Lore tracks an explicit per-file dependency graph (used by dependency-based selective
            clone/sync). Edits here apply immediately.
          </div>

          <div className="dialog-field" style={{ display: 'block' }}>
            <label style={{ marginBottom: 4 }}>Depends on ({deps.length})</label>
            {loading ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
              : deps.length ? deps.map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>{d}</span>
                  <button className="dialog-button dialog-button-cancel" disabled={busy}
                    onClick={() => run(() => client.dependencyRemove(path, [d]))}>Remove</button>
                </div>
              )) : <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No dependencies.</div>}
            <div className="dialog-field-horizontal" style={{ marginTop: 6 }}>
              <input className="dialog-input" placeholder="add dependency path(s), space/comma separated"
                value={toAdd} onChange={(e) => setToAdd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
              <button className="dialog-button dialog-button-browse" disabled={busy || !toAdd.trim()} onClick={add}>Add</button>
            </div>
          </div>

          <div className="dialog-field" style={{ display: 'block' }}>
            <label style={{ marginBottom: 4 }}>Depended on by ({dependents.length})</label>
            {dependents.length ? dependents.map(d => (
              <div key={d} style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{d}</div>
            )) : <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nothing depends on this file.</div>}
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default DependenciesDialog;
