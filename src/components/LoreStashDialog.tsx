import React, { useEffect, useState } from 'react';
import './Dialog.css';

interface LoreStashDialogProps {
  /** Number of files that will be stashed. */
  fileCount: number;
  /** True when stashing a selected subset rather than all changes. */
  selectedOnly: boolean;
  onClose: () => void;
  onCreate: (message: string, description: string, keep: boolean) => Promise<void>;
}

/** Create-a-stash dialog: short + long description, and keep-vs-remove working changes. */
function LoreStashDialog({ fileCount, selectedOnly, onClose, onCreate }: LoreStashDialogProps) {
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try { await onCreate(message.trim(), description.trim(), keep); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header"><h3>Stash changes</h3></div>
        <div className="dialog-body">
          <div className="dialog-message">
            Stash {fileCount} {selectedOnly ? 'selected ' : ''}file{fileCount === 1 ? '' : 's'}.
          </div>
          <div className="dialog-field">
            <label htmlFor="stash-msg">Description:</label>
            <input id="stash-msg" className="dialog-input" autoFocus placeholder="Short description (required)"
              value={message} onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
          <div className="dialog-field">
            <label htmlFor="stash-desc">Details (optional):</label>
            <textarea id="stash-desc" className="dialog-input" style={{ minHeight: 64, resize: 'vertical' }}
              placeholder="Longer notes about this stash" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="dialog-field" style={{ display: 'block' }}>
            <label className="dialog-checkbox-label">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <span>Keep changes in the working directory</span>
            </label>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={submit} disabled={!message.trim() || busy}>
            {busy ? 'Stashing…' : 'Stash'}
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default LoreStashDialog;
