import React, { useEffect, useMemo, useState } from 'react';
import { GitAdapter } from '../git/GitAdapter';
import {
  ConflictChoice,
  composeResolution,
  hasConflictMarkers,
  parseConflictSegments
} from '../utils/conflictMarkers';
import './Dialog.css';
import './MergeConflictResolver.css';

const CHOICES: { key: ConflictChoice; label: string; title: string }[] = [
  { key: 'ours', label: 'Ours', title: 'Keep the version from the branch you are on' },
  { key: 'theirs', label: 'Theirs', title: 'Keep the incoming version' },
  { key: 'both-ot', label: 'Both (O+T)', title: 'Keep both, ours first' },
  { key: 'both-to', label: 'Both (T+O)', title: 'Keep both, theirs first' },
  { key: 'base', label: 'Base', title: 'Keep what was there before either side changed it' }
];

interface MergeConflictResolverProps {
  gitAdapter: GitAdapter;
  // Repo-relative path of the conflicted file.
  filePath: string;
  // Called after the file has been written and staged.
  onResolved: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Interactive 3-way resolver for one conflicted file.
 *
 * Both git and Lore write diff3-style markers, so this reads the working copy,
 * parses it with the shared marker parser, and lets each block be resolved on its
 * own. Saving writes the composed file and stages it, which is how git records a
 * conflict as resolved. A text-edit mode covers the cases block choices can't.
 */
function MergeConflictResolver({ gitAdapter, filePath, onResolved, onClose }: MergeConflictResolverProps): React.ReactElement {
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<ConflictChoice[]>([]);
  const [manual, setManual] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<{ oursLabel: string; theirsLabel: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    gitAdapter.readWorkingFile(filePath)
      .then(text => {
        if (cancelled)
          return;
        setContent(text);
        const blocks = parseConflictSegments(text).filter(segment => segment.type === 'conflict');
        setChoices(blocks.map(() => 'ours' as ConflictChoice));
      })
      .catch(err => {
        if (!cancelled)
          setLoadError(err?.message || String(err));
      });

    // Which branch is which reads better than "ours" and "theirs" alone, but the
    // resolver still works without them.
    gitAdapter.getConflictSources()
      .then(sources => { if (!cancelled) setLabels(sources); })
      .catch(() => { if (!cancelled) setLabels(null); });

    return () => { cancelled = true; };
  }, [gitAdapter, filePath]);

  const segments = useMemo(() => (content === null ? [] : parseConflictSegments(content)), [content]);
  const conflictCount = segments.filter(segment => segment.type === 'conflict').length;
  const result = useMemo(() => composeResolution(segments, choices), [segments, choices]);

  const setChoice = (index: number, choice: ConflictChoice) =>
    setChoices(prev => prev.map((existing, i) => (i === index ? choice : existing)));
  const setAll = (choice: ConflictChoice) => setChoices(prev => prev.map(() => choice));

  const handleSave = async () => {
    const resolved = manual ? manualText : result;
    if (hasConflictMarkers(resolved)) {
      setError('The result still has conflict markers (<<<<<<<, ======= or >>>>>>>). Remove them before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await gitAdapter.writeWorkingFile(filePath, resolved);
      // Staging the file is what marks the conflict resolved for git.
      await gitAdapter.add([filePath]);
      await onResolved();
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  };

  const oursLabel = labels ? `Ours - ${labels.oursLabel}` : 'Ours (the branch you are on)';
  const theirsLabel = labels ? `Theirs - ${labels.theirsLabel}` : 'Theirs (incoming)';

  let conflictIndex = -1;

  return (
    <div className="dialog-overlay">
      <div className="dialog-content merge-resolver-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header merge-resolver-header">
          <h3>{filePath}</h3>
          <div className="merge-resolver-header-actions">
            <span className="merge-resolver-count">
              {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
            </span>
            {!manual && conflictCount > 0 && (
              <>
                <button className="merge-resolver-mini" onClick={() => setAll('ours')}>All Ours</button>
                <button className="merge-resolver-mini" onClick={() => setAll('theirs')}>All Theirs</button>
              </>
            )}
            <button
              className="merge-resolver-mini"
              onClick={() => {
                if (manual) {
                  setManual(false);
                } else {
                  setManualText(result);
                  setManual(true);
                }
              }}
              disabled={content === null}
            >
              {manual ? 'Block View' : 'Text Edit'}
            </button>
          </div>
        </div>

        <div className="dialog-body merge-resolver-body">
          {loadError && <div className="merge-resolver-error">{loadError}</div>}
          {!loadError && content === null && <div className="merge-resolver-status">Loading...</div>}

          {!loadError && content !== null && (
            manual ? (
              <textarea
                className="dialog-input merge-resolver-edit"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                spellCheck={false}
              />
            ) : conflictCount === 0 ? (
              <div className="merge-resolver-status">
                No conflict markers left in this file. Save to stage it as resolved.
              </div>
            ) : (
              <>
                <div className="merge-resolver-blocks">
                  {segments.map((segment, index) => {
                    if (segment.type === 'stable') {
                      if (!segment.lines.join('').trim())
                        return null;
                      return (
                        <pre key={`stable-${index}`} className="merge-resolver-stable">
                          {segment.lines.join('\n')}
                        </pre>
                      );
                    }

                    conflictIndex++;
                    const blockIndex = conflictIndex;
                    const choice = choices[blockIndex];

                    return (
                      <div key={`conflict-${index}`} className="merge-resolver-block">
                        <div className="merge-resolver-block-bar">
                          <span className="merge-resolver-block-label">Conflict {blockIndex + 1}</span>
                          {CHOICES.map(option => (
                            // Base is only offered when the file was written with it
                            // (git needs merge.conflictStyle=diff3 for that).
                            (option.key !== 'base' || segment.base.length > 0) && (
                              <button
                                key={option.key}
                                className={`merge-resolver-choice ${choice === option.key ? 'active' : ''}`}
                                title={option.title}
                                onClick={() => setChoice(blockIndex, option.key)}
                              >
                                {option.label}
                              </button>
                            )
                          ))}
                        </div>
                        <div className={`merge-resolver-side ours ${choice === 'ours' || choice === 'both-ot' || choice === 'both-to' ? 'chosen' : ''}`}>
                          <div className="merge-resolver-side-head">{oursLabel}</div>
                          <pre className="merge-resolver-code">{segment.ours.join('\n') || '(nothing)'}</pre>
                        </div>
                        {segment.base.length > 0 && (
                          <div className={`merge-resolver-side base ${choice === 'base' ? 'chosen' : ''}`}>
                            <div className="merge-resolver-side-head">Base (before either change)</div>
                            <pre className="merge-resolver-code">{segment.base.join('\n')}</pre>
                          </div>
                        )}
                        <div className={`merge-resolver-side theirs ${choice === 'theirs' || choice === 'both-ot' || choice === 'both-to' ? 'chosen' : ''}`}>
                          <div className="merge-resolver-side-head">{theirsLabel}</div>
                          <pre className="merge-resolver-code">{segment.theirs.join('\n') || '(nothing)'}</pre>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="merge-resolver-preview">
                  <div className="merge-resolver-preview-head">Result</div>
                  <pre className="merge-resolver-code">{result}</pre>
                </div>
              </>
            )
          )}
        </div>

        <div className="dialog-footer merge-resolver-footer">
          {error && <span className="merge-resolver-error-inline">{error}</span>}
          <button className="dialog-button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="dialog-button button-primary"
            onClick={handleSave}
            disabled={saving || content === null || !!loadError}
          >
            {saving ? 'Saving...' : 'Save & Stage'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MergeConflictResolver;
