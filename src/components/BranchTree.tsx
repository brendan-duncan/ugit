import React, { useState, useEffect, useRef } from 'react';
import { SelectedItem } from './types';
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
}

function TreeNode({ node, currentBranch, branchStatus, level = 0, onBranchSwitch, pullingBranch,
      onBranchSelect, selectedItem, onContextMenu, branchesWithStash }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && Object.keys(node.children).length > 0;
  const isCurrent = node.fullPath === currentBranch;
  const isPulling = node.fullPath === pullingBranch;
  const isSelected = selectedItem && selectedItem.type === 'branch' && selectedItem.branchName === node.fullPath;
  const status = branchStatus && branchStatus[node.fullPath];
  const hasStash = branchesWithStash.has(node.fullPath);

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
    if (!hasChildren && !isCurrent && onBranchSwitch) {
      onBranchSwitch(node.fullPath);
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchTree({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, selectedItem,
      collapsed, onToggleCollapse, onContextMenu, stashes }: BranchTreeProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branchName: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const tree = buildTree(branches);

  return (
    <div className="branch-tree">
      <div className="panel-header">
        <h3>Branches</h3>
        <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      {!collapsed && (
        <div className="branch-tree-content">
          {contextMenu && (
            <div
              ref={menuRef}
              className="context-menu"
              style={{
                position: 'fixed',
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`,
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
              <div className="context-menu-item" onClick={() => handleMenuAction('copy-branch-name')}>
                Copy Branch Name
              </div>
            </div>
          )}
          {Object.keys(tree.children).sort().map(key => (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(BranchTree);
