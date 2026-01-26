import React, { useState } from 'react';
import './BranchTree.css';

function TreeNode({ node, currentBranch, branchStatus, level = 0, onBranchSwitch, pullingBranch, onBranchSelect, selectedBranch }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && Object.keys(node.children).length > 0;
  const isCurrent = node.fullPath === currentBranch;
  const isPulling = node.fullPath === pullingBranch;
  const isSelected = !hasChildren && selectedBranch === node.fullPath;
  const status = branchStatus && branchStatus[node.fullPath];

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleClick = (e) => {
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

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    // Only allow switching for leaf nodes (actual branches) and not the current branch
    if (!hasChildren && !isCurrent && onBranchSwitch) {
      onBranchSwitch(node.fullPath);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content ${isCurrent ? 'current' : ''} ${isSelected ? 'branch-selected' : ''} ${!hasChildren && !isCurrent ? 'switchable' : ''}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {hasChildren && (
          <span className="tree-node-icon">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="tree-node-spacer"></span>}

        {isCurrent && <span className="current-branch-icon">●</span>}

        <span className="tree-node-name">{node.name}</span>

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
              selectedBranch={selectedBranch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchTree({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, selectedBranch, collapsed, onToggleCollapse }) {
  if (!branches || branches.length === 0) {
    return <div className="branch-tree-empty">No branches found</div>;
  }

  // Build tree structure from branch names
  const buildTree = (branchNames) => {
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
              selectedBranch={selectedBranch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default BranchTree;
