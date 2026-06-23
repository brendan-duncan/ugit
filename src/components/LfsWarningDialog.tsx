import React, { useEffect } from 'react';
import { formatBytes } from '../utils/lfs';
import './Dialog.css';

export interface LargeFile {
  path: string;
  size: number;
  suggestedPattern: string;
}

interface LfsWarningDialogProps {
  files: Array<LargeFile>;
  thresholdMB: number;
  onClose: () => void;
  onTrackAndCommit: () => void | Promise<void>;
  onCommitAnyway: () => void | Promise<void>;
}

function LfsWarningDialog({ files, thresholdMB, onClose, onTrackAndCommit, onCommitAnyway }: LfsWarningDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Distinct patterns that would be added if the user chooses to track.
  const patterns = Array.from(new Set(files.map(f => f.suggestedPattern)));

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>⚠️ Large Files Not Tracked by Git LFS</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-info">
            <p>
              {files.length === 1 ? 'This staged file is' : `These ${files.length} staged files are`}{' '}
              at least {thresholdMB} MB and not tracked by Git LFS. Committing large binaries
              directly bloats the repository for everyone.
            </p>
          </div>

          <ul className="lfs-warning-file-list">
            {files.map(f => (
              <li key={f.path} className="lfs-warning-file">
                <span className="lfs-warning-file-path">{f.path}</span>
                <span className="lfs-warning-file-size">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>

          <p className="lfs-warning-patterns">
            <strong>Track &amp; Commit</strong> will run <code>git lfs track</code> for:{' '}
            {patterns.map(p => <code key={p} className="lfs-warning-pattern">{p}</code>)}
            , re-stage the affected files and <code>.gitattributes</code>, then commit.
          </p>
        </div>

        <div className="dialog-footer">
          <button
            className="dialog-button dialog-button-primary"
            onClick={() => onTrackAndCommit()}
          >
            Track &amp; Commit
          </button>
          <button
            className="dialog-button dialog-button-secondary"
            onClick={() => onCommitAnyway()}
          >
            Commit Anyway
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

export default LfsWarningDialog;
