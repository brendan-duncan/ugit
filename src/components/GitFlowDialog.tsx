import React, { useEffect, useMemo, useState } from 'react';
import { FlowConfig, FlowKind, GitAdapter } from '../git/GitAdapter';
import './Dialog.css';
import './GitFlowDialog.css';

type Mode = 'init' | 'start' | 'finish';

const KINDS: { value: FlowKind; label: string; from: string; note: string }[] = [
  {
    value: 'feature',
    label: 'Feature',
    from: 'develop',
    note: 'Grows out of the development branch and goes back into it.'
  },
  {
    value: 'release',
    label: 'Release',
    from: 'develop',
    note: 'Branches off development, then lands on production, gets tagged, and goes back into development.'
  },
  {
    value: 'hotfix',
    label: 'Hotfix',
    from: 'production',
    note: 'Branches off production for an urgent fix, then lands on production, gets tagged, and goes back into development.'
  }
];

interface GitFlowDialogProps {
  gitAdapter: GitAdapter;
  mode: Mode;
  branches: string[];
  currentBranch: string;
  onClose: () => void;
  // The caller runs the operation so it can refresh and report failures the usual way.
  onInit: (config: Partial<FlowConfig>) => void | Promise<void>;
  onStart: (kind: FlowKind, name: string) => void | Promise<void>;
  onFinish: (kind: FlowKind, name: string, options: { tag?: string; keepBranch?: boolean }) => void | Promise<void>;
}

/**
 * The git-flow branching convention: long-lived production and development
 * branches, with short-lived feature, release and hotfix branches off them.
 * ugit runs the branch and merge commands itself, so the `git flow` tool doesn't
 * need to be installed.
 */
function GitFlowDialog({ gitAdapter, mode, branches, currentBranch, onClose, onInit, onStart, onFinish }: GitFlowDialogProps): React.ReactElement {
  const [flow, setFlow] = useState<FlowConfig | null>(null);
  const [kind, setKind] = useState<FlowKind>('feature');
  const [name, setName] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [keepBranch, setKeepBranch] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    gitAdapter.getFlowConfig()
      .then(result => {
        if (cancelled)
          return;
        setFlow(result);
      })
      .catch(err => { if (!cancelled) setError(err?.message || String(err)); });
    return () => { cancelled = true; };
  }, [gitAdapter]);

  // Finishing usually means finishing what's checked out, so pre-fill from it.
  useEffect(() => {
    if (!flow || mode !== 'finish' || name)
      return;

    for (const option of KINDS) {
      const prefix = option.value === 'feature' ? flow.feature
        : option.value === 'release' ? flow.release : flow.hotfix;
      if (prefix && currentBranch.startsWith(prefix)) {
        setKind(option.value);
        setName(currentBranch.slice(prefix.length));
        return;
      }
    }
  }, [flow, mode, currentBranch, name]);

  const prefix = flow
    ? (kind === 'feature' ? flow.feature : kind === 'release' ? flow.release : flow.hotfix)
    : '';
  const branchName = `${prefix}${name.trim()}`;

  // Branches that look like the selected kind, to finish without typing.
  const candidates = useMemo(
    () => (prefix ? branches.filter(branch => branch.startsWith(prefix)) : []),
    [branches, prefix]
  );

  const problem = (() => {
    if (!flow)
      return null;
    if (mode === 'init')
      return !flow.master || !flow.develop ? 'Both branch names are needed.' : null;
    if (!flow.initialized)
      return 'Set up git-flow for this repository first.';
    if (!name.trim())
      return 'Give the branch a name.';
    if (mode === 'start' && branches.includes(branchName))
      return `Branch '${branchName}' already exists.`;
    if (mode === 'finish' && !branches.includes(branchName))
      return `Branch '${branchName}' doesn't exist.`;
    return null;
  })();

  const run = async () => {
    if (problem || busy || !flow)
      return;

    setBusy(true);
    setError(null);
    try {
      if (mode === 'init')
        await onInit(flow);
      else if (mode === 'start')
        await onStart(kind, name.trim());
      else
        await onFinish(kind, name.trim(), { tag: tag.trim() || undefined, keepBranch });
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  };

  const title = mode === 'init' ? 'Set Up Git Flow'
    : mode === 'start' ? 'Start a Git Flow Branch' : 'Finish a Git Flow Branch';

  const selected = KINDS.find(option => option.value === kind);

  return (
    <div className="dialog-overlay">
      <div className="dialog-content git-flow-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{title}</h3>
        </div>

        <div className="dialog-body">
          {!flow ? (
            <div className="git-flow-status">{error || 'Loading...'}</div>
          ) : mode === 'init' ? (
            <>
              <div className="dialog-message">
                Pick the two long-lived branches and the prefixes for the short-lived ones.
                The development branch is created from production if it doesn't exist yet.
              </div>

              <div className="dialog-field">
                <label>Production branch</label>
                <select
                  className="dialog-select"
                  value={flow.master}
                  disabled={busy}
                  onChange={(e) => setFlow({ ...flow, master: e.target.value })}
                >
                  {branches.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>

              <div className="dialog-field">
                <label>Development branch</label>
                <input
                  className="dialog-input"
                  value={flow.develop}
                  disabled={busy}
                  onChange={(e) => setFlow({ ...flow, develop: e.target.value })}
                />
                {!branches.includes(flow.develop) && (
                  <div className="git-flow-hint">'{flow.develop}' will be created from {flow.master}.</div>
                )}
              </div>

              <div className="git-flow-prefixes">
                <div className="dialog-field">
                  <label>Feature prefix</label>
                  <input
                    className="dialog-input"
                    value={flow.feature}
                    disabled={busy}
                    onChange={(e) => setFlow({ ...flow, feature: e.target.value })}
                  />
                </div>
                <div className="dialog-field">
                  <label>Release prefix</label>
                  <input
                    className="dialog-input"
                    value={flow.release}
                    disabled={busy}
                    onChange={(e) => setFlow({ ...flow, release: e.target.value })}
                  />
                </div>
                <div className="dialog-field">
                  <label>Hotfix prefix</label>
                  <input
                    className="dialog-input"
                    value={flow.hotfix}
                    disabled={busy}
                    onChange={(e) => setFlow({ ...flow, hotfix: e.target.value })}
                  />
                </div>
                <div className="dialog-field">
                  <label>Version tag prefix</label>
                  <input
                    className="dialog-input"
                    value={flow.versionTag}
                    disabled={busy}
                    placeholder="e.g. v"
                    onChange={(e) => setFlow({ ...flow, versionTag: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="dialog-field">
                <label>Kind</label>
                <div className="git-flow-kinds">
                  {KINDS.map(option => (
                    <button
                      key={option.value}
                      className={`git-flow-kind ${kind === option.value ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => setKind(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {selected && <div className="git-flow-hint">{selected.note}</div>}
              </div>

              <div className="dialog-field">
                <label>Name</label>
                <div className="git-flow-name-row">
                  <span className="git-flow-prefix">{prefix}</span>
                  <input
                    className="dialog-input"
                    value={name}
                    disabled={busy}
                    autoFocus
                    placeholder={kind === 'feature' ? 'login-form' : '1.4.0'}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                {mode === 'finish' && candidates.length > 0 && (
                  <div className="git-flow-candidates">
                    {candidates.map(branch => (
                      <button
                        key={branch}
                        className="git-flow-candidate"
                        disabled={busy}
                        onClick={() => setName(branch.slice(prefix.length))}
                      >
                        {branch}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {mode === 'finish' && kind !== 'feature' && (
                <div className="dialog-field">
                  <label>Tag</label>
                  <input
                    className="dialog-input"
                    value={tag}
                    disabled={busy}
                    placeholder={`${flow.versionTag}${name.trim() || '1.4.0'}`}
                    onChange={(e) => setTag(e.target.value)}
                  />
                  <div className="git-flow-hint">
                    Left empty, the tag is the version prefix plus the name.
                  </div>
                </div>
              )}

              {mode === 'finish' && (
                <>
                  <div className="dialog-field">
                    <label className="dialog-checkbox-label">
                      <input
                        type="checkbox"
                        className="dialog-checkbox"
                        checked={keepBranch}
                        disabled={busy}
                        onChange={(e) => setKeepBranch(e.target.checked)}
                      />
                      <span>Keep the branch after merging</span>
                    </label>
                  </div>
                  <div className="git-flow-note">
                    {branchName || 'The branch'} is merged with --no-ff into{' '}
                    {kind === 'feature' ? flow.develop : `${flow.master} and ${flow.develop}`}.
                    If a merge conflicts, the finish stops there for you to resolve it.
                  </div>
                </>
              )}
            </>
          )}

          {problem && <div className="git-flow-problem">{problem}</div>}
          {error && <div className="git-flow-problem">{error}</div>}
        </div>

        <div className="dialog-footer">
          <button className="dialog-button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="dialog-button button-primary"
            onClick={run}
            disabled={!!problem || busy || !flow}
          >
            {busy ? 'Working...' : mode === 'init' ? 'Set Up' : mode === 'start' ? 'Start' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GitFlowDialog;
