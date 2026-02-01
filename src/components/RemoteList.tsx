import React, { useState } from 'react';
import { GitAdapter } from '../git/GitAdapter';
import RemoteBranchContextMenu from './RemoteBranchContextMenu';
import './RemoteList.css';

interface RemoteListProps {
  remotes: Array<{ name: string; url: string }>;
  onSelectRemoteBranch?: (branch: { type: 'remote-branch'; remoteName: string; branchName: string; fullName: string }) => void;
  selectedItem?: { type: 'remote-branch'; remoteName: string; branchName: string; fullName: string };
  collapsed: boolean;
  onToggleCollapse: () => void;
  gitAdapter: GitAdapter;
  onRemoteBranchAction?: (action: string, remoteName: string, branchName: string, fullName: string) => void;
  currentBranch?: string;
}

function RemoteList({ remotes, onSelectRemoteBranch, selectedItem, collapsed, onToggleCollapse, gitAdapter, onRemoteBranchAction, currentBranch }: RemoteListProps) {
  const [expandedRemotes, setExpandedRemotes] = useState({});
  const [remoteBranchesCache, setRemoteBranchesCache] = useState({});
  const [loadingRemotes, setLoadingRemotes] = useState({});
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
                <span className="remote-url">{remote.url}</span>
              </div>

              {expandedRemotes[remote.name] && (
                <div className="remote-branches">
                  {loadingRemotes[remote.name] ? (
                    <div className="loading-branches">Loading branches...</div>
                  ) : remoteBranchesCache[remote.name] ? (
                    remoteBranchesCache[remote.name].length > 0 ? (
                      remoteBranchesCache[remote.name].map((branch) => {
                        const isSelected = selectedItem &&
                                        selectedItem.type === 'remote-branch' &&
                                        selectedItem.remoteName === remote.name &&
                                        selectedItem.branchName === branch;

                        return (
                          <div
                            key={branch}
                            className={`remote-branch-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleRemoteBranchSelect(remote.name, branch)}
                            onContextMenu={(e) => handleRemoteBranchContextMenu(e, remote.name, branch)}
                          >
                            <span className="remote-branch-icon">🌿</span>
                            <span className="remote-branch-name">{branch}</span>
                          </div>
                        );
                      })
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
