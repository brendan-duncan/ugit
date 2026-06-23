import React, { useMemo, useState } from 'react';
import {
  LoreClient,
  LoreOperation,
  ConflictChoice,
  parseConflictSegments,
  composeResolution,
  hasConflictMarkers,
} from '../lore';

interface LoreMergeResolverProps {
  client: LoreClient;
  /** Repo-relative path of the conflicted file. */
  path: string;
  /** The pending operation, so resolve uses the right subcommand. */
  operation: LoreOperation;
  onResolved: () => void;
  onClose: () => void;
}

const CHOICE_LABELS: Array<{ key: ConflictChoice; label: string }> = [
  { key: 'ours', label: 'Ours' },
  { key: 'theirs', label: 'Theirs' },
  { key: 'both-ot', label: 'Both (O+T)' },
  { key: 'both-to', label: 'Both (T+O)' },
  { key: 'base', label: 'Base' },
];

/**
 * Interactive 3-way conflict resolver for a single file. Lore writes diff3 markers (ours /
 * original / theirs), so we present each conflict block with per-block choices, compose a
 * resolved file, write it, and mark it resolved via `<op> resolve <path>` (no mine/theirs).
 * A manual text-edit mode is available as a fallback.
 */
function LoreMergeResolver({ client, path, operation, onResolved, onClose }: LoreMergeResolverProps) {
  const original = useMemo(() => {
    try { return client.readWorkingFile(path); } catch { return ''; }
  }, [client, path]);

  const segments = useMemo(() => parseConflictSegments(original), [original]);
  const conflictCount = segments.filter(s => s.type === 'conflict').length;

  // One choice per conflict block; default to 'ours'.
  const [choices, setChoices] = useState<ConflictChoice[]>(() => segments.filter(s => s.type === 'conflict').map(() => 'ours' as ConflictChoice));
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => composeResolution(segments, choices), [segments, choices]);

  const setChoice = (i: number, c: ConflictChoice) => setChoices(prev => prev.map((p, idx) => idx === i ? c : p));
  const setAll = (c: ConflictChoice) => setChoices(prev => prev.map(() => c));

  const enterManual = () => { setManualText(result); setManual(true); };

  const save = async () => {
    const content = manual ? manualText : result;
    if (hasConflictMarkers(content)) {
      setError('Resolved content still contains conflict markers (<<<<<<< / ======= / >>>>>>>). Remove them first.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      client.writeWorkingFile(path, content);
      await client.conflictResolve(operation, [path]); // no side → resolve from working file
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  let conflictIdx = -1;

  return (
    <div className="lore-resolver-overlay" onClick={onClose}>
      <div className="lore-resolver" onClick={(e) => e.stopPropagation()}>
        <div className="lore-resolver-header">
          <strong>Resolve conflicts</strong>
          <code>{path}</code>
          <span className="lore-chip">{conflictCount} conflict(s)</span>
          <span style={{ flex: 1 }} />
          {!manual && conflictCount > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>all:</span>
              <button className="lore-mini-btn" onClick={() => setAll('ours')}>Ours</button>
              <button className="lore-mini-btn" onClick={() => setAll('theirs')}>Theirs</button>
            </>
          )}
          <button className="lore-mini-btn" onClick={() => (manual ? setManual(false) : enterManual())}>
            {manual ? 'Block view' : 'Text edit'}
          </button>
        </div>

        <div className="lore-resolver-body">
          {manual ? (
            <textarea className="lore-resolver-edit" value={manualText} onChange={(e) => setManualText(e.target.value)} />
          ) : conflictCount === 0 ? (
            <div className="lore-empty">No conflict markers found — the file may already be resolved. Save to mark it resolved.</div>
          ) : (
            segments.map((seg, sIdx) => {
              if (seg.type === 'stable') {
                if (!seg.lines.join('').trim()) return null;
                return <pre key={`s${sIdx}`} className="lore-conflict-code" style={{ opacity: 0.7 }}>{seg.lines.join('\n')}</pre>;
              }
              conflictIdx++;
              const i = conflictIdx;
              const choice = choices[i];
              return (
                <div key={`c${sIdx}`} className="lore-conflict-block resolved">
                  <div style={{ display: 'flex', gap: 4, padding: '4px 8px', flexWrap: 'wrap' }}>
                    {CHOICE_LABELS.map(({ key, label }) => (
                      (key !== 'base' || seg.base.length > 0) && (
                        <span key={key} className={`lore-chip ${choice === key ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setChoice(i, key)}>{label}</span>
                      )
                    ))}
                  </div>
                  <div className="lore-conflict-side ours">
                    <div className="lore-conflict-side-head"><span>Ours (current branch)</span></div>
                    <pre className="lore-conflict-code">{seg.ours.join('\n') || '∅'}</pre>
                  </div>
                  {seg.base.length > 0 && (
                    <div className="lore-conflict-side base">
                      <div className="lore-conflict-side-head"><span>Base (original)</span></div>
                      <pre className="lore-conflict-code">{seg.base.join('\n') || '∅'}</pre>
                    </div>
                  )}
                  <div className="lore-conflict-side theirs">
                    <div className="lore-conflict-side-head"><span>Theirs (incoming)</span></div>
                    <pre className="lore-conflict-code">{seg.theirs.join('\n') || '∅'}</pre>
                  </div>
                </div>
              );
            })
          )}

          {!manual && conflictCount > 0 && (
            <>
              <div className="lore-changes-group-header"><span>Result preview</span></div>
              <pre className="lore-resolver-result">{result}</pre>
            </>
          )}
        </div>

        <div className="lore-resolver-footer">
          {error && <span style={{ color: 'var(--danger-color)', fontSize: 12 }}>{error}</span>}
          <span style={{ flex: 1 }} />
          <button className="lore-primary-btn" style={{ marginTop: 0 }} onClick={save} disabled={working}>Save &amp; resolve</button>
          <button className="lore-mini-btn" onClick={onClose} disabled={working}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default LoreMergeResolver;
