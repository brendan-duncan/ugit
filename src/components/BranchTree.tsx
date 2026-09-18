import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { SelectedItem } from './types';
import { isBranchLocked } from '../utils/settings';
import { useSettings } from '../contexts/SettingsContext';
import { ACTION_PREFIX, actionsFor } from '../utils/customActions';
import './BranchTree.css';

interface TreeNodeProps {
  node: any;
  currentBranch: string;
  branchStatus: Record<string, any>;
  level?: number;
  onBranchSwitch: (branchName: string) => void;
  pullingBranch: string | null;
  onBranchSelect: (branchName: string) => void;
  selectedItem: SelectedItem | null;
  onContextMenu: (e: React.MouseEvent, branchName: string) => void;
  branchesWithStash: Set<string>;
  lockedPatterns: ReadonlyArray<string>;
  onActionHandler: (action: string, branchName: string, currentBranch: string) => void;
}

interface BranchTreeProps {
  branches: Array<string>;
  currentBranch: string;
  branchStatus: Record<string, any>;
  onBranchSwitch: (branchName: string) => void;
  pullingBranch: string | null;
  onBranchSelect: (branchName: string) => void;
  selectedItem: SelectedItem | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onContextMenu: (action: string, branchName: string, currentBranch: string) => void;
  stashes: Array<any>;
  lockedPatterns?: ReadonlyArray<string>;
  onAddBranch?: () => void;
  originUrl?: string | null;
  // 'name' groups branches into folders; 'recent' lists them flat, newest commit
  // first, which is how you find what you were working on.
  sortMode?: 'name' | 'recent';
  // Date of each branch's last commit, used by the 'recent' ordering.
  branchDates?: Record<string, string>;
  onToggleSort?: () => void;
}

function TreeNode({ node, currentBranch, branchStatus, level = 0, onBranchSwitch, pullingBranch,
      onBranchSelect, selectedItem, onContextMenu, branchesWithStash, lockedPatterns, onActionHandler }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && Object.keys(node.children).length > 0;
  const isCurrent = node.fullPath === currentBranch;
  const isPulling = node.fullPath === pullingBranch;
  const isSelected = selectedItem && selectedItem.type === 'branch' && selectedItem.branchName === node.fullPath;
  const status = branchStatus && branchStatus[node.fullPath];
  const hasStash = branchesWithStash.has(node.fullPath);
  const isLocked = !hasChildren && isBranchLocked(node.fullPath, lockedPatterns);

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (hasChildren) {
      handleToggle();
    } else {
      // Single click on a branch selects it
      if (onBranchSelect) {
        onBranchSelect(node.fullPath);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // Only allow switching for leaf nodes (actual branches) and not the current branch
    if (!hasChildren && !isCurrent && onActionHandler) {
      onActionHandler('checkout', node.fullPath, currentBranch);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show context menu for leaf nodes (actual branches), not folders
    if (!hasChildren && onContextMenu) {
      onContextMenu(e, node.fullPath);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content ${isCurrent ? 'current' : ''} ${isSelected ? 'branch-selected' : ''} ${!hasChildren && !isCurrent ? 'switchable' : ''}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {hasChildren && (
          <span className="tree-node-icon">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="tree-node-spacer"></span>}

        {isCurrent && <span className="current-branch-icon">●</span>}

        <span className="tree-node-name">{node.name}</span>

        {isLocked && (
          <span className="tree-node-lock-icon" title="Locked branch — commits are blocked by Locked Branch Patterns in Preferences">
            🔒
          </span>
        )}

        {!hasChildren && hasStash && (
          <span className="tree-node-stash-icon" title="Branch has stashed changes">
            📦
          </span>
        )}

        {!hasChildren && isPulling && (
          <span className="tree-node-pulling">
            <span className="pulling-spinner"></span>
          </span>
        )}

        {!hasChildren && status && !isPulling && (
          <span className="tree-node-status">
            {status.ahead > 0 && (
              <span className="status-ahead">
                ↑{status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="status-behind">
                ↓{status.behind}
              </span>
            )}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="tree-node-children">
          {Object.keys(node.children).sort().map(key => (
            <TreeNode
              key={key}
              node={node.children[key]}
              currentBranch={currentBranch}
              branchStatus={branchStatus}
              level={level + 1}
              onBranchSwitch={onBranchSwitch}
              pullingBranch={pullingBranch}
              onBranchSelect={onBranchSelect}
              selectedItem={selectedItem}
              onContextMenu={onContextMenu}
              branchesWithStash={branchesWithStash}
              lockedPatterns={lockedPatterns}
              onActionHandler={onActionHandler}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchTree({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, selectedItem,
      collapsed, onToggleCollapse, onContextMenu, stashes, lockedPatterns, onAddBranch, originUrl,
      sortMode = 'name', branchDates, onToggleSort }: BranchTreeProps) {
  const { getSetting } = useSettings();
  const branchActions = actionsFor(getSetting('customActions'), 'branch');
  const lockPatterns = lockedPatterns || [];
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branchName: string } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [branchFilter, setBranchFilter] = useState('');

  // Create a set of branches that have branch stashes
  const branchesWithStash = new Set<string>();
  if (stashes && stashes.length > 0) {
    stashes.forEach(stash => {
      // Extract branch name from stash message: "branch-stash-{branchName}"
      // Git prepends "On {branch}: " or "WIP on {branch}: " to stash messages
      const match = stash.message.match(/branch-stash-(.+?)(?:\s|$)/);
      if (match && match[1]) {
        const branchName = match[1];
        branchesWithStash.add(branchName);
      }
    });
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenu]);

  // Keep the menu fully on screen when opened near the window edges
  useLayoutEffect(() => {
    if (!contextMenu) {
      setMenuPosition(null);
      return;
    }

    const menu = menuRef.current;
    if (!menu)
      return;

    const margin = 4;
    const { width, height } = menu.getBoundingClientRect();
    setMenuPosition({
      x: Math.max(margin, Math.min(contextMenu.x, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(contextMenu.y, window.innerHeight - height - margin))
    });
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, branchName: string) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      branchName: branchName
    });
  };

  const handleMenuAction = (action: string): void => {
    if (onContextMenu && contextMenu) {
      onContextMenu(action, contextMenu.branchName, currentBranch);
    }
    setContextMenu(null);
  };
  if (!branches || branches.length === 0) {
    return <div className="branch-tree-empty">No branches found</div>;
  }

  // Build tree structure from branch names
  const buildTree = (branchNames: string[]): any => {
    const root = { children: {} };

    branchNames.forEach(branchName => {
      const parts = branchName.split('/');
      let currentLevel = root;

      parts.forEach((part, index) => {
        if (!currentLevel.children[part]) {
          currentLevel.children[part] = {
            name: part,
            fullPath: parts.slice(0, index + 1).join('/'),
            children: {}
          };
        }
        currentLevel = currentLevel.children[part];
      });
    });

    return root;
  };

  // Filter branches if filter is active
  const filteredBranches = branchFilter.trim()
    ? branches.filter(branch => branch.toLowerCase().includes(branchFilter.toLowerCase()))
    : branches;

  // Sorting by date and grouping by folder pull in different directions, so the
  // recent view is a flat list: one node per branch, in the order given.
  const buildFlat = (branchNames: string[]): any => {
    const root = { children: {} };
    for (const branchName of branchNames)
      root.children[branchName] = { name: branchName, fullPath: branchName, children: {} };
    return root;
  };

  const orderedBranches = sortMode === 'recent' && branchDates
    ? [...filteredBranches].sort((a, b) => (branchDates[b] || '').localeCompare(branchDates[a] || ''))
    : filteredBranches;

  const tree = sortMode === 'recent' ? buildFlat(orderedBranches) : buildTree(orderedBranches);
  // Object key order is insertion order, which the flat list relies on.
  const topLevelKeys = sortMode === 'recent'
    ? Object.keys(tree.children)
    : Object.keys(tree.children).sort();

  return (
    <div className="branch-tree">
      <div className="panel-header">
        <h3>Branches</h3>
        <div className="panel-header-buttons">
          {onToggleSort && (
            <button
              className="add-button"
              onClick={onToggleSort}
              title={sortMode === 'recent'
                ? 'Sorted by most recent commit - click to group by name'
                : 'Grouped by name - click to sort by most recent commit'}
            >
              <span>{sortMode === 'recent' ? '🕓' : 'A↓'}</span>
            </button>
          )}
          {onAddBranch && (
            <button className="add-button" onClick={onAddBranch} title="New Branch">
              <span>+</span>
            </button>
          )}
          <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="branch-filter">
            <input
              type="text"
              placeholder="Filter branches..."
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="branch-filter-input"
            />
          </div>
          <div className="branch-tree-content">
          {contextMenu && (
            <div
              ref={menuRef}
              className="context-menu branch-context-menu"
              style={{
                position: 'fixed',
                left: `${(menuPosition || contextMenu).x}px`,
                top: `${(menuPosition || contextMenu).y}px`,
                zIndex: 1000
              }}
            >
              <div className="context-menu-item" onClick={() => handleMenuAction('checkout')}>
                Checkout
              </div>
              <div className="context-menu-item" onClick={() => handleMenuAction('pull')}>
                Pull
              </div>
              <div className="context-menu-item" onClick={() => handleMenuAction('push-to-origin')}>
                Push to origin...
              </div>
              <div className="context-menu-item" onClick={() => handleMenuAction('push-branch')}>
                Push to branch...
              </div>
              <div className="context-menu-separator"></div>
              {currentBranch !== contextMenu.branchName && (
                <div className="context-menu-item" onClick={() => handleMenuAction('merge-into-active')}>
                  Merge '{contextMenu.branchName}' into '{currentBranch}'
                </div>
              )}
              {currentBranch !== contextMenu.branchName && (
                <div className="context-menu-item" onClick={() => handleMenuAction('rebase-active-onto-branch')}>
                  Rebase '{currentBranch}' onto '{contextMenu.branchName}'
                </div>
              )}
              <div className="context-menu-separator"></div>
              <div className="context-menu-item" onClick={() => handleMenuAction('new-branch')}>
                New Branch...
              </div>
              <div className="context-menu-item" onClick={() => handleMenuAction('new-worktree')}>
                Check out in new worktree...
              </div>
              <div className="context-menu-item" onClick={() => handleMenuAction('new-tag')}>
                New Tag...
              </div>
              <div className="context-menu-separator"></div>
              <div className="context-menu-item" onClick={() => handleMenuAction('rename')}>
                Rename...
              </div>
              <div className="context-menu-item" onClick={() => handleMenuAction('delete')}>
                Delete...
              </div>
              <div className="context-menu-separator"></div>
              {branchActions.length > 0 && (
                <>
                  <div className="context-menu-separator"></div>
                  {branchActions.map(action => (
                    <div
                      key={action.id}
                      className="context-menu-item"
                      title={action.command}
                      onClick={() => handleMenuAction(`${ACTION_PREFIX}${action.id}`)}
                    >
                      {action.name}
                    </div>
                  ))}
                  <div className="context-menu-separator"></div>
                </>
              )}
              <div className="context-menu-item" onClick={() => handleMenuAction('copy-branch-name')}>
                Copy Branch Name
              </div>
              {originUrl && (
                <>
                  <div className="context-menu-separator"></div>
                  <div className="context-menu-item" onClick={() => handleMenuAction('open-remote-url')}>
                    🌐 Open Remote URL
                  </div>
                  <div className="context-menu-item" onClick={() => handleMenuAction('create-pr')}>
                    🔀 Create Pull Request...
                  </div>
                  <div className="context-menu-item" onClick={() => handleMenuAction('open-pr')}>
                    🌐 Open PR
                  </div>
                  <div className="context-menu-item" onClick={() => handleMenuAction('open-branch-compare')}>
                    🌐 Open Branch Compare
                  </div>
                </>
              )}
            </div>
          )}
          {topLevelKeys.map(key => (
            <TreeNode
              key={key}
              node={tree.children[key]}
              currentBranch={currentBranch}
              branchStatus={branchStatus}
              level={0}
              onBranchSwitch={onBranchSwitch}
              pullingBranch={pullingBranch}
              onBranchSelect={onBranchSelect}
              selectedItem={selectedItem}
              onContextMenu={handleContextMenu}
              branchesWithStash={branchesWithStash}
              lockedPatterns={lockPatterns}
              onActionHandler={onContextMenu}
            />
          ))}
        </div>
        </>
      )}
    </div>
  );
}

export default React.memo(BranchTree);
