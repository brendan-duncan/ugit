import React from 'react';
import LocalChangesPanel from './LocalChangesPanel';
import StashViewer from './StashViewer';
import BranchView from './BranchView';
import { GitAdapter, Commit } from '../git/GitAdapter';
import { FileInfo } from './types';
import './ContentViewer.css';

interface ContentViewerProps {
  selectedItem: any; // Could be more specifically typed based on your app's types
  unstagedFiles: Array<FileInfo>;
  stagedFiles: Array<FileInfo>;
  gitAdapter: GitAdapter;
  onRefresh: () => Promise<void>;
  onContextMenu: (action: string, commit: Commit, currentBranch: string) => Promise<void>;
  currentBranch: string;
  branchStatus: { [branchName: string]: { ahead: number; behind: number } };
  onError?: (error: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onBusyMessageChange?: (message: string) => void;
  onCommitCreated?: () => void;
}

function ContentViewer({ selectedItem, unstagedFiles, stagedFiles, gitAdapter, onRefresh, onContextMenu, currentBranch, branchStatus, onError, onBusyChange, onBusyMessageChange, onCommitCreated }: ContentViewerProps): React.ReactElement {
  if (!selectedItem) {
    return (
      <div className="content-viewer">
        <div className="content-viewer-empty">
          <p>Select an item from the left panel to view its contents</p>
        </div>
      </div>
    );
  }

  // Handle case where only type is provided (for restored state)
  const item = selectedItem.type && !selectedItem.stash && !selectedItem.commits ? 
    { type: selectedItem.type } : selectedItem;

  return (
    <div className="content-viewer">
      {item.type === 'local-changes' && (
        <LocalChangesPanel
          unstagedFiles={unstagedFiles}
          stagedFiles={stagedFiles}
          gitAdapter={gitAdapter}
          onRefresh={onRefresh}
          currentBranch={currentBranch}
          branchStatus={branchStatus}
          onError={onError}
          onBusyChange={onBusyChange}
          onBusyMessageChange={onBusyMessageChange}
          onCommitCreated={onCommitCreated}
        />
      )}
      {item.type === 'stash' && selectedItem.stash && (
        <StashViewer
          stash={selectedItem.stash}
          stashIndex={selectedItem.index}
          gitAdapter={gitAdapter}
        />
      )}
      {item.type === 'branch' && (
        <BranchView
          branchName={selectedItem.branchName}
          commits={item.commits}
          loading={item.loading}
          gitAdapter={gitAdapter}
          onRefresh={onRefresh}
          onContextMenu={onContextMenu}
          currentBranch={currentBranch}
        />
      )}
      {item.type === 'remote-branch' && (
        <BranchView
          branchName={selectedItem.fullName || `${selectedItem.remoteName}/${selectedItem.branchName}`}
          commits={item.commits || []}
          loading={item.loading || false}
          gitAdapter={gitAdapter}
          onRefresh={onRefresh}
          onContextMenu={onContextMenu}
          currentBranch={currentBranch}
        />
      )}
      {item.type !== 'local-changes' && item.type !== 'stash' && item.type !== 'branch' && item.type !== 'remote-branch' && (
        <div className="content-viewer-placeholder">
          <p>Content for "{item.type}" will be displayed here</p>
        </div>
      )}
    </div>
  );
}

export default ContentViewer;
