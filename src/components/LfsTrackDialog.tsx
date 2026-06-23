import React, { useEffect, useState } from 'react';
import './Dialog.css';

interface LfsTrackDialogProps {
  /** Optional pattern suggestions shown as quick-fill chips. */
  suggestions?: Array<string>;
  initialValue?: string;
  onClose: () => void;
  onTrack: (pattern: string) => void | Promise<void>;
}

function LfsTrackDialog({ suggestions = [], initialValue = '', onClose, onTrack }: LfsTrackDialogProps) {
  const [pattern, setPattern] = useState<string>(initialValue);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape')
        onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = () => {
    const trimmed = pattern.trim();
    if (trimmed)
      onTrack(trimmed);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Track Pattern with Git LFS</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-info">
            <p>Enter a file pattern to store with Git LFS (e.g. <code>*.psd</code>, <code>*.bin</code>, <code>assets/*.mp4</code>).</p>
          </div>
          <input
            type="text"
            className="dialog-input"
            value={pattern}
            autoFocus
            placeholder="*.psd"
            onChange={(e) => setPattern(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {suggestions.length > 0 && (
            <div className="lfs-track-suggestions">
              <span className="lfs-track-suggestions-label">Suggestions:</span>
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`lfs-track-suggestion ${pattern.trim() === s ? 'selected' : ''}`}
                  onClick={() => setPattern(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button
            className="dialog-button dialog-button-primary"
            onClick={submit}
            disabled={!pattern.trim()}
          >
            Track
          </button>
          <button
            className="dialog-button dialog-button-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default LfsTrackDialog;
