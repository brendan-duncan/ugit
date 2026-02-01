import React, { useState } from 'react';
import BranchTree from './BranchTree';
import RemoteList from './RemoteList';
import StashList from './StashList';
import { SelectedItem, RemoteInfo } from './types';
import { GitAdapter, StashInfo } from '../git/GitAdapter';

interface BranchStashPanelProps {
  branches: Array<string>;
  currentBranch: string;
  branchStatus: Record<string, any>;
  onBranchSwitch: (branchName: string) => void;
  pullingBranch: string | null;
  onBranchSelect: (branchName: string) => void;
  stashes: Array<StashInfo>;
  onSelectStash: (item: SelectedItem) => void;
  selectedItem: SelectedItem | null;
  onMouseDown: (panelIndex: number) => void;
  onBranchContextMenu: (action: string, branchName: string, currentBranch: string) => void;
  onStashContextMenu: (action: string, stash: StashInfo, stashIndex: number) => void;
  remotes: Array<RemoteInfo>;
  onSelectRemoteBranch: (remoteBranch: SelectedItem) => void;
  gitAdapter: GitAdapter;
  onRemoteBranchAction: (action: string, remoteName: string, branchName: string, fullName: string) => void;
  onRemoteAdded?: () => void;
}

function BranchStashPanel({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch,
      onBranchSelect, stashes, onSelectStash, selectedItem, onMouseDown, onBranchContextMenu, onStashContextMenu,
      remotes, onSelectRemoteBranch, gitAdapter, onRemoteBranchAction, onRemoteAdded }: BranchStashPanelProps) {
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
          onRemoteBranchAction={onRemoteBranchAction}
          currentBranch={currentBranch}
          onRemoteAdded={onRemoteAdded}
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