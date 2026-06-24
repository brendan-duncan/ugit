import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ipcRenderer, clipboard } from 'electron';
import { resolveLoreServerBin } from '../lore';
import { useSettings } from '../contexts/SettingsContext';
import './Dialog.css';

interface LocalServerDialogProps {
  onClose: () => void;
  onError?: (message: string) => void;
}

const SERVER_URL = 'lore://127.0.0.1:41337/';

/**
 * Start/stop a durable local Lore server (single-node, localhost dev). Pick a data folder where the
 * store lives; ugit launches `loreserver` against it and polls its health. Server work runs in the
 * main process (see the `lore-server-*` IPC handlers).
 */
function LocalServerDialog({ onClose, onError }: LocalServerDialogProps) {
  const { settings, updateSetting } = useSettings();
  const [dataFolder, setDataFolder] = useState<string>('');
  const [running, setRunning] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (settings) setDataFolder(settings.loreServerDataFolder || ''); }, [settings]);

  const poll = useCallback(async () => {
    try { const s = await ipcRenderer.invoke('lore-server-status'); setRunning(!!s.running); }
    catch { setRunning(false); }
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const browse = async () => {
    try {
      const r = await ipcRenderer.invoke('show-open-dialog', { properties: ['openDirectory', 'createDirectory'], title: 'Lore server data folder' });
      if (!r.canceled && r.filePaths.length > 0) { setDataFolder(r.filePaths[0]); await updateSetting('loreServerDataFolder', r.filePaths[0]); }
    } catch (e) { console.error('browse failed', e); }
  };

  const start = async () => {
    if (!dataFolder.trim()) { onError?.('Choose a data folder first.'); return; }
    setBusy(true);
    try {
      await updateSetting('loreServerDataFolder', dataFolder.trim());
      const res = await ipcRenderer.invoke('lore-server-start', dataFolder.trim(), resolveLoreServerBin());
      if (!res.ok) onError?.(res.message || 'Failed to start the server.');
      await poll();
    } catch (e) { onError?.(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const res = await ipcRenderer.invoke('lore-server-stop', dataFolder.trim());
      if (!res.ok) onError?.(res.message || 'Failed to stop the server.');
      await poll();
    } catch (e) { onError?.(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ minWidth: 520 }}>
        <div className="dialog-header"><h3>Local Lore Server</h3></div>

        <div className="dialog-body">
          <div className="dialog-message">
            Run a single-node Lore server on this machine for local development. It listens on
            <code> 127.0.0.1:41337</code> (and 41339 for health), with an ephemeral self-signed cert
            and auth disabled. Your data is kept under the data folder's <code>store/</code>.
          </div>

          <div className="dialog-field" style={{ display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: running ? 'var(--success-color, #3c3)' : 'var(--text-secondary, #888)',
                boxShadow: running ? '0 0 6px var(--success-color, #3c3)' : 'none',
              }} />
              <strong>{running == null ? 'Checking…' : running ? 'Running' : 'Not running'}</strong>
              {running && (
                <>
                  <code style={{ marginLeft: 8 }}>{SERVER_URL}</code>
                  <button className="dialog-button dialog-button-browse" onClick={() => clipboard.writeText(SERVER_URL)}>Copy URL</button>
                </>
              )}
            </div>
          </div>

          <div className="dialog-field">
            <label htmlFor="ls-folder">Data folder:</label>
            <div className="dialog-field-horizontal">
              <input id="ls-folder" type="text" className="dialog-input" placeholder="Where the server stores data (store/logs/config)"
                value={dataFolder} onChange={(e) => setDataFolder(e.target.value)} />
              <button type="button" className="dialog-button dialog-button-browse" onClick={browse}>Browse…</button>
            </div>
          </div>

          <div className="dialog-field" style={{ display: 'flex', gap: 8 }}>
            <button className="dialog-button dialog-button-primary" disabled={busy || running === true || !dataFolder.trim()} onClick={start}>
              {busy ? 'Working…' : 'Start'}
            </button>
            <button className="dialog-button dialog-button-cancel" disabled={busy || running === false} onClick={stop}>
              Stop
            </button>
          </div>
          <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            ugit finds <code>loreserver</code> via the <strong>Lore Server Path</strong> in Settings, then
            <code> LORE_SERVER_BIN</code>, <code>~/bin</code>, and <code>PATH</code>. Install it from
            Settings → Lore if it's missing.
          </small>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default LocalServerDialog;
