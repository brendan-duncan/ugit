import React from 'react';
import { RebaseStatus } from '../git/GitAdapter';
import './RebaseBanner.css';

interface RebaseBannerProps {
  status: RebaseStatus;
  // True while a git operation is running; disables the action buttons.
  busy: boolean;
  onContinue: () => void;
  onAbort: () => void;
  onSkip: () => void;
}

function RebaseBanner({ status, busy, onContinue, onAbort, onSkip }: RebaseBannerProps) {
  const conflictCount = status.conflictedFiles.length;
  const hasConflicts = conflictCount > 0;

  const ontoLabel = status.onto || 'the target branch';
  const branchLabel = status.branch || 'HEAD';

  const progress = status.totalSteps > 0
    ? `Step ${Math.min(status.currentStep, status.totalSteps)} of ${status.totalSteps}`
    : null;

  return (
    <div className={`rebase-banner ${hasConflicts ? 'rebase-banner-conflict' : 'rebase-banner-clean'}`}>
      <div className="rebase-banner-info">
        <div className="rebase-banner-title">
          <span className="rebase-banner-icon">⤵</span>
          <span>Rebase in progress</span>
          {progress && <span className="rebase-banner-progress">{progress}</span>}
        </div>
        <div className="rebase-banner-detail">
          Rebasing <strong>{branchLabel}</strong> onto <strong>{ontoLabel}</strong>
        </div>
        {status.currentCommitHash && (
          <div className="rebase-banner-detail rebase-banner-commit">
            Stopped at <code>{status.currentCommitHash}</code>
            {status.currentCommitSubject ? ` — ${status.currentCommitSubject}` : ''}
          </div>
        )}
        <div className="rebase-banner-status">
          {hasConflicts ? (
            <span className="rebase-banner-status-warning">
              ⚠ {conflictCount} file{conflictCount === 1 ? '' : 's'} with unresolved conflicts —
              resolve and stage them, then continue.
            </span>
          ) : (
            <span className="rebase-banner-status-ok">
              ✓ No unresolved conflicts. You can continue the rebase.
            </span>
          )}
        </div>
      </div>
      <div className="rebase-banner-actions">
        <button
          className="rebase-banner-button rebase-banner-button-primary"
          onClick={onContinue}
          disabled={busy || hasConflicts}
          title={hasConflicts
            ? 'Resolve and stage all conflicted files before continuing'
            : 'git rebase --continue'}
        >
          Continue
        </button>
        <button
          className="rebase-banner-button"
          onClick={onSkip}
          disabled={busy}
          title="Skip the current commit (git rebase --skip)"
        >
          Skip Commit
        </button>
        <button
          className="rebase-banner-button rebase-banner-button-danger"
          onClick={onAbort}
          disabled={busy}
          title="Abort the rebase and restore the branch (git rebase --abort)"
        >
          Abort
        </button>
      </div>
    </div>
  );
}

export default RebaseBanner;
