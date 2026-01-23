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

  return (
    <div className="content-viewer">
      {selectedItem.type === 'local-changes' && (
        <LocalChangesPanel
          unstagedFiles={unstagedFiles}
          stagedFiles={stagedFiles}
          repoPath={repoPath}
          onRefresh={onRefresh}
        />
      )}
      {selectedItem.type === 'stash' && (
        <StashViewer
          stash={selectedItem.stash}
          stashIndex={selectedItem.index}
          repoPath={repoPath}
        />
      )}
      {selectedItem.type === 'branch' && (
        <BranchView
          branchName={selectedItem.branchName}
          commits={selectedItem.commits}
          repoPath={repoPath}
          onRefresh={onRefresh}
        />
      )}
      {selectedItem.type !== 'local-changes' && selectedItem.type !== 'stash' && selectedItem.type !== 'branch' && (
        <div className="content-viewer-placeholder">
          <p>Content for "{selectedItem.type}" will be displayed here</p>
        </div>
      )}
    </div>
  );
}

export default ContentViewer;
