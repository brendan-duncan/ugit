import React, { useState } from 'react';
import { GitAdapter } from '../git/GitAdapter';
import RemoteBranchContextMenu from './RemoteBranchContextMenu';
import { SelectedItem, RemoteInfo } from './types';
import './RemoteList.css';

interface RemoteListProps {
  remotes: Array<RemoteInfo>;
  onSelectRemoteBranch?: (branch: SelectedItem) => void;
  selectedItem: SelectedItem | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  gitAdapter: GitAdapter;
  onRemoteBranchAction?: (action: string, remoteName: string, branchName: string, fullName: string) => void;
  currentBranch?: string;
}

interface TreeNode {
  name: string;
  isLeaf: boolean;
  children?: Record<string, TreeNode>;
  fullName?: string;
}

// Helper function to build tree structure from branch names
const buildBranchTree = (branches: Array<string>): Record<string, TreeNode> => {
  const tree: Record<string, TreeNode> = {};
  
  branches.forEach(branch => {
    const parts = branch.split('/');
    let currentLevel = tree;
    
    parts.forEach((part, index) => {
      if (!currentLevel[part]) {
        currentLevel[part] = {
          name: part,
          isLeaf: index === parts.length - 1,
          children: {}
        };
      }
      
      if (index < parts.length - 1) {
        if (!currentLevel[part].children) {
          currentLevel[part].children = {};
        }
        currentLevel = currentLevel[part].children!;
      } else {
        // This is the leaf node (actual branch)
        currentLevel[part].isLeaf = true;
        currentLevel[part].fullName = branch;
      }
    });
  });
  
  return tree;
};

// Recursive component to render tree nodes
const BranchTreeNode: React.FC<{
  node: TreeNode;
  level: number;
  remoteName: string;
  path: string;
  selectedItem: SelectedItem | null;
  onSelectRemoteBranch: (remoteName: string, branchName: string) => void;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>, remoteName: string, branchName: string) => void;
  expandedFolders: Record<string, boolean>;
  onFolderToggle: (remoteName: string, folderPath: string) => void;
}> = ({ node, level, remoteName, path, selectedItem, onSelectRemoteBranch, onContextMenu, expandedFolders, onFolderToggle }) => {
  const fullPath = path ? `${path}/${node.name}` : node.name;
  const folderKey = `${remoteName}/${fullPath}`;
  const isExpanded = expandedFolders[folderKey];
  
  const isSelected = selectedItem &&
                    selectedItem.type === 'remote-branch' &&
                    selectedItem.remoteName === remoteName &&
                    selectedItem.branchName === node.fullName;
  
  return (
    <div>
      <div
        className={`remote-branch-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (node.isLeaf && node.fullName) {
            onSelectRemoteBranch(remoteName, node.fullName);
          } else {
            onFolderToggle(remoteName, fullPath);
          }
        }}
        onContextMenu={node.isLeaf && node.fullName ? (e) => onContextMenu(e, remoteName, node.fullName) : undefined}
      >
        <span className="remote-branch-icon">
          {node.isLeaf ? '🌿' : (isExpanded ? '📂' : '📁')}
        </span>
        <span className={`remote-branch-name ${node.isLeaf ? '' : 'folder-name'}`}>
          {node.name}
        </span>
        {!node.isLeaf && (
          <span className="folder-toggle">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </div>
      
      {!node.isLeaf && isExpanded && node.children && (
        <div>
          {Object.values(node.children)
            .sort((a, b) => {
              // Sort folders first, then leaves, then alphabetically
              if (a.isLeaf !== b.isLeaf) {
                return a.isLeaf ? 1 : -1;
              }
              return a.name.localeCompare(b.name);
            })
            .map((childNode, index) => (
              <BranchTreeNode
                key={`${fullPath}/${childNode.name}`}
                node={childNode}
                level={level + 1}
                remoteName={remoteName}
                path={fullPath}
                selectedItem={selectedItem}
                onSelectRemoteBranch={onSelectRemoteBranch}
                onContextMenu={onContextMenu}
                expandedFolders={expandedFolders}
                onFolderToggle={onFolderToggle}
              />
            ))}
        </div>
      )}
    </div>
  );
};

function RemoteList({ remotes, onSelectRemoteBranch, selectedItem, collapsed, onToggleCollapse, gitAdapter, onRemoteBranchAction, currentBranch }: RemoteListProps) {
  const [expandedRemotes, setExpandedRemotes] = useState<Record<string, boolean>>({});
  const [remoteBranchesCache, setRemoteBranchesCache] = useState<Record<string, Array<string>>>({});
  const [remoteBranchesTreeCache, setRemoteBranchesTreeCache] = useState<Record<string, Record<string, TreeNode>>>({});
  const [loadingRemotes, setLoadingRemotes] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState(null);

  const contextMenuRef = { current: null };

  const handleRemoteToggle = async (remoteName: string) => {
    const isCurrentlyExpanded = expandedRemotes[remoteName];

    if (isCurrentlyExpanded) {
      // Collapse the remote
      setExpandedRemotes(prev => ({
        ...prev,
        [remoteName]: false
      }));
    } else {
      // Expand the remote and load branches if not cached
      setExpandedRemotes(prev => ({
        ...prev,
        [remoteName]: true
      }));

      // Load branches if not already cached
      if (!remoteBranchesCache[remoteName] && !loadingRemotes[remoteName]) {
        setLoadingRemotes(prev => ({
          ...prev,
          [remoteName]: true
        }));

        try {
          console.log(`Loading branches for remote: ${remoteName}`);
          const branches = await gitAdapter.raw(['branch', '-r', '--format=%(refname:short)', '--list']);

          // Filter branches for this remote and clean up names
          const remoteBranches = branches
            .split('\n')
            .filter(branch => branch.trim().startsWith(`${remoteName}/`))
            .map(branch => branch.trim())
            .map(branch => branch.replace(`${remoteName}/`, '')); // Remove remote prefix

          setRemoteBranchesCache(prev => ({
            ...prev,
            [remoteName]: remoteBranches
          }));
          
          // Build tree structure for hierarchical display
          const tree = buildBranchTree(remoteBranches);
          setRemoteBranchesTreeCache(prev => ({
            ...prev,
            [remoteName]: tree
          }));

          console.log(`Loaded ${remoteBranches.length} branches for remote: ${remoteName}`);
        } catch (error) {
          console.error(`Failed to load branches for remote ${remoteName}:`, error);
          // Set empty array to prevent retry attempts
          setRemoteBranchesCache(prev => ({
            ...prev,
            [remoteName]: []
          }));
        } finally {
          setLoadingRemotes(prev => ({
            ...prev,
            [remoteName]: false
          }));
        }
      }
    }
  };

  const handleRemoteBranchSelect = (remoteName: string, branchName: string) => {
    if (onSelectRemoteBranch) {
      onSelectRemoteBranch({
        type: 'remote-branch',
        remoteName,
        branchName,
        fullName: `${remoteName}/${branchName}`
      });
    }
  };

  const handleFolderToggle = (remoteName: string, folderPath: string) => {
    const key = `${remoteName}/${folderPath}`;
    setExpandedFolders(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleRemoteBranchContextMenu = (e: React.MouseEvent<HTMLDivElement>, remoteName: string, branchName: string) => {
    e.preventDefault();
    e.stopPropagation();

    const fullName = `${remoteName}/${branchName}`;

    // Check if current branch is tracking this remote branch
    // This is a simplified check - in a real implementation, you'd check git config for tracking branches
    const isTracking = currentBranch && fullName === `origin/${currentBranch}`;

    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: rect.left,
      y: rect.top + rect.height,
      remoteName,
      branchName,
      fullName,
      currentBranch: currentBranch || '',
      isTracking
    });
  };

  const handleContextMenuAction = (action: string) => {
    if (onRemoteBranchAction) {
      onRemoteBranchAction(action, contextMenu?.remoteName ?? '', contextMenu?.branchName ?? '', contextMenu?.fullName ?? '');
    }
    setContextMenu(null);
  };

  // Close context menu when clicking outside
  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div className="remote-list">
      <div className="panel-header">
        <h3>Remotes</h3>
        <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      {!collapsed && (
        <div className="remote-list-content">
          {(!remotes || remotes.length === 0) ? (
            <div className="remote-list-empty">No remotes found</div>
          ) : (
            remotes.map((remote) => (
            <div key={remote.name} className="remote-item">
              <div
                className="remote-header"
                onClick={() => handleRemoteToggle(remote.name)}
              >
                <span className="remote-toggle-icon">
                  {expandedRemotes[remote.name] ? '▼' : '▶'}
                </span>
                <span className="remote-icon">🌐</span>
                <span className="remote-name">{remote.name}</span>
                <span className="remote-url" title={remote.url}>{remote.url}</span>
              </div>

              {expandedRemotes[remote.name] && (
                <div className="remote-branches">
                  {loadingRemotes[remote.name] ? (
                    <div className="loading-branches">Loading branches...</div>
                  ) : remoteBranchesTreeCache[remote.name] ? (
                    Object.keys(remoteBranchesTreeCache[remote.name]).length > 0 ? (
                      Object.values(remoteBranchesTreeCache[remote.name])
                        .sort((a, b) => {
                          // Sort folders first, then leaves, then alphabetically
                          if (a.isLeaf !== b.isLeaf) {
                            return a.isLeaf ? 1 : -1;
                          }
                          return a.name.localeCompare(b.name);
                        })
                        .map((node) => (
                          <BranchTreeNode
                            key={node.name}
                            node={node}
                            level={0}
                            remoteName={remote.name}
                            path=""
                            selectedItem={selectedItem}
                            onSelectRemoteBranch={handleRemoteBranchSelect}
                            onContextMenu={handleRemoteBranchContextMenu}
                            expandedFolders={expandedFolders}
                            onFolderToggle={handleFolderToggle}
                          />
                        ))
                    ) : (
                      <div className="no-branches">No branches found</div>
                    )
                  ) : (
                    <div className="branches-placeholder">Click to load branches</div>
                  )}
                </div>
              )}
            </div>
          )))}
        </div>
      )}

      {contextMenu && (
        <RemoteBranchContextMenu
          remoteName={contextMenu.remoteName}
          branchName={contextMenu.branchName}
          fullName={contextMenu.fullName}
          currentBranch={contextMenu.currentBranch}
          isTracking={contextMenu.isTracking}
          onCheckout={() => handleContextMenuAction('checkout')}
          onPull={() => handleContextMenuAction('pull')}
          onMerge={() => handleContextMenuAction('merge')}
          onNewBranch={() => handleContextMenuAction('new-branch')}
          onNewTag={() => handleContextMenuAction('new-tag')}
          onDelete={() => handleContextMenuAction('delete')}
          onCopyName={() => handleContextMenuAction('copy-name')}
          onClose={() => setContextMenu(null)}
          position={{ x: contextMenu.x, y: contextMenu.y }}
        />
      )}
    </div>
  );
}

export default RemoteList;
