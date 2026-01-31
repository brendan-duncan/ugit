import React, { useState, useRef } from 'react';
import CommitList from './CommitList';
import CommitInfo from './CommitInfo';
import { Commit } from '../git/GitAdapter';
import GitAdapter from '../git/GitAdapter';
import './BranchView.css';

interface BranchViewProps {
  branchName: string;
  commits: Array<Commit>;
  loading: boolean;
  gitAdapter: GitAdapter;
  onRefresh: () => void;
  onContextMenu: (action: string, commit: Commit, currentBranch: string) => void;
  currentBranch: string;
}

function BranchView({ branchName, commits, loading, gitAdapter, onRefresh, onContextMenu, currentBranch }: BranchViewProps) {
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [commitFiles, setCommitFiles] = useState([]);
  const [topHeight, setTopHeight] = useState(60);
  const activeSplitter = useRef(null);

  const handleMouseDown = () => {
    activeSplitter.current = true;
  };

  const handleMouseUp = () => {
    activeSplitter.current = null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeSplitter.current === null)
      return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const mouseY = ((e.clientY - rect.top) / rect.height) * 100;

    if (mouseY >= 30 && mouseY <= 80) {
      setTopHeight(mouseY);
    }
  };

  const handleCommitSelect = async (commit: Commit | null) => {
    setSelectedCommit(commit);
    setCommitFiles([]);

    if (!commit)
      return;

    try {
      const files = await gitAdapter.getCommitFiles(commit.hash);
      setCommitFiles(files);
    } catch (error) {
      console.error('Error loading commit files:', error);
      setCommitFiles([]);
    }
  };

  return (
    <div
      className="branch-view"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="branch-view-header">
        <h3>Branch: {branchName}</h3>
      </div>

      {loading ? (
        <div className="branch-view-loading">
          <span className="branch-view-loading-spinner">↻</span>
          <span>Loading...</span>
        </div>
      ) : (
        <div className="branch-view-content">
          <div className="branch-view-top-panel" style={{ height: `${topHeight}%` }}>
            <CommitList
              commits={commits}
              selectedCommit={selectedCommit}
              onSelectCommit={handleCommitSelect}
              onContextMenu={onContextMenu}
              currentBranch={currentBranch}
            />
          </div>

          <div
            className="branch-view-splitter"
            onMouseDown={handleMouseDown}
          >
            <div className="branch-view-splitter-line"></div>
          </div>

          <div className="branch-view-bottom-panel" style={{ height: `${100 - topHeight}%` }}>
            <CommitInfo commit={selectedCommit} files={commitFiles} gitAdapter={gitAdapter} />
          </div>
        </div>
      )}
    </div>
  );
}

export default BranchView;
