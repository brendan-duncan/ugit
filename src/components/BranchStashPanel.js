import React, { useState } from 'react';
import BranchTree from './BranchTree';
import StashList from './StashList';

function BranchStashPanel({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, selectedBranch, stashes, onSelectStash, selectedItem, onMouseDown }) {
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
          selectedBranch={selectedBranch}
          collapsed={branchesCollapsed}
          onToggleCollapse={() => setBranchesCollapsed(!branchesCollapsed)}
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
          onSelectStash={(stash, index) => onSelectStash({ type: 'stash', stash, index })}
          selectedItem={selectedItem}
          collapsed={stashesCollapsed}
          onToggleCollapse={() => setStashesCollapsed(!stashesCollapsed)}
        />
      </div>
    </div>
  );
}

export default BranchStashPanel;