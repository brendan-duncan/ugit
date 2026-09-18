import React, { useState } from 'react';
import BranchTree from './BranchTree';
import RemoteList from './RemoteList';
import StashList from './StashList';
import WorktreeList from './WorktreeList';
import SubmoduleList from './SubmoduleList';
import { SelectedItem, RemoteInfo } from './types';
import { GitAdapter, StashInfo, SubmoduleInfo, WorktreeInfo } from '../git/GitAdapter';

interface BranchStashPanelProps {
  branches: Array<string>;
  currentBranch: string;
  branchStatus: Record<string, any>;
  onBranchSwitch: (branchName: string) => void;
  pullingBranch: string | null;
  onBranchSelect: (branchName: string) => void;
  stashes: Array<StashInfo>;
  onSelectStash: (item: SelectedItem) => void;
  onStashDoubleClick?: (stashIndex: number) => void;
  selectedItem: SelectedItem | null;
  onMouseDown: (panelIndex: number) => void;
  onBranchContextMenu: (action: string, branchName: string, currentBranch: string) => void;
  onStashContextMenu: (action: string, stash: StashInfo, stashIndex: number) => void;
  remotes: Array<RemoteInfo>;
  onSelectRemoteBranch: (remoteBranch: SelectedItem) => void;
  gitAdapter: GitAdapter;
  onRemoteBranchAction: (action: string, remoteName: string, branchName: string, fullName: string) => void;
  onRemoteAdded?: () => void;
  lockedPatterns?: ReadonlyArray<string>;
  // Branch list ordering, and the dates the 'recent' ordering needs.
  branchSort?: 'name' | 'recent';
  branchDates?: Record<string, string>;
  onToggleSort?: () => void;
  worktrees: Array<WorktreeInfo>;
  submodules: Array<SubmoduleInfo>;
  onOpenSubmodule: (submodulePath: string) => void;
  onSubmoduleAction: (action: string, submodule: SubmoduleInfo | null) => void;
  onOpenWorktree: (worktreePath: string) => void;
  onAddWorktree: () => void;
  onWorktreeAction: (action: string, worktree: WorktreeInfo) => void;
  onAddBranch: () => void;
  onStashAll: () => void;
  canStash: boolean;
  originUrl?: string | null;
}

function BranchStashPanel({ branches, currentBranch, branchStatus, onBranchSwitch, pullingBranch,
      onBranchSelect, stashes, onSelectStash, onStashDoubleClick, selectedItem, onMouseDown, onBranchContextMenu, onStashContextMenu,
      remotes, onSelectRemoteBranch, gitAdapter, onRemoteBranchAction, onRemoteAdded, lockedPatterns,
      branchSort, branchDates, onToggleSort,
      worktrees, submodules, onOpenSubmodule, onSubmoduleAction,
      onOpenWorktree, onAddWorktree, onWorktreeAction, onAddBranch, onStashAll, canStash,
      originUrl }: BranchStashPanelProps) {
  const [branchesCollapsed, setBranchesCollapsed] = useState(false);
  const [worktreesCollapsed, setWorktreesCollapsed] = useState(false);
  const [remotesCollapsed, setRemotesCollapsed] = useState(false);
  const [stashesCollapsed, setStashesCollapsed] = useState(false);
  // Most repositories have no submodules, so that section starts out of the way.
  const [submodulesCollapsed, setSubmodulesCollapsed] = useState(true);

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
          stashes={stashes}
          lockedPatterns={lockedPatterns}
          sortMode={branchSort}
          branchDates={branchDates}
          onToggleSort={onToggleSort}
          onAddBranch={onAddBranch}
          originUrl={originUrl}
        />
      </div>
      {!branchesCollapsed && !worktreesCollapsed && (
        <div
          className="splitter-handle"
          onMouseDown={() => onMouseDown(1)}
        >
          <div className="splitter-line"></div>
        </div>
      )}
      <div className={`split-panel worktrees-panel ${worktreesCollapsed ? 'collapsed' : ''}`}>
        <WorktreeList
          worktrees={worktrees}
          collapsed={worktreesCollapsed}
          onToggleCollapse={() => setWorktreesCollapsed(!worktreesCollapsed)}
          onOpenWorktree={onOpenWorktree}
          onAddWorktree={onAddWorktree}
          onWorktreeAction={onWorktreeAction}
        />
      </div>
      {submodules && submodules.length > 0 && (
        <div className={`split-panel submodules-panel ${submodulesCollapsed ? 'collapsed' : ''}`}>
          <SubmoduleList
            submodules={submodules}
            collapsed={submodulesCollapsed}
            onToggleCollapse={() => setSubmodulesCollapsed(!submodulesCollapsed)}
            onOpenSubmodule={onOpenSubmodule}
            onSubmoduleAction={onSubmoduleAction}
          />
        </div>
      )}
      {!worktreesCollapsed && !remotesCollapsed && (
        <div
          className="splitter-handle"
          onMouseDown={() => onMouseDown(2)}
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
          onMouseDown={() => onMouseDown(3)}
        >
          <div className="splitter-line"></div>
        </div>
      )}
      <div className={`split-panel stashes-panel ${stashesCollapsed ? 'collapsed' : ''}`}>
        <StashList
          stashes={stashes}
          onSelectStash={(stash) => onSelectStash(stash)}
          onDoubleClick={onStashDoubleClick}
          selectedItem={selectedItem}
          collapsed={stashesCollapsed}
          onToggleCollapse={() => setStashesCollapsed(!stashesCollapsed)}
          onStashContextMenu={onStashContextMenu}
          onStashAll={onStashAll}
          canStash={canStash}
        />
      </div>
    </div>
  );
}

export default BranchStashPanel;