import React, { useEffect, useState } from 'react';
import { GitAdapter, ReflogEntry } from '../git/GitAdapter';
import './Dialog.css';
import './ReflogDialog.css';

interface ReflogDialogProps {
  gitAdapter: GitAdapter;
  // Refs offered in the picker: HEAD plus the local branches.
  branches: string[];
  currentBranch: string;
  onClose: () => void;
  // Actions are run by the caller, which owns refreshing the repository after them.
  onAction: (action: 'reset-hard' | 'branch-here' | 'checkout', entry: ReflogEntry) => void | Promise<void>;
}

/**
 * The reflog: everywhere a ref has pointed recently. Its reason to exist is
 * getting back to a commit nothing references any more - after a reset, a bad
 * rebase, or a branch deletion - so each entry offers the ways back.
 */
function ReflogDialog({ gitAdapter, branches, currentBranch, onClose, onAction }: ReflogDialogProps): React.ReactElement {
  const [ref, setRef] = useState<string>('HEAD');
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReflogEntry | null>(null);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);

    gitAdapter.getReflog(ref, 500)
      .then(result => {
        if (cancelled)
          return;
        setEntries(result);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled)
          return;
        setError(err?.message || String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [gitAdapter, ref]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? entries.filter(entry =>
        entry.subject.toLowerCase().includes(needle) ||
        entry.message.toLowerCase().includes(needle) ||
        entry.action.toLowerCase().includes(needle) ||
        entry.hash.startsWith(needle))
    : entries;

  const refs = ['HEAD', ...branches.filter(branch => branch !== 'HEAD')];

  return (
    <div className="dialog-overlay">
      <div className="dialog-content reflog-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header reflog-header">
          <h3>Reflog</h3>
          <div className="reflog-header-controls">
            <select
              className="dialog-select reflog-ref-select"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            >
              {refs.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <input
              className="dialog-input reflog-filter"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="dialog-body reflog-body">
          <div className="reflog-note">
            Where <strong>{ref}</strong> has pointed, newest first. Anything listed here can be
            reached again, even when no branch or tag points at it any more.
          </div>

          {loading && <div className="reflog-status">Loading...</div>}
          {error && <div className="reflog-status reflog-error">{error}</div>}
          {!loading && !error && shown.length === 0 && (
            <div className="reflog-status">
              {entries.length === 0 ? `No reflog for ${ref}.` : 'Nothing matches the filter.'}
            </div>
          )}

          {!loading && shown.length > 0 && (
            <div className="reflog-list">
              {shown.map(entry => (
                <div
                  key={entry.selector}
                  className={`reflog-entry ${selected && selected.selector === entry.selector ? 'selected' : ''}`}
                  onClick={() => setSelected(entry)}
                  onDoubleClick={() => onAction('checkout', entry)}
                >
                  <span className="reflog-selector">{entry.selector}</span>
                  <span className="reflog-action">{entry.action}</span>
                  <span className="reflog-subject">{entry.subject || entry.message}</span>
                  <span className="reflog-hash">{entry.hash.slice(0, 8)}</span>
                  <span className="reflog-date">{entry.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-footer reflog-footer">
          <span className="reflog-selection">
            {selected
              ? `${selected.selector} - ${selected.hash.slice(0, 8)}${selected.message ? ` (${selected.message})` : ''}`
              : 'Select an entry to act on it.'}
          </span>
          <button
            className="dialog-button button-secondary"
            disabled={!selected}
            onClick={() => selected && onAction('checkout', selected)}
            title="Check the commit out without moving any branch"
          >
            Checkout
          </button>
          <button
            className="dialog-button button-secondary"
            disabled={!selected}
            onClick={() => selected && onAction('branch-here', selected)}
            title="Create a branch at this commit - the safe way to rescue lost work"
          >
            Create Branch...
          </button>
          <button
            className="dialog-button button-secondary"
            disabled={!selected}
            onClick={() => selected && onAction('reset-hard', selected)}
            title={`Move ${currentBranch} to this commit and discard anything after it`}
          >
            Reset {currentBranch} Here
          </button>
          <button className="dialog-button button-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default ReflogDialog;
