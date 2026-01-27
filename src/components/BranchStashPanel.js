import React, { useState } from 'react';
import BranchTree from './BranchTree';
import StashList from './StashList';

function BranchStashPanel({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, stashes, onSelectStash, selectedItem, onMouseDown, onBranchContextMenu }) {
  const [branchesCollapsed, setBranchesCollapsed] = useState(false);
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
      {!branchesCollapsed && !stashesCollapsed && (
        <div
          className="splitter-handle"
          onMouseDown={() => onMouseDown(1)}
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
        />
      </div>
    </div>
  );
}

export default BranchStashPanel;