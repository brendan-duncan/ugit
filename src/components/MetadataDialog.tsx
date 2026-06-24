import React, { useState, useEffect } from 'react';
import { LoreMetadataEntry } from '../lore';
import './Dialog.css';

interface MetadataDialogProps {
  title: string;
  subtitle?: string;
  /** Editable user pairs (system/intrinsic keys should be filtered out by the caller). */
  entries: LoreMetadataEntry[];
  /** Intrinsic keys shown read-only for context (e.g. branch name, creator). */
  readOnlyEntries?: LoreMetadataEntry[];
  /** When true the dialog is view-only (no editing, just a Close button). */
  readOnly?: boolean;
  onClose: () => void;
  onSave?: (pairs: [string, string][]) => Promise<void>;
}

/** Generic key/value metadata editor, reused for branch and revision metadata. */
function MetadataDialog({ title, subtitle, entries, readOnlyEntries = [], readOnly = false, onClose, onSave }: MetadataDialogProps) {
  const [rows, setRows] = useState<LoreMetadataEntry[]>(entries.length ? entries : [{ key: '', value: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setRow = (i: number, patch: Partial<LoreMetadataEntry>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => [...rs, { key: '', value: '' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, j) => j !== i));

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const pairs = rows
        .map(r => [r.key.trim(), r.value.trim()] as [string, string])
        .filter(([k]) => k.length > 0);
      await onSave(pairs);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480 }}>
        <div className="dialog-header"><h3>{title}</h3></div>

        <div className="dialog-body">
          {subtitle && <div className="dialog-message">{subtitle}</div>}

          {readOnlyEntries.length > 0 && (
            <div className="dialog-field" style={{ display: 'block' }}>
              <label style={{ marginBottom: 4 }}>Read-only</label>
              {readOnlyEntries.map(e => (
                <div key={e.key} style={{ display: 'flex', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ minWidth: 110, fontFamily: 'monospace' }}>{e.key}</span>
                  <span style={{ wordBreak: 'break-all' }}>{e.value || '—'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="dialog-field" style={{ display: 'block' }}>
            <label style={{ marginBottom: 4 }}>{readOnly ? 'Metadata' : 'Editable metadata'}</label>
            {rows.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No metadata.</div>}
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input className="dialog-input" style={{ flex: '0 0 38%', fontFamily: 'monospace' }} placeholder="key"
                  value={r.key} disabled={readOnly} onChange={(e) => setRow(i, { key: e.target.value })} />
                <input className="dialog-input" style={{ flex: 1 }} placeholder="value"
                  value={r.value} disabled={readOnly} onChange={(e) => setRow(i, { value: e.target.value })} />
                {!readOnly && (
                  <button type="button" className="dialog-button dialog-button-cancel" style={{ flex: '0 0 auto' }}
                    title="Remove" onClick={() => removeRow(i)}>✕</button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button type="button" className="dialog-button dialog-button-browse" onClick={addRow}>+ Add pair</button>
            )}
          </div>
        </div>

        <div className="dialog-footer">
          {!readOnly && (
            <button className="dialog-button dialog-button-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  );
}

export default MetadataDialog;
