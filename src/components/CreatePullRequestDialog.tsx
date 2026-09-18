import React, { useEffect, useMemo, useState } from 'react';
import { shell } from 'electron';
import { GitAdapter } from '../git/GitAdapter';
import { useSettings } from '../contexts/SettingsContext';
import {
  createPullRequest,
  parseRemoteUrl,
  requestNoun,
  tokenHint
} from '../utils/pullRequests';
import './Dialog.css';
import './CreatePullRequestDialog.css';

interface CreatePullRequestDialogProps {
  gitAdapter: GitAdapter;
  // URL of the remote the request goes to.
  originUrl: string | null;
  branches: string[];
  // The branch being proposed.
  sourceBranch: string;
  onClose: () => void;
}

/** The branch a request most likely goes into, out of what the repo has. */
function guessTargetBranch(branches: string[], sourceBranch: string): string {
  for (const candidate of ['develop', 'main', 'master']) {
    if (branches.includes(candidate) && candidate !== sourceBranch)
      return candidate;
  }
  return branches.find(branch => branch !== sourceBranch) || '';
}

/**
 * Open a pull request (or a merge request, on GitLab) through the host's API,
 * instead of handing a compare URL to the browser.
 *
 * The token is the user's own and is kept in ugit's settings per host, so it only
 * has to be pasted once.
 */
function CreatePullRequestDialog({ gitAdapter, originUrl, branches, sourceBranch, onClose }: CreatePullRequestDialogProps): React.ReactElement {
  const { getSetting, updateSetting } = useSettings();
  const target = useMemo(() => parseRemoteUrl(originUrl || ''), [originUrl]);

  const tokens: Record<string, string> = getSetting('pullRequestTokens') || {};
  const apiBases: Record<string, string> = getSetting('pullRequestApiBases') || {};
  const hostname = target ? target.hostname : '';

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [targetBranch, setTargetBranch] = useState<string>(() => guessTargetBranch(branches, sourceBranch));
  const [token, setToken] = useState<string>(hostname ? (tokens[hostname] || '') : '');
  const [apiBase, setApiBase] = useState<string>(hostname ? (apiBases[hostname] || '') : '');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  // The branch's last commit subject is nearly always the right title.
  useEffect(() => {
    let cancelled = false;
    gitAdapter.log(sourceBranch, 1)
      .then(commits => {
        if (cancelled || commits.length === 0)
          return;
        setTitle(previous => previous || commits[0].message);
        setDescription(previous => previous || (commits[0].body || ''));
      })
      .catch(() => { /* A title the user types is just as good. */ });
    return () => { cancelled = true; };
  }, [gitAdapter, sourceBranch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const noun = requestNoun(target ? target.host : 'unknown');

  const problem = (() => {
    if (!originUrl)
      return 'This repository has no remote to open a request on.';
    if (!target)
      return `ugit couldn't read the remote URL: ${originUrl}`;
    if (target.host === 'unknown')
      return `ugit doesn't know the API for ${target.hostname}. GitHub, GitLab, Bitbucket and Azure DevOps are supported.`;
    if (!title.trim())
      return 'Give the request a title.';
    if (!targetBranch)
      return 'Pick the branch to merge into.';
    if (targetBranch === sourceBranch)
      return 'The source and target branches are the same.';
    if (!token.trim())
      return `Paste a token for ${target.hostname}.`;
    return null;
  })();

  const create = async () => {
    if (problem || busy || !target)
      return;

    setBusy(true);
    setError(null);
    try {
      // Remember the token and any API base for next time, per host.
      await updateSetting('pullRequestTokens', { ...tokens, [target.hostname]: token.trim() });
      if (apiBase.trim() || apiBases[target.hostname])
        await updateSetting('pullRequestApiBases', { ...apiBases, [target.hostname]: apiBase.trim() });

      const result = await createPullRequest({
        target,
        title: title.trim(),
        description,
        sourceBranch,
        targetBranch,
        token: token.trim(),
        apiBase: apiBase.trim() || undefined
      });

      if (result.ok) {
        setCreatedUrl(result.url || '');
      } else {
        setError(result.error || `The host refused the request (${result.status}).`);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content create-pr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Create {noun === 'merge request' ? 'Merge Request' : 'Pull Request'}</h3>
        </div>

        <div className="dialog-body">
          {createdUrl !== null ? (
            <>
              <div className="dialog-message">
                The {noun} was created.
              </div>
              {createdUrl ? (
                <div className="create-pr-created">
                  <input className="dialog-input" value={createdUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button className="create-pr-mini" onClick={() => shell.openExternal(createdUrl)}>Open</button>
                  <button className="create-pr-mini" onClick={() => navigator.clipboard.writeText(createdUrl)}>Copy</button>
                </div>
              ) : (
                <div className="create-pr-hint">The host didn't return a link for it.</div>
              )}
            </>
          ) : (
            <>
              <div className="create-pr-route">
                <span className="create-pr-branch">{sourceBranch}</span>
                <span className="create-pr-arrow">→</span>
                <select
                  className="dialog-select create-pr-target"
                  value={targetBranch}
                  disabled={busy}
                  onChange={(e) => setTargetBranch(e.target.value)}
                >
                  {branches.filter(branch => branch !== sourceBranch).map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
                {target && (
                  <span className="create-pr-host">
                    on {target.hostname}/{target.owner}/{target.repo}
                  </span>
                )}
              </div>

              <div className="dialog-field">
                <label>Title</label>
                <input
                  className="dialog-input"
                  value={title}
                  disabled={busy}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="dialog-field">
                <label>Description</label>
                <textarea
                  className="dialog-input create-pr-description"
                  value={description}
                  disabled={busy}
                  rows={6}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="dialog-field">
                <label>Token for {target ? target.hostname : 'the host'}</label>
                <div className="create-pr-token-row">
                  <input
                    className="dialog-input"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    disabled={busy}
                    placeholder="Personal access token"
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <button className="create-pr-mini" onClick={() => setShowToken(!showToken)}>
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="create-pr-hint">
                  {target ? tokenHint(target.host) : ''}. It's kept in ugit's settings for this
                  host, in plain text - use the narrowest scope that works.
                </div>
              </div>

              <details className="create-pr-advanced">
                <summary>Self-hosted</summary>
                <div className="dialog-field">
                  <label>API base URL</label>
                  <input
                    className="dialog-input"
                    value={apiBase}
                    disabled={busy}
                    placeholder="e.g. https://git.example.com/api/v4"
                    onChange={(e) => setApiBase(e.target.value)}
                  />
                  <div className="create-pr-hint">
                    Only needed when the API isn't where ugit would look for this host.
                  </div>
                </div>
              </details>

              {problem && <div className="create-pr-problem">{problem}</div>}
              {error && <div className="create-pr-problem">{error}</div>}
            </>
          )}
        </div>

        <div className="dialog-footer">
          {createdUrl !== null ? (
            <button className="dialog-button button-primary" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="dialog-button button-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="dialog-button button-primary"
                onClick={create}
                disabled={!!problem || busy}
              >
                {busy ? 'Creating...' : 'Create'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreatePullRequestDialog;
