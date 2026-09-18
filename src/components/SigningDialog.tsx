import React, { useEffect, useState } from 'react';
import { GitAdapter, SigningConfig } from '../git/GitAdapter';
import './Dialog.css';
import './SigningDialog.css';

const FORMATS: { value: string; label: string; hint: string }[] = [
  { value: 'openpgp', label: 'OpenPGP (GPG)', hint: 'Key ID or email of a GPG secret key' },
  { value: 'ssh', label: 'SSH', hint: 'Path to a public key file, or the key itself' },
  { value: 'x509', label: 'X.509 (S/MIME)', hint: 'Key identity for gpgsm' }
];

interface SigningDialogProps {
  gitAdapter: GitAdapter;
  onClose: () => void;
  // Called after the config has been written, so the caller can reload commits.
  onSaved: () => void | Promise<void>;
}

/**
 * Commit and tag signing for this repository.
 *
 * Everything here is git's own config, written to the repository rather than the
 * user's global file: turning signing on means `commit.gpgsign=true`, so commits
 * made anywhere - ugit, the terminal, another client - are signed the same way.
 */
function SigningDialog({ gitAdapter, onClose, onSaved }: SigningDialogProps): React.ReactElement {
  const [config, setConfig] = useState<SigningConfig | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    gitAdapter.getSigningConfig()
      .then(result => { if (!cancelled) setConfig(result); })
      .catch(err => { if (!cancelled) setError(err?.message || String(err)); });
    return () => { cancelled = true; };
  }, [gitAdapter]);

  const handleSave = async () => {
    if (!config)
      return;

    setSaving(true);
    setError(null);
    try {
      await gitAdapter.setSigningConfig(config);
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  };

  const format = FORMATS.find(f => f.value === (config ? config.format : '')) || FORMATS[0];

  return (
    <div className="dialog-overlay">
      <div className="dialog-content signing-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Commit Signing</h3>
        </div>

        <div className="dialog-body">
          {!config ? (
            <div className="signing-status">{error || 'Loading...'}</div>
          ) : (
            <>
              <div className="dialog-message">
                These are this repository's git settings, so anything that commits here signs
                the same way.
              </div>

              <div className="dialog-field">
                <label className="dialog-checkbox-label">
                  <input
                    type="checkbox"
                    className="dialog-checkbox"
                    checked={config.signCommits}
                    disabled={saving}
                    onChange={(e) => setConfig({ ...config, signCommits: e.target.checked })}
                  />
                  <span>Sign commits (commit.gpgsign)</span>
                </label>
                <label className="dialog-checkbox-label">
                  <input
                    type="checkbox"
                    className="dialog-checkbox"
                    checked={config.signTags}
                    disabled={saving}
                    onChange={(e) => setConfig({ ...config, signTags: e.target.checked })}
                  />
                  <span>Sign annotated tags (tag.gpgsign)</span>
                </label>
              </div>

              <div className="dialog-field">
                <label>Signature format (gpg.format)</label>
                <select
                  className="dialog-select"
                  value={config.format}
                  disabled={saving}
                  onChange={(e) => setConfig({ ...config, format: e.target.value })}
                >
                  {FORMATS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="dialog-field">
                <label>Signing key (user.signingkey)</label>
                <input
                  className="dialog-input"
                  value={config.key}
                  disabled={saving}
                  placeholder={format.hint}
                  onChange={(e) => setConfig({ ...config, key: e.target.value })}
                />
                <div className="signing-hint">{format.hint}. Leave empty to let git pick.</div>
              </div>

              {config.signCommits && !config.key && (
                <div className="signing-warning">
                  With no key set, git signs with the default key for your committer identity.
                  If there isn't one, commits will fail.
                </div>
              )}

              {error && <div className="signing-error">{error}</div>}
            </>
          )}
        </div>

        <div className="dialog-footer">
          <button className="dialog-button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="dialog-button button-primary"
            onClick={handleSave}
            disabled={!config || saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SigningDialog;
