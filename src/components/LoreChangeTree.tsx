import React, { useMemo, useState } from 'react';
import { LoreFileChange } from '../lore';

interface LoreChangeTreeProps {
  changes: LoreFileChange[];
  busy: boolean;
  /** Multi-selection of file paths (shared across both change lists). */
  selection: Set<string>;
  /** Row click — parent applies modifier-key logic (ctrl toggle / shift range) using `ordered`. */
  onRowClick: (e: React.MouseEvent, path: string, ordered: string[]) => void;
  /** Right-click or the "…" button — parent shows a context menu (no inline action buttons). */
  onRowContextMenu: (e: React.MouseEvent, path: string, isDir: boolean, ordered: string[]) => void;
  lockedPaths: Set<string>;
}

interface Item { path: string; name: string; isDir: boolean; change?: LoreFileChange; children: Item[]; }

const CODE_COLORS: Record<string, string> = {
  A: 'var(--success-color)', M: 'var(--accent-color)', D: 'var(--danger-color)',
};
function changeColor(code: string): string { return CODE_COLORS[code[0]?.toUpperCase()] || 'var(--text-secondary)'; }

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
    // Lore status lists directory entries too (trailing slash, e.g. "A Content/"); they're
    // redundant with the synthesized folders, so skip them as leaves.
    if (ch.path.endsWith('/')) { getDir(ch.path.slice(0, -1)); continue; }
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

/** Depth-first list of file paths in render order, for shift-range selection. */
function flatFiles(items: Item[]): string[] {
  const out: string[] = [];
  const walk = (list: Item[]) => list.forEach(i => { if (i.isDir) walk(i.children); else out.push(i.path); });
  walk(items);
  return out;
}

/**
 * Hierarchical changed-files list with multi-select. Actions live in the right-click context
 * menu (and a hover "…" button) rather than inline buttons, so rows stay all about the items.
 */
function LoreChangeTree({ changes, busy, selection, onRowClick, onRowContextMenu, lockedPaths }: LoreChangeTreeProps) {
  const tree = useMemo(() => buildChangeTree(changes), [changes]);
  const ordered = useMemo(() => flatFiles(tree), [tree]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (p: string) => setCollapsed(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const menuButton = (path: string, isDir: boolean) => (
    <button className="lore-row-menu" disabled={busy} title="More actions"
      onClick={(e) => { e.stopPropagation(); onRowContextMenu(e, path, isDir, ordered); }}>⋯</button>
  );

  const render = (items: Item[], depth: number): React.ReactNode => items.map(item => {
    if (item.isDir) {
      const open = !collapsed.has(item.path);
      return (
        <React.Fragment key={item.path}>
          <div className="lore-row" style={{ paddingLeft: 6 + depth * 14 }} onClick={() => toggle(item.path)}
            onContextMenu={(e) => onRowContextMenu(e, item.path, true, ordered)} title={item.path}>
            <span style={{ width: 12, color: 'var(--text-secondary)' }}>{open ? '▾' : '▸'}</span>
            <span>📁</span>
            <span className="lore-row-name">{item.name}</span>
            {menuButton(item.path, true)}
          </div>
          {open && render(item.children, depth + 1)}
        </React.Fragment>
      );
    }
    const ch = item.change!;
    return (
      <div
        key={item.path}
        className={`lore-row ${selection.has(item.path) ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={(e) => onRowClick(e, item.path, ordered)}
        onContextMenu={(e) => onRowContextMenu(e, item.path, false, ordered)}
        title={item.path}
      >
        <span className="lore-code" style={{ color: changeColor(ch.code) }}>{ch.code}</span>
        {lockedPaths.has(item.path) && <span title="Locked" style={{ color: 'var(--warning-color)' }}>🔒</span>}
        <span className="lore-row-name">{item.name}</span>
        {menuButton(item.path, false)}
      </div>
    );
  });

  if (!changes.length) return <div className="lore-empty">none</div>;
  return <div>{render(tree, 0)}</div>;
}

export default LoreChangeTree;
