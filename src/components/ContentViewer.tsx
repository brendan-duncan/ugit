import React from 'react';
import LocalChangesPanel from './LocalChangesPanel';
import StashViewer from './StashViewer';
import BranchView from './BranchView';
import './ContentViewer.css';

function ContentViewer({ selectedItem, unstagedFiles, stagedFiles, gitAdapter, onRefresh, onContextMenu, currentBranch }) {
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
      {item.type !== 'local-changes' && item.type !== 'stash' && item.type !== 'branch' && (
        <div className="content-viewer-placeholder">
          <p>Content for "{item.type}" will be displayed here</p>
        </div>
      )}
    </div>
  );
}

export default ContentViewer;
