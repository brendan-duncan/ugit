import React, { useMemo, useState } from 'react';
import { LoreTreeNode } from '../lore';

interface LoreRepositoryTreeProps {
  nodes: LoreTreeNode[];
  /** path -> lock owner. */
  lockOwners: Map<string, string>;
  /** path -> change marker ('M' | 'A' | 'D' | '!' conflict). */
  statusByPath: Map<string, string>;
  selectedPath: string | null;
  onSelect: (node: LoreTreeNode) => void;
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

/** Build a nested tree from the flat path list. */
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
 * inline lock owners, and change markers — closer to Perforce's depot/workspace tree than a
 * git "changed files" list.
 */
function LoreRepositoryTree({ nodes, lockOwners, statusByPath, selectedPath, onSelect }: LoreRepositoryTreeProps) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const renderItems = (items: TreeItem[], depth: number): React.ReactNode => items.map(item => {
    const status = statusByPath.get(item.path);
    const owner = lockOwners.get(item.path);
    const isCollapsed = collapsed.has(item.path);
    return (
      <React.Fragment key={item.path}>
        <div
          className={`lore-row ${selectedPath === item.path ? 'selected' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => (item.isDir ? toggle(item.path) : onSelect(item))}
          title={item.path}
        >
          <span style={{ width: 12, color: 'var(--text-secondary)' }}>{item.isDir ? (isCollapsed ? '▸' : '▾') : ''}</span>
          <span>{item.isDir ? '📁' : '📄'}</span>
          {status && <span style={{ color: STATUS_COLOR[status] || 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 700, width: 10 }}>{status}</span>}
          <span className="lore-row-name">{item.name}</span>
          {owner && <span title={`Locked by ${owner}`} style={{ color: 'var(--warning-color)', fontSize: 11 }}>🔒{owner === '<unknown>' ? '' : ` ${owner}`}</span>}
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{formatBytes(item.size)}</span>
        </div>
        {item.isDir && !isCollapsed && renderItems(item.children, depth + 1)}
      </React.Fragment>
    );
  });

  if (!nodes.length) return <div className="lore-empty">empty tree</div>;
  return <div>{renderItems(tree, 0)}</div>;
}

export default LoreRepositoryTree;
