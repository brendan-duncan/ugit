import React from 'react';
import './CloneProgressView.css';

interface CloneProgressViewProps {
  repoName: string;
  repoUrl: string;
  progress?: { stage: string; progress: number } | null;
  error?: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const CloneProgressView: React.FC<CloneProgressViewProps> = ({
  repoName,
  repoUrl,
  progress,
  error,
  onRetry,
  onClose,
}) => {
  if (error) {
    return (
      <div className="clone-progress">
        <div className="clone-progress-card">
          <div className="clone-progress-error-icon">⚠</div>
          <div className="clone-progress-title">Clone failed</div>
          <div className="clone-progress-url" title={repoUrl}>{repoUrl}</div>
          <div className="clone-progress-error-message">{error}</div>
          <div className="clone-progress-actions">
            <button className="dialog-button dialog-button-primary" onClick={onRetry}>
              Retry
            </button>
            <button className="dialog-button dialog-button-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pct = progress ? Math.max(0, Math.min(100, Math.round(progress.progress))) : 0;
  const stageLabel = progress?.stage
    ? progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1)
    : 'Starting clone…';

  return (
    <div className="clone-progress">
      <div className="clone-progress-card">
        <div className="clone-progress-spinner">⟳</div>
        <div className="clone-progress-title">Cloning {repoName}</div>
        <div className="clone-progress-url" title={repoUrl}>{repoUrl}</div>
        <div className="clone-progress-bar">
          <div className="clone-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="clone-progress-stage">
          {stageLabel}{progress ? ` — ${pct}%` : ''}
        </div>
        <div className="clone-progress-hint">
          You can switch to other tabs while this clone finishes.
        </div>
      </div>
    </div>
  );
};

export default CloneProgressView;
