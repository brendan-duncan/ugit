import React from 'react';
import { BisectStatus } from '../git/GitAdapter';
import './BisectBanner.css';

interface BisectBannerProps {
  status: BisectStatus;
  // True while a git command is running; disables the buttons.
  busy: boolean;
  onMark: (mark: 'good' | 'bad' | 'skip') => void;
  onReset: () => void;
}

/**
 * A bisect in progress. git checks out a commit halfway through the range and
 * waits to be told whether the thing being looked for is there, so the banner's
 * job is to say which commit is checked out and take that answer.
 */
function BisectBanner({ status, busy, onMark, onReset }: BisectBannerProps) {
  const marked = (status.badRef ? 1 : 0) + status.goodRefs.length;

  return (
    <div className={`bisect-banner ${status.finished ? 'bisect-banner-done' : ''}`}>
      <div className="bisect-banner-info">
        <div className="bisect-banner-title">
          <span className="bisect-banner-icon">🔍</span>
          <span>{status.finished ? 'Bisect finished' : 'Bisect in progress'}</span>
          {status.progress && !status.finished && (
            <span className="bisect-banner-progress">{status.progress}</span>
          )}
        </div>

        {status.finished && status.firstBadHash ? (
          <div className="bisect-banner-detail">
            First bad commit: <code>{status.firstBadHash.slice(0, 8)}</code>
            {status.currentSubject ? ` — ${status.currentSubject}` : ''}
          </div>
        ) : (
          <div className="bisect-banner-detail">
            Testing <code>{(status.currentHash || '').slice(0, 8)}</code>
            {status.currentSubject ? ` — ${status.currentSubject}` : ''}
          </div>
        )}

        <div className="bisect-banner-detail bisect-banner-marks">
          {marked === 0
            ? 'Mark this commit good or bad to start narrowing down.'
            : `${status.badRef ? '1 bad' : 'no bad'}, ${status.goodRefs.length} good marked so far.`}
          {status.startRef && ` Reset returns to ${status.startRef}.`}
        </div>
      </div>

      <div className="bisect-banner-actions">
        {!status.finished && (
          <>
            <button
              className="bisect-banner-button bisect-banner-button-good"
              onClick={() => onMark('good')}
              disabled={busy}
              title="This commit doesn't have the problem (git bisect good)"
            >
              Good
            </button>
            <button
              className="bisect-banner-button bisect-banner-button-bad"
              onClick={() => onMark('bad')}
              disabled={busy}
              title="This commit has the problem (git bisect bad)"
            >
              Bad
            </button>
            <button
              className="bisect-banner-button"
              onClick={() => onMark('skip')}
              disabled={busy}
              title="This commit can't be tested (git bisect skip)"
            >
              Skip
            </button>
          </>
        )}
        <button
          className="bisect-banner-button"
          onClick={onReset}
          disabled={busy}
          title="End the bisect and go back to where it started (git bisect reset)"
        >
          {status.finished ? 'Done' : 'Reset'}
        </button>
      </div>
    </div>
  );
}

export default BisectBanner;
