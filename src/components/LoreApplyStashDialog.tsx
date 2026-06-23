import React, { useEffect, useState } from 'react';
import { LoreStash } from '../lore';
import './Dialog.css';

interface LoreApplyStashDialogProps {
  stash: LoreStash;
  onClose: () => void;
  onApply: (pop: boolean) => Promise<void>;
}

/** Apply-a-stash dialog: restore the stash, optionally deleting it afterward (pop). */
function LoreApplyStashDialog({ stash, onClose, onApply }: LoreApplyStashDialogProps) {
  const [pop, setPop] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    try { await onApply(pop); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header"><h3>Apply stash</h3></div>
        <div className="dialog-body">
          <div className="dialog-message">
            Restore <strong>{stash.message}</strong> ({stash.files.length} file{stash.files.length === 1 ? '' : 's'})
            into the working tree.
          </div>
          {stash.description && (
            <div className="dialog-field" style={{ display: 'block' }}>
              <small style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{stash.description}</small>
            </div>
          )}
          <div className="dialog-field" style={{ display: 'block' }}>
            <label className="dialog-checkbox-label">
              <input type="checkbox" checked={pop} onChange={(e) => setPop(e.target.checked)} />
              <span>Delete the stash after applying (pop)</span>
            </label>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={submit} disabled={busy}>
            {busy ? 'Applying…' : (pop ? 'Pop' : 'Apply')}
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default LoreApplyStashDialog;
