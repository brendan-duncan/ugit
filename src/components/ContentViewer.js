import React from 'react';
import LocalChangesPanel from './LocalChangesPanel';
import StashViewer from './StashViewer';
import BranchView from './BranchView';
import './ContentViewer.css';

function ContentViewer({ selectedItem, unstagedFiles, stagedFiles, repoPath, onRefresh }) {
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
          repoPath={repoPath}
          onRefresh={onRefresh}
        />
      )}
      {item.type === 'stash' && (
        <StashViewer
          stash={selectedItem.stash}
          stashIndex={selectedItem.index}
          repoPath={repoPath}
        />
      )}
      {item.type === 'branch' && (
        <BranchView
          branchName={selectedItem.branchName}
          commits={item.commits}
          loading={item.loading}
          repoPath={repoPath}
          onRefresh={onRefresh}
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
