import React, { useMemo, useState } from 'react';
import { Commit, RebaseAction, RebaseTodoEntry } from '../git/GitAdapter';
import './Dialog.css';
import './InteractiveRebaseDialog.css';

const ACTIONS: { value: RebaseAction; label: string; hint: string }[] = [
  { value: 'pick', label: 'Pick', hint: 'Keep this commit as it is' },
  { value: 'reword', label: 'Reword', hint: 'Keep the changes, use a new message' },
  { value: 'edit', label: 'Edit', hint: 'Stop here so the commit can be changed' },
  { value: 'squash', label: 'Squash', hint: 'Fold into the commit above, with a combined message' },
  { value: 'fixup', label: 'Fixup', hint: 'Fold into the commit above, keeping its message' },
  { value: 'drop', label: 'Drop', hint: 'Remove this commit' }
];

/** A commit plus what the user chose to do with it. */
interface RebaseRow {
  commit: Commit;
  action: RebaseAction;
  // The new message for 'reword', or the combined message for 'squash'.
  message: string;
}

interface InteractiveRebaseDialogProps {
  // Commits to replay, oldest first - the order git's todo list uses.
  commits: Commit[];
  // Short description of what the commits are being replayed onto, for the header.
  ontoLabel: string;
  onClose: () => void;
  onRebase: (entries: RebaseTodoEntry[]) => void | Promise<void>;
}

function defaultMessage(commit: Commit): string {
  return commit.body ? `${commit.message}\n\n${commit.body}` : commit.message;
}

function InteractiveRebaseDialog({ commits, ontoLabel, onClose, onRebase }: InteractiveRebaseDialogProps): React.ReactElement {
  const [rows, setRows] = useState<RebaseRow[]>(
    () => commits.map(commit => ({ commit, action: 'pick', message: defaultMessage(commit) }))
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const setRow = (index: number, changes: Partial<RebaseRow>) => {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to)
      return;
    setRows(prev => {
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  };

  // A squash or fixup folds into whatever is kept above it, so the first kept
  // commit can't be one - there would be nothing to fold into.
  const problem = useMemo(() => {
    const kept = rows.filter(row => row.action !== 'drop');
    if (kept.length === 0)
      return 'Every commit is set to drop, which would leave nothing to rebase.';
    if (kept[0].action === 'squash' || kept[0].action === 'fixup')
      return `The first commit can't be ${kept[0].action === 'squash' ? 'squashed' : 'fixed up'} - there is no commit before it to fold it into.`;
    if (rows.some(row => row.action === 'reword' && !row.message.trim()))
      return 'A reworded commit needs a message.';
    return null;
  }, [rows]);

  const summary = useMemo(() => {
    const counts = new Map<RebaseAction, number>();
    for (const row of rows)
      counts.set(row.action, (counts.get(row.action) || 0) + 1);
    return ACTIONS
      .filter(action => counts.has(action.value))
      .map(action => `${counts.get(action.value)} ${action.value}`)
      .join(', ');
  }, [rows]);

  const handleStart = async () => {
    if (problem || isRunning)
      return;

    setIsRunning(true);
    try {
      await onRebase(rows.map(row => ({
        action: row.action,
        hash: row.commit.hash,
        subject: row.commit.message,
        // Only the actions that set a message need one; the rest ignore it.
        ...(row.action === 'reword' || row.action === 'squash' ? { message: row.message } : {})
      })));
      onClose();
    } catch (error) {
      // The caller reports the failure; keep the dialog open so the list isn't lost.
      setIsRunning(false);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content interactive-rebase-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Interactive Rebase onto {ontoLabel}</h3>
        </div>

        <div className="dialog-body interactive-rebase-body">
          <div className="interactive-rebase-note">
            {rows.length} {rows.length === 1 ? 'commit' : 'commits'}, replayed top to bottom -
            oldest first. Drag a row, or use the arrows, to reorder.
          </div>

          <div className="interactive-rebase-list">
            {rows.map((row, index) => (
              <div
                key={row.commit.hash}
                className={`interactive-rebase-row action-${row.action} ${dragIndex === index ? 'dragging' : ''}`}
                draggable={!isRunning}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null)
                    move(dragIndex, index);
                  setDragIndex(null);
                }}
              >
                <div className="interactive-rebase-row-main">
                  <span className="interactive-rebase-grip" title="Drag to reorder">⋮⋮</span>
                  <select
                    className="dialog-select interactive-rebase-action"
                    value={row.action}
                    disabled={isRunning}
                    onChange={(e) => setRow(index, { action: e.target.value as RebaseAction })}
                  >
                    {ACTIONS.map(action => (
                      <option key={action.value} value={action.value} title={action.hint}>
                        {action.label}
                      </option>
                    ))}
                  </select>
                  <span className="interactive-rebase-hash">{row.commit.hash.slice(0, 8)}</span>
                  <span className="interactive-rebase-subject">{row.commit.message}</span>
                  <span className="interactive-rebase-author">{row.commit.author_name}</span>
                  <span className="interactive-rebase-arrows">
                    <button
                      className="interactive-rebase-arrow"
                      title="Move earlier"
                      disabled={index === 0 || isRunning}
                      onClick={() => move(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      className="interactive-rebase-arrow"
                      title="Move later"
                      disabled={index === rows.length - 1 || isRunning}
                      onClick={() => move(index, index + 1)}
                    >
                      ↓
                    </button>
                  </span>
                </div>

                {(row.action === 'reword' || row.action === 'squash') && (
                  <div className="interactive-rebase-row-message">
                    <label>{row.action === 'reword' ? 'New message' : 'Message for the combined commit'}</label>
                    <textarea
                      className="dialog-input interactive-rebase-message"
                      value={row.message}
                      disabled={isRunning}
                      rows={2}
                      onChange={(e) => setRow(index, { message: e.target.value })}
                    />
                  </div>
                )}

                {row.action === 'edit' && (
                  <div className="interactive-rebase-row-message interactive-rebase-row-hint">
                    The rebase will stop after this commit is applied, so you can change
                    it and then continue.
                  </div>
                )}
              </div>
            ))}
          </div>

          {problem && <div className="interactive-rebase-problem">{problem}</div>}
        </div>

        <div className="dialog-footer interactive-rebase-footer">
          <span className="interactive-rebase-summary">{summary}</span>
          <button className="dialog-button button-secondary" onClick={onClose} disabled={isRunning}>
            Cancel
          </button>
          <button
            className="dialog-button button-primary"
            onClick={handleStart}
            disabled={!!problem || isRunning}
          >
            {isRunning ? 'Rebasing...' : 'Start Rebase'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InteractiveRebaseDialog;
