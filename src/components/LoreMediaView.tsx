import React, { useState } from 'react';

interface LoreMediaViewProps {
  kind: 'image' | 'audio';
  name: string;
  /** Data URL of the current/new version (working tree, or the newer revision). */
  newUrl: string | null;
  /** Data URL of the old version (a previous revision) — present only when diffing. */
  oldUrl?: string | null;
  /** Loading the old version. */
  loadingOld?: boolean;
}

type ImageMode = 'side' | 'swipe' | 'onion';

const PANEL: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
  maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
};

/**
 * Media viewer/differ for images and audio. With only a new version it displays the asset; with
 * an old version too it offers an image diff (side-by-side / swipe / onion) or, for audio, plays
 * the previous and current versions side by side.
 */
function LoreMediaView({ kind, name, newUrl, oldUrl, loadingOld }: LoreMediaViewProps) {
  const [mode, setMode] = useState<ImageMode>('side');
  const [split, setSplit] = useState(50); // % for swipe/onion

  if (kind === 'audio') {
    return (
      <div style={{ padding: 16 }}>
        {oldUrl !== undefined && oldUrl !== null && (
          <div style={{ marginBottom: 14 }}>
            <div className="lore-detail-header" style={{ padding: '2px 0' }}>Previous</div>
            <audio controls src={oldUrl} style={{ width: '100%' }} />
          </div>
        )}
        {loadingOld && <div className="lore-empty">Loading previous version…</div>}
        <div>
          <div className="lore-detail-header" style={{ padding: '2px 0' }}>{oldUrl ? 'Current' : name}</div>
          {newUrl ? <audio controls src={newUrl} style={{ width: '100%' }} /> : <div className="lore-empty">no audio</div>}
        </div>
      </div>
    );
  }

  // image
  if (!oldUrl) {
    return (
      <div style={{ padding: 10, textAlign: 'center' }}>
        {newUrl ? <img src={newUrl} alt={name} style={PANEL} /> : <div className="lore-empty">no image</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>image diff:</span>
        <button className={`lore-chip ${mode === 'side' ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode('side')}>Side by side</button>
        <button className={`lore-chip ${mode === 'swipe' ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode('swipe')}>Swipe</button>
        <button className={`lore-chip ${mode === 'onion' ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode('onion')}>Onion</button>
        {loadingOld && <span className="lore-empty">loading old…</span>}
      </div>

      {mode === 'side' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="lore-detail-header" style={{ padding: 2 }}>Old</div>
            <img src={oldUrl} alt="old" style={PANEL} />
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="lore-detail-header" style={{ padding: 2 }}>New</div>
            <img src={newUrl ?? ''} alt="new" style={PANEL} />
          </div>
        </div>
      )}

      {(mode === 'swipe' || mode === 'onion') && (
        <>
          <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
            <img src={oldUrl} alt="old" style={{ ...PANEL, display: 'block' }} />
            <img
              src={newUrl ?? ''}
              alt="new"
              style={{
                ...PANEL, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                ...(mode === 'swipe'
                  ? { clipPath: `inset(0 ${100 - split}% 0 0)` }
                  : { opacity: split / 100 }),
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{mode === 'swipe' ? 'old' : 'old'}</span>
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>new</span>
          </div>
        </>
      )}
    </div>
  );
}

export default LoreMediaView;
