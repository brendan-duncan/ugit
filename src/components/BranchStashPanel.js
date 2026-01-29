import React, { useState } from 'react';
import BranchTree from './BranchTree';
import RemoteList from './RemoteList';
import StashList from './StashList';

function BranchStashPanel({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, stashes, onSelectStash, selectedItem, onMouseDown, onBranchContextMenu, onStashContextMenu, remotes, onSelectRemoteBranch, gitAdapter }) {
  const [branchesCollapsed, setBranchesCollapsed] = useState(false);
  const [remotesCollapsed, setRemotesCollapsed] = useState(false);
  const [stashesCollapsed, setStashesCollapsed] = useState(false);

  return (
    <div className="branch-stash-panel-contents">
      <div className={`split-panel branches-panel ${branchesCollapsed ? 'collapsed' : ''}`}>
        <BranchTree
          branches={branches}
          currentBranch={currentBranch}
          branchStatus={branchStatus}
          onBranchSwitch={onBranchSwitch}
          pullingBranch={pullingBranch}
          onBranchSelect={onBranchSelect}
          selectedItem={selectedItem}
          collapsed={branchesCollapsed}
          onToggleCollapse={() => setBranchesCollapsed(!branchesCollapsed)}
          onContextMenu={onBranchContextMenu}
        />
      </div>
      {!branchesCollapsed && !remotesCollapsed && (
        <div
          className="splitter-handle"
          onMouseDown={() => onMouseDown(1)}
        >
          <div className="splitter-line"></div>
        </div>
      )}
      <div className={`split-panel remotes-panel ${remotesCollapsed ? 'collapsed' : ''}`}>
        <RemoteList
          remotes={remotes}
          onSelectRemoteBranch={onSelectRemoteBranch}
          selectedItem={selectedItem}
          collapsed={remotesCollapsed}
          onToggleCollapse={() => setRemotesCollapsed(!remotesCollapsed)}
          gitAdapter={gitAdapter}
        />
      </div>
      {!remotesCollapsed && !stashesCollapsed && (
        <div
          className="splitter-handle"
          onMouseDown={() => onMouseDown(2)}
        >
          <div className="splitter-line"></div>
        </div>
      )}
      <div className={`split-panel stashes-panel ${stashesCollapsed ? 'collapsed' : ''}`}>
        <StashList
          stashes={stashes}
          onSelectStash={(stash) => onSelectStash(stash)}
          selectedItem={selectedItem}
          collapsed={stashesCollapsed}
          onToggleCollapse={() => setStashesCollapsed(!stashesCollapsed)}
          onStashContextMenu={onStashContextMenu}
        />
      </div>
    </div>
  );
}

export default BranchStashPanel;