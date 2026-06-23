import React, { useMemo, useState } from 'react';
import { LoreFileChange } from '../lore';

interface LoreChangeTreeProps {
  changes: LoreFileChange[];
  /** True for the staged list (button reads "Unstage" instead of "Stage"). */
  staged: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  lockedPaths: Set<string>;
  busy: boolean;
  onLock: (path: string) => void;
  onUnlock: (path: string) => void;
  /** Stage (or unstage, for the staged list) a single file. */
  onStageToggle: (path: string) => void;
  /** Ignore a file (path) or folder (path + '/') — appends to .loreignore. */
  onIgnore: (path: string, isDir: boolean) => void;
  /** Optional: delete a file from the working tree (shown only when provided). */
  onDelete?: (path: string) => void;
}

interface Item { path: string; name: string; isDir: boolean; change?: LoreFileChange; children: Item[]; }

const CODE_COLORS: Record<string, string> = {
  A: 'var(--success-color)', M: 'var(--accent-color)', D: 'var(--danger-color)',
};
function changeColor(code: string): string { return CODE_COLORS[code[0]?.toUpperCase()] || 'var(--text-secondary)'; }

/** Build a nested tree from a flat list of changed file paths, synthesizing folder nodes. */
function buildChangeTree(changes: LoreFileChange[]): Item[] {
  const map = new Map<string, Item>();
  const roots: Item[] = [];
  const getDir = (p: string): Item => {
    const existing = map.get(p);
    if (existing) return existing;
    const item: Item = { path: p, name: p.split('/').pop() || p, isDir: true, children: [] };
    map.set(p, item);
    const slash = p.lastIndexOf('/');
    if (slash >= 0) getDir(p.slice(0, slash)).children.push(item); else roots.push(item);
    return item;
  };
  for (const ch of changes) {
    const slash = ch.path.lastIndexOf('/');
    const leaf: Item = { path: ch.path, name: ch.path.split('/').pop() || ch.path, isDir: false, change: ch, children: [] };
    map.set(ch.path, leaf);
    if (slash >= 0) getDir(ch.path.slice(0, slash)).children.push(leaf); else roots.push(leaf);
  }
  const sort = (items: Item[]) => {
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    items.forEach(i => sort(i.children));
  };
  sort(roots);
  return roots;
}

/** Hierarchical changed-files list (folders collapsible) with per-row stage/lock/ignore actions. */
function LoreChangeTree({ changes, staged, selectedPath, onSelect, lockedPaths, busy, onLock, onUnlock, onStageToggle, onIgnore, onDelete }: LoreChangeTreeProps) {
  const tree = useMemo(() => buildChangeTree(changes), [changes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (p: string) => setCollapsed(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const render = (items: Item[], depth: number): React.ReactNode => items.map(item => {
    if (item.isDir) {
      const open = !collapsed.has(item.path);
      return (
        <React.Fragment key={item.path}>
          <div className="lore-row" style={{ paddingLeft: 6 + depth * 14 }} onClick={() => toggle(item.path)} title={item.path}>
            <span style={{ width: 12, color: 'var(--text-secondary)' }}>{open ? '▾' : '▸'}</span>
            <span>📁</span>
            <span className="lore-row-name">{item.name}</span>
            <span className="lore-row-actions">
              <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); onIgnore(item.path, true); }} title="Add this folder to .loreignore">Ignore</button>
            </span>
          </div>
          {open && render(item.children, depth + 1)}
        </React.Fragment>
      );
    }
    const ch = item.change!;
    return (
      <div
        key={item.path}
        className={`lore-row ${selectedPath === item.path ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onSelect(item.path)}
        title={item.path}
      >
        <span className="lore-code" style={{ color: changeColor(ch.code) }}>{ch.code}</span>
        {lockedPaths.has(item.path) && <span title="Locked" style={{ color: 'var(--warning-color)' }}>🔒</span>}
        <span className="lore-row-name">{item.name}</span>
        <span className="lore-row-actions">
          <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); onIgnore(item.path, false); }} title="Add this file to .loreignore">Ignore</button>
          <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); lockedPaths.has(item.path) ? onUnlock(item.path) : onLock(item.path); }}>
            {lockedPaths.has(item.path) ? 'Unlock' : 'Lock'}
          </button>
          <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); onStageToggle(item.path); }}>
            {staged ? 'Unstage' : 'Stage'}
          </button>
          {onDelete && (
            <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); onDelete(item.path); }} title="Delete this file from disk">Delete</button>
          )}
        </span>
      </div>
    );
  });

  if (!changes.length) return <div className="lore-empty">none</div>;
  return <div>{render(tree, 0)}</div>;
}

export default LoreChangeTree;
