import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import DiffViewer from './DiffViewer';
import { GitAdapter, BlameLine, FileHistoryEntry } from '../git/GitAdapter';
import './Dialog.css';
import './FileHistoryDialog.css';

// Commits fetched per page of the history list.
const PAGE_SIZE = 200;
// Height of a blame row, kept in step with .file-history-blame-row in the CSS so
// react-window places rows where they're drawn.
const BLAME_ROW_HEIGHT = 18;
// git uses an all-zero hash for lines that aren't committed yet.
const UNCOMMITTED = '0000000000000000000000000000000000000000';

/** What blame is currently showing: a revision (null = working tree) and a path. */
interface BlameTarget {
  rev: string | null;
  path: string;
}

interface FileHistoryDialogProps {
  gitAdapter: GitAdapter;
  // Path relative to the repository root.
  filePath: string;
  // Directories can be shown in history but not blamed, and git won't follow
  // renames for them.
  isDirectory?: boolean;
  initialTab?: 'history' | 'blame';
  onClose: () => void;
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M': return 'Modified';
    case 'A': return 'Added';
    case 'D': return 'Deleted';
    case 'R': return 'Renamed';
    case 'C': return 'Copied';
    default: return '';
  }
}

function FileHistoryDialog({ gitAdapter, filePath, isDirectory = false, initialTab = 'history', onClose }: FileHistoryDialogProps): React.ReactElement {
  const [tab, setTab] = useState<'history' | 'blame'>(initialTab);

  const [entries, setEntries] = useState<FileHistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState<number>(0);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileHistoryEntry | null>(null);
  const [diff, setDiff] = useState<string | null>(null);

  const [blameTarget, setBlameTarget] = useState<BlameTarget>({ rev: null, path: filePath });
  // Revisions blamed before this one, so "Back" can retrace the walk through history.
  const [blameHistory, setBlameHistory] = useState<BlameTarget[]>([]);
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [blameLoading, setBlameLoading] = useState<boolean>(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [selectedBlameLine, setSelectedBlameLine] = useState<BlameLine | null>(null);

  const blameListRef = useRef<HTMLDivElement | null>(null);
  const [blameListHeight, setBlameListHeight] = useState<number>(400);

  // Load a page of the path's history.
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);

    gitAdapter.fileLog(filePath, PAGE_SIZE, page * PAGE_SIZE, !isDirectory)
      .then(result => {
        if (cancelled)
          return;
        setEntries(result);
        // Select the newest commit so the dialog opens on something.
        setSelected(prev => prev || result[0] || null);
        setHistoryLoading(false);
      })
      .catch(error => {
        if (cancelled)
          return;
        setHistoryError(error?.message || String(error));
        setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [gitAdapter, filePath, isDirectory, page]);

  // The total is only needed for the pager, so it can lag behind the first page.
  useEffect(() => {
    let cancelled = false;
    gitAdapter.getFileCommitCount(filePath, !isDirectory)
      .then(n => { if (!cancelled) setTotalCount(n); })
      .catch(() => { if (!cancelled) setTotalCount(null); });
    return () => { cancelled = true; };
  }, [gitAdapter, filePath, isDirectory]);

  // Load the diff for the selected commit, naming the path as it was then so a
  // commit from before a rename still shows its changes.
  useEffect(() => {
    if (!selected) {
      setDiff(null);
      return;
    }

    let cancelled = false;
    setDiff(null);
    gitAdapter.show(selected.commit.hash, selected.path)
      .then(result => { if (!cancelled) setDiff(result); })
      .catch(error => { if (!cancelled) setDiff(`Error loading diff: ${error?.message || error}`); });

    return () => { cancelled = true; };
  }, [gitAdapter, selected]);

  // Load blame for whichever revision is being looked at.
  useEffect(() => {
    if (tab !== 'blame' || isDirectory)
      return;

    let cancelled = false;
    setBlameLoading(true);
    setBlameError(null);
    setSelectedBlameLine(null);

    gitAdapter.blame(blameTarget.path, blameTarget.rev || undefined)
      .then(lines => {
        if (cancelled)
          return;
        setBlameLines(lines);
        setBlameLoading(false);
      })
      .catch(error => {
        if (cancelled)
          return;
        setBlameLines([]);
        setBlameError(error?.message || String(error));
        setBlameLoading(false);
      });

    return () => { cancelled = true; };
  }, [gitAdapter, tab, isDirectory, blameTarget]);

  // Size the virtualized blame list to its container.
  useEffect(() => {
    const element = blameListRef.current;
    if (!element)
      return;

    const measure = () => setBlameListHeight(element.clientHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tab, blameLoading]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const blameAt = useCallback((target: BlameTarget) => {
    setBlameHistory(prev => [...prev, blameTarget]);
    setBlameTarget(target);
  }, [blameTarget]);

  const blameBack = useCallback(() => {
    if (blameHistory.length === 0)
      return;
    setBlameTarget(blameHistory[blameHistory.length - 1]);
    setBlameHistory(prev => prev.slice(0, -1));
  }, [blameHistory]);

  // Walk one step further back: blame the state of the file before the commit
  // that last touched the selected line. git's `previous` header names the path as
  // it was then, so this follows renames exactly.
  const blamePrevious = useCallback((line: BlameLine) => {
    if (line.previousHash) {
      blameAt({ rev: line.previousHash, path: line.previousPath || line.origPath });
      return;
    }
    // No `previous` header means the line was introduced by this commit, so its
    // parent has nothing to blame - unless the commit came from the working tree.
    if (line.hash !== UNCOMMITTED)
      blameAt({ rev: `${line.hash}^`, path: line.origPath });
  }, [blameAt]);

  // Jump from a blame line to the commit that wrote it. It may not be in the page
  // of history that's loaded, so fall back to fetching just that commit.
  const showCommitInHistory = useCallback(async (hash: string) => {
    setTab('history');

    const loaded = entries.find(e => e.commit.hash === hash);
    if (loaded) {
      setSelected(loaded);
      return;
    }

    try {
      const single = await gitAdapter.fileLog(blameTarget.path, 1, 0, !isDirectory, hash);
      if (single.length > 0)
        setSelected(single[0]);
    } catch (error) {
      // Leave the selection alone; the history list is still usable.
      console.error('Error loading commit for file history:', error);
    }
  }, [entries, gitAdapter, blameTarget.path, isDirectory]);

  const totalPages = totalCount === null ? null : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const renderHistory = () => (
    <div className="file-history-body">
      <div className="file-history-commits">
        {historyLoading && <div className="file-history-status">Loading history...</div>}
        {historyError && <div className="file-history-status file-history-error">{historyError}</div>}
        {!historyLoading && !historyError && entries.length === 0 && (
          <div className="file-history-status">No commits touched this path.</div>
        )}
        {!historyLoading && entries.map(entry => (
          <div
            key={`${entry.commit.hash}-${entry.path}`}
            className={`file-history-commit ${selected && selected.commit.hash === entry.commit.hash ? 'selected' : ''}`}
            onClick={() => setSelected(entry)}
          >
            <div className="file-history-commit-top">
              <span className="file-history-commit-message">{entry.commit.message}</span>
              {entry.status && (
                <span className={`file-history-commit-status status-${entry.status}`}>
                  {statusLabel(entry.status)}
                </span>
              )}
            </div>
            <div className="file-history-commit-meta">
              <span className="file-history-commit-hash">{shortHash(entry.commit.hash)}</span>
              <span className="file-history-commit-author">{entry.commit.author_name}</span>
              <span className="file-history-commit-date">{entry.commit.date}</span>
            </div>
            {entry.renamedFrom && (
              <div className="file-history-commit-rename">renamed from {entry.renamedFrom}</div>
            )}
          </div>
        ))}
      </div>

      <div className="file-history-diff">
        {selected ? (
          diff === null ? (
            <div className="file-history-status">Loading diff...</div>
          ) : (
            <DiffViewer
              file={{ path: selected.path, diff, status: selected.status || 'M' }}
              gitAdapter={gitAdapter}
              isStaged={false}
              showChunkControls={false}
            />
          )
        ) : (
          <div className="file-history-status">Select a commit to see what it changed.</div>
        )}
      </div>
    </div>
  );

  const BlameRow = ({ index, style }: ListChildComponentProps) => {
    const line = blameLines[index];
    const uncommitted = line.hash === UNCOMMITTED;
    const selectedLine = selectedBlameLine && selectedBlameLine.line === line.line;

    return (
      <div
        className={`file-history-blame-row ${selectedLine ? 'selected' : ''}`}
        style={style}
        onClick={() => setSelectedBlameLine(line)}
        onDoubleClick={() => !uncommitted && showCommitInHistory(line.hash)}
      >
        <span className={`blame-gutter ${line.isGroupStart ? 'group-start' : ''} ${uncommitted ? 'uncommitted' : ''}`}>
          {line.isGroupStart && (
            <>
              <span className="blame-hash">{uncommitted ? 'uncommitted' : shortHash(line.hash)}</span>
              <span className="blame-author">{uncommitted ? '' : line.author}</span>
              <span className="blame-date">{uncommitted ? '' : line.date.slice(0, 10)}</span>
            </>
          )}
        </span>
        <span className="blame-line-number">{line.line}</span>
        <span className="blame-content">{line.content || ' '}</span>
      </div>
    );
  };

  const renderBlame = () => (
    <div className="file-history-body file-history-body-blame">
      <div className="file-history-blame-bar">
        <button
          className="dialog-button button-secondary file-history-small-button"
          onClick={blameBack}
          disabled={blameHistory.length === 0}
        >
          Back
        </button>
        <span className="file-history-blame-revision">
          {blameTarget.rev ? `at ${shortHash(blameTarget.rev)}` : 'working tree'}
          {blameTarget.path !== filePath && ` - ${blameTarget.path}`}
        </span>
        {!blameLoading && !blameError && (
          <span className="file-history-blame-count">{blameLines.length} lines</span>
        )}
      </div>

      <div className="file-history-blame-list" ref={blameListRef}>
        {blameLoading && <div className="file-history-status">Loading blame...</div>}
        {blameError && <div className="file-history-status file-history-error">{blameError}</div>}
        {!blameLoading && !blameError && blameLines.length > 0 && (
          <FixedSizeList
            height={blameListHeight}
            itemCount={blameLines.length}
            itemSize={BLAME_ROW_HEIGHT}
            width="100%"
          >
            {BlameRow}
          </FixedSizeList>
        )}
        {!blameLoading && !blameError && blameLines.length === 0 && (
          <div className="file-history-status">Nothing to blame - the file is empty at this revision.</div>
        )}
      </div>

      <div className="file-history-blame-details">
        {selectedBlameLine ? (
          selectedBlameLine.hash === UNCOMMITTED ? (
            <span className="file-history-blame-summary">Line {selectedBlameLine.line} isn't committed yet.</span>
          ) : (
            <>
              <span className="file-history-blame-summary">
                <strong>{shortHash(selectedBlameLine.hash)}</strong> {selectedBlameLine.summary}
                <span className="file-history-blame-byline">
                  {selectedBlameLine.author} &lt;{selectedBlameLine.authorMail}&gt; on {selectedBlameLine.date}
                </span>
              </span>
              <span className="file-history-blame-actions">
                <button
                  className="dialog-button button-secondary file-history-small-button"
                  onClick={() => showCommitInHistory(selectedBlameLine.hash)}
                >
                  Show Commit
                </button>
                <button
                  className="dialog-button button-secondary file-history-small-button"
                  onClick={() => blamePrevious(selectedBlameLine)}
                >
                  Blame Previous
                </button>
                <button
                  className="dialog-button button-secondary file-history-small-button"
                  onClick={() => navigator.clipboard.writeText(selectedBlameLine.hash)}
                >
                  Copy SHA
                </button>
              </span>
            </>
          )
        ) : (
          <span className="file-history-blame-summary file-history-blame-hint">
            Click a line to see its commit. Double-click to open it in the history.
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="dialog-overlay">
      <div className="dialog-content file-history-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header file-history-header">
          <h3>{filePath}</h3>
          <div className="file-history-tabs">
            <button
              className={`file-history-tab ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
            >
              History
            </button>
            {!isDirectory && (
              <button
                className={`file-history-tab ${tab === 'blame' ? 'active' : ''}`}
                onClick={() => setTab('blame')}
              >
                Blame
              </button>
            )}
          </div>
        </div>

        {tab === 'history' ? renderHistory() : renderBlame()}

        <div className="dialog-footer file-history-footer">
          {tab === 'history' && totalPages !== null && totalPages > 1 && (
            <div className="file-history-pager">
              <button
                className="dialog-button button-secondary file-history-small-button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || historyLoading}
              >
                Newer
              </button>
              <span className="file-history-page-label">Page {page + 1} of {totalPages}</span>
              <button
                className="dialog-button button-secondary file-history-small-button"
                onClick={() => setPage(p => p + 1)}
                disabled={page + 1 >= totalPages || historyLoading}
              >
                Older
              </button>
            </div>
          )}
          <button className="dialog-button button-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default FileHistoryDialog;
