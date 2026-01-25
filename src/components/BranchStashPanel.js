import React from 'react';
import BranchTree from './BranchTree';
import StashList from './StashList';

function BranchStashPanel({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch, onBranchSelect, selectedBranch, stashes, onSelectStash, selectedItem, onMouseDown }) {
  return (
    <div className="branch-stash-panel">
      <div className="split-panel branches-panel">
        <BranchTree 
          branches={branches} 
          currentBranch={currentBranch} 
          branchStatus={branchStatus} 
          onBranchSwitch={onBranchSwitch} 
          pullingBranch={pullingBranch} 
          onBranchSelect={onBranchSelect} 
          selectedBranch={selectedBranch} 
        />
      </div>
      <div
        className="splitter-handle"
        onMouseDown={() => onMouseDown(1)}
      >
        <div className="splitter-line"></div>
      </div>
      <div className="split-panel stashes-panel">
        <StashList
          stashes={stashes}
          onSelectStash={(stash, index) => onSelectStash({ type: 'stash', stash, index })}
          selectedItem={selectedItem}
        />
      </div>
    </div>
  );
}

export default BranchStashPanel;