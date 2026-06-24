import React, { useState, useEffect, useCallback } from 'react';
import { ipcRenderer } from 'electron';
import { resolveLoreBin, sharedStoreCreate, sharedStoreInfo, sharedStoreSetUseAutomatically, LoreSharedStoreInfo } from '../lore';
import './Dialog.css';

interface SharedStoreDialogProps {
  onClose: () => void;
  onError?: (message: string) => void;
}

/**
 * Manage Lore shared stores: one on-disk content store can back many worktrees on a machine so
 * each clone doesn't duplicate `.lore/` content. Lists configured stores (`shared-store info`),
 * toggles automatic use, and creates a store for a server (`shared-store create`).
 */
function SharedStoreDialog({ onClose, onError }: SharedStoreDialogProps) {
  const bin = resolveLoreBin();
  const [info, setInfo] = useState<LoreSharedStoreInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string>('lore://127.0.0.1:41337');
  const [storePath, setStorePath] = useState<string>('');
  const [makeDefault, setMakeDefault] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setInfo(await sharedStoreInfo(bin)); }
    catch (e) { onError?.(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [bin, onError]);

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

  const browse = async () => {
    try {
      const r = await ipcRenderer.invoke('show-open-dialog', { properties: ['openDirectory', 'createDirectory'], title: 'Shared store location' });
      if (!r.canceled && r.filePaths.length > 0) setStorePath(r.filePaths[0]);
    } catch (e) { console.error('browse failed', e); }
  };

  const create = () => run(async () => {
    if (!serverUrl.trim()) throw new Error('Server URL is required');
    await sharedStoreCreate(bin, serverUrl.trim(), { path: storePath.trim() || undefined, makeDefault });
    setStorePath('');
  });

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ minWidth: 520 }}>
        <div className="dialog-header"><h3>Lore Shared Stores</h3></div>

        <div className="dialog-body">
          <div className="dialog-message">
            A shared store keeps one on-disk copy of repository content that many worktrees on this
            machine share — so multiple clones don't each duplicate their <code>.lore/</code> data.
            Lore deduplicates fragments, so even similar files share what they have in common.
          </div>

          <div className="dialog-field" style={{ display: 'block' }}>
            <label className="dialog-checkbox-label">
              <input type="checkbox" disabled={busy || loading || !info}
                checked={!!info?.useAutomatically}
                onChange={(e) => run(() => sharedStoreSetUseAutomatically(bin, e.target.checked))} />
              <span>Use the shared store automatically for new clones</span>
            </label>
            <small style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              When on, clones use the default store without needing the “Use shared store” option.
            </small>
          </div>

          <div className="dialog-field" style={{ display: 'block' }}>
            <label style={{ marginBottom: 6 }}>Configured stores</label>
            {loading ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
            ) : info && info.stores.length ? (
              info.stores.map((s, i) => (
                <div key={`${s.remoteUrl}:${i}`} style={{ padding: '6px 8px', border: '1px solid var(--border-color, #333)', borderRadius: 4, marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{s.remoteUrl}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{s.path}</div>
                  <div style={{ fontSize: '0.8rem', color: s.exists ? 'var(--success-color, #3c3)' : 'var(--danger-color, #c33)' }}>
                    {s.exists ? '✓ on disk' : '✗ missing on disk'}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No shared stores configured yet.</div>
            )}
          </div>

          <div className="dialog-field" style={{ display: 'block' }}>
            <label style={{ marginBottom: 6 }}>Create a store</label>
            <div className="dialog-field">
              <label htmlFor="ss-server">Server URL:</label>
              <input id="ss-server" type="text" className="dialog-input" placeholder="lore://host:port"
                value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
            </div>
            <div className="dialog-field">
              <label htmlFor="ss-path">Location (optional):</label>
              <div className="dialog-field-horizontal">
                <input id="ss-path" type="text" className="dialog-input" placeholder="Default location if blank"
                  value={storePath} onChange={(e) => setStorePath(e.target.value)} />
                <button type="button" className="dialog-button dialog-button-browse" onClick={browse}>Browse…</button>
              </div>
            </div>
            <label className="dialog-checkbox-label">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              <span>Make this the default store for the server</span>
            </label>
            <div style={{ marginTop: 8 }}>
              <button className="dialog-button dialog-button-primary" disabled={busy || !serverUrl.trim()} onClick={create}>
                {busy ? 'Working…' : 'Create store'}
              </button>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default SharedStoreDialog;
