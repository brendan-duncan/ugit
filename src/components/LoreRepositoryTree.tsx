import React, { useMemo, useState } from 'react';
import { LoreTreeNode } from '../lore';

interface LoreRepositoryTreeProps {
  nodes: LoreTreeNode[];
  /** path -> lock owner. */
  lockOwners: Map<string, string>;
  /** path -> change marker ('M' | 'A' | 'D' | '!' conflict). */
  statusByPath: Map<string, string>;
  /** File paths present in the repo tree but not materialized on disk (sparse/bare clone). */
  unfetchedPaths: Set<string>;
  selectedPath: string | null;
  onSelect: (node: LoreTreeNode) => void;
  /** Directories whose children have been fetched. */
  loadedDirs: Set<string>;
  /** Request a directory's children (lazy load). */
  onExpand: (dirPath: string) => void;
  onContextMenu?: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  busy?: boolean;
}

interface TreeItem extends LoreTreeNode { children: TreeItem[]; }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_COLOR: Record<string, string> = {
  M: 'var(--accent-color)', A: 'var(--success-color)', D: 'var(--danger-color)', '!': 'var(--danger-color)',
};

function buildTree(nodes: LoreTreeNode[]): TreeItem[] {
  const map = new Map<string, TreeItem>();
  for (const n of nodes) map.set(n.path, { ...n, children: [] });
  const roots: TreeItem[] = [];
  for (const item of map.values()) {
    const slash = item.path.lastIndexOf('/');
    const parent = slash >= 0 ? map.get(item.path.slice(0, slash)) : undefined;
    if (parent) parent.children.push(item); else roots.push(item);
  }
  const sort = (items: TreeItem[]) => {
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    items.forEach(i => sort(i.children));
  };
  sort(roots);
  return roots;
}

/**
 * Lore-centric repository tree: the working set as a sparse view of the repo, with file sizes,
 * inline lock owners, and change markers. Directories load their children lazily on first
 * expand (via `repository dump --path <dir>`), so huge repos don't materialize the whole tree.
 */
function LoreRepositoryTree({ nodes, lockOwners, statusByPath, unfetchedPaths, selectedPath, onSelect, loadedDirs, onExpand, onContextMenu, busy }: LoreRepositoryTreeProps) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (item: TreeItem) => {
    const isExpanding = !expanded.has(item.path);
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(item.path) ? next.delete(item.path) : next.add(item.path);
      return next;
    });
    if (isExpanding && !loadedDirs.has(item.path)) onExpand(item.path);
  };

  const renderItems = (items: TreeItem[], depth: number): React.ReactNode => items.map(item => {
    const unfetched = !item.isDir && unfetchedPaths.has(item.path);
    // An un-fetched file is absent from disk on purpose (sparse/bare clone), not a real change —
    // so we hide its scan-derived marker (notably the misleading 'D' on every file in a bare clone).
    const status = unfetched ? undefined : statusByPath.get(item.path);
    const owner = lockOwners.get(item.path);
    const isOpen = expanded.has(item.path);
    const loading = item.isDir && isOpen && !loadedDirs.has(item.path) && item.children.length === 0;
    return (
      <React.Fragment key={item.path}>
        <div
          className={`lore-row ${selectedPath === item.path ? 'selected' : ''}`}
          style={{ paddingLeft: 6 + depth * 14, opacity: unfetched ? 0.6 : 1 }}
          onClick={() => (item.isDir ? toggle(item) : onSelect(item))}
          onContextMenu={(e) => onContextMenu?.(e, item.path, item.isDir)}
          title={unfetched ? `${item.path} — not fetched (in the repo, not checked out locally)` : item.path}
        >
          <span style={{ width: 12, color: 'var(--text-secondary)' }}>{item.isDir ? (isOpen ? '▾' : '▸') : ''}</span>
          <span>{item.isDir ? '📁' : '📄'}</span>
          {status && <span style={{ color: STATUS_COLOR[status] || 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 700, width: 10 }}>{status}</span>}
          <span className="lore-row-name">{item.name}</span>
          {unfetched && <span title="Not fetched — in the repository tree but not checked out on disk" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>☁ not fetched</span>}
          {owner && <span title={`Locked by ${owner}`} style={{ color: 'var(--warning-color)', fontSize: 11 }}>🔒{owner === '<unknown>' ? '' : ` ${owner}`}</span>}
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{formatBytes(item.size)}</span>
          {onContextMenu && (
            <button className="lore-row-menu" disabled={busy} title="More actions"
              onClick={(e) => { e.stopPropagation(); onContextMenu(e, item.path, item.isDir); }}>⋯</button>
          )}
        </div>
        {loading && <div className="lore-empty" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>loading…</div>}
        {item.isDir && isOpen && renderItems(item.children, depth + 1)}
      </React.Fragment>
    );
  });

  if (!nodes.length) return <div className="lore-empty">empty tree</div>;
  return <div>{renderItems(tree, 0)}</div>;
}

export default LoreRepositoryTree;
