import React, { useState, useEffect, useRef } from 'react';
import simpleGit from 'simple-git';
import ChangesList from './ChangesList';
import BranchTree from './BranchTree';
import StashList from './StashList';
import ContentViewer from './ContentViewer';
import Toolbar from './Toolbar';
import PullDialog from './PullDialog';
import PushDialog from './PushDialog';
import './RepositoryView.css';

function RepositoryView({ repoPath }) {
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [branchStatus, setBranchStatus] = useState({});
  const [stashes, setStashes] = useState([]);
  const [modifiedCount, setModifiedCount] = useState(0);
  const [unstagedFiles, setUnstagedFiles] = useState([]);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [topHeight, setTopHeight] = useState(20);
  const [middleHeight, setMiddleHeight] = useState(40);
  const [leftWidth, setLeftWidth] = useState(30);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const activeSplitter = useRef(null);

  const loadRepoData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const git = simpleGit(repoPath);

      // Get current branch and modified files
      const status = await git.status();
      setCurrentBranch(status.current);

      // Parse files using status.files array for accurate staging info
      const unstaged = [];
      const staged = [];

      status.files.forEach(file => {
        const getStatusType = (code) => {
          switch (code) {
            case 'M': return 'modified';
            case 'A': return 'created';
            case 'D': return 'deleted';
            case 'R': return 'renamed';
            case '?': return 'created';
            default: return 'modified';
          }
        };

        // Check if file has unstaged changes (working_dir is not empty/space)
        if (file.working_dir && file.working_dir !== ' ') {
          unstaged.push({
            path: file.path,
            status: getStatusType(file.working_dir)
          });
        }

        // Check if file has staged changes (index is not empty/space)
        if (file.index && file.index !== ' ' && file.index !== '?') {
          staged.push({
            path: file.path,
            status: getStatusType(file.index)
          });
        }
      });

      setUnstagedFiles(unstaged);
      setStagedFiles(staged);

      // Count total modified files (unique paths)
      const allPaths = new Set([...unstaged.map(f => f.path), ...staged.map(f => f.path)]);
      setModifiedCount(allPaths.size);

      // Get all local branches
      const branchSummary = await git.branchLocal();
      const branchNames = branchSummary.all;
      setBranches(branchNames);

      // Get ahead/behind status for each branch
      const statusMap = {};
      for (const branchName of branchNames) {
        try {
          // Check if branch has a remote tracking branch
          const result = await git.raw(['rev-list', '--left-right', '--count', `${branchName}...origin/${branchName}`]);
          const [ahead, behind] = result.trim().split('\t').map(Number);

          if (ahead > 0 || behind > 0) {
            statusMap[branchName] = { ahead, behind };
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch, skip it
        }
      }
      setBranchStatus(statusMap);

      // Get stashes
      const stashList = await git.stashList();
      setStashes(stashList.all);

      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error loading repo data:', err);
      setError(err.message);
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadRepoData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load once on mount - component instance is tied to a specific repo

  const refreshFileStatus = async () => {
    try {
      const git = simpleGit(repoPath);

      // Get current branch and modified files
      const status = await git.status();
      setCurrentBranch(status.current);

      // Parse files using status.files array for accurate staging info
      const unstaged = [];
      const staged = [];

      status.files.forEach(file => {
        const getStatusType = (code) => {
          switch (code) {
            case 'M': return 'modified';
            case 'A': return 'created';
            case 'D': return 'deleted';
            case 'R': return 'renamed';
            case '?': return 'created';
            default: return 'modified';
          }
        };

        // Check if file has unstaged changes (working_dir is not empty/space)
        if (file.working_dir && file.working_dir !== ' ') {
          unstaged.push({
            path: file.path,
            status: getStatusType(file.working_dir)
          });
        }

        // Check if file has staged changes (index is not empty/space)
        if (file.index && file.index !== ' ' && file.index !== '?') {
          staged.push({
            path: file.path,
            status: getStatusType(file.index)
          });
        }
      });

      setUnstagedFiles(unstaged);
      setStagedFiles(staged);

      // Count total modified files (unique paths)
      const allPaths = new Set([...unstaged.map(f => f.path), ...staged.map(f => f.path)]);
      setModifiedCount(allPaths.size);
    } catch (err) {
      console.error('Error refreshing file status:', err);
    }
  };

  const handleRefreshClick = async () => {
    await loadRepoData(true);
  };

  const handleMouseDown = (splitterIndex) => {
    activeSplitter.current = splitterIndex;
  };

  const handleMouseUp = () => {
    activeSplitter.current = null;
  };

  const handleMouseMove = (e) => {
    if (activeSplitter.current === null) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();

    if (activeSplitter.current === 'horizontal') {
      // Horizontal splitter - adjusts left/right panels
      const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
      if (mouseX >= 20 && mouseX <= 50) {
        setLeftWidth(mouseX);
      }
    } else {
      // Vertical splitters in left panel
      const mouseY = ((e.clientY - rect.top) / rect.height) * 100;

      if (activeSplitter.current === 0) {
        // First splitter - adjusts top panel
        if (mouseY >= 10 && mouseY <= 60) {
          setTopHeight(mouseY);
        }
      } else if (activeSplitter.current === 1) {
        // Second splitter - adjusts middle panel
        const minMiddleStart = topHeight + 10;
        const maxMiddleEnd = 90;
        if (mouseY >= minMiddleStart && mouseY <= maxMiddleEnd) {
          setMiddleHeight(mouseY - topHeight);
        }
      }
    }
  };

  const handleFetchClick = async () => {
    try {
      const git = simpleGit(repoPath);

      console.log('Fetching from origin...');
      await git.fetch('origin');
      console.log('Fetch completed successfully');

      // Refresh branch status after fetch
      const statusMap = {};
      for (const branchName of branches) {
        try {
          const result = await git.raw(['rev-list', '--left-right', '--count', `${branchName}...origin/${branchName}`]);
          const [ahead, behind] = result.trim().split('\t').map(Number);
          if (ahead > 0 || behind > 0) {
            statusMap[branchName] = { ahead, behind };
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch
        }
      }
      setBranchStatus(statusMap);

    } catch (error) {
      console.error('Error during fetch:', error);
      setError(`Fetch failed: ${error.message}`);
    }
  };

  const handlePullClick = () => {
    setShowPullDialog(true);
  };

  const handlePushClick = () => {
    setShowPushDialog(true);
  };

  const handlePull = async (branch, stashAndReapply) => {
    setShowPullDialog(false);

    try {
      const git = simpleGit(repoPath);
      let stashCreated = false;
      let stashMessage = '';

      // Stash local changes if requested
      if (stashAndReapply && (unstagedFiles.length > 0 || stagedFiles.length > 0)) {
        stashMessage = `Auto-stash before pull at ${new Date().toISOString()}`;
        await git.stash(['push', '-m', stashMessage]);
        stashCreated = true;
        console.log('Created stash before pull');
      }

      // Perform git pull
      console.log(`Pulling from origin/${branch}...`);
      await git.pull('origin', branch);
      console.log('Pull completed successfully');

      // Reapply stash if it was created
      if (stashCreated) {
        try {
          await git.stash(['pop']);
          console.log('Stash applied and removed successfully');
        } catch (error) {
          console.error('Failed to apply stash, leaving it in stash list:', error);
          // Stash will remain in the list for manual resolution
        }
      }

      // Refresh all data after pull
      const status = await git.status();
      setCurrentBranch(status.current);

      // Refresh file status
      await refreshFileStatus();

      // Refresh stashes
      const stashList = await git.stashList();
      setStashes(stashList.all);

      // Refresh branch status
      const statusMap = {};
      for (const branchName of branches) {
        try {
          const result = await git.raw(['rev-list', '--left-right', '--count', `${branchName}...origin/${branchName}`]);
          const [ahead, behind] = result.trim().split('\t').map(Number);
          if (ahead > 0 || behind > 0) {
            statusMap[branchName] = { ahead, behind };
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch
        }
      }
      setBranchStatus(statusMap);

    } catch (error) {
      console.error('Error during pull:', error);
      setError(`Pull failed: ${error.message}`);
    }
  };

  const handlePush = async (branch, remoteBranch, pushAllTags) => {
    setShowPushDialog(false);

    try {
      const git = simpleGit(repoPath);

      console.log(`Pushing ${branch} to origin/${remoteBranch}...`);

      if (pushAllTags) {
        await git.push('origin', `${branch}:${remoteBranch}`, ['--tags']);
        console.log('Push with tags completed successfully');
      } else {
        await git.push('origin', `${branch}:${remoteBranch}`);
        console.log('Push completed successfully');
      }

      // Refresh branch status after push
      const statusMap = {};
      for (const branchName of branches) {
        try {
          const result = await git.raw(['rev-list', '--left-right', '--count', `${branchName}...origin/${branchName}`]);
          const [ahead, behind] = result.trim().split('\t').map(Number);
          if (ahead > 0 || behind > 0) {
            statusMap[branchName] = { ahead, behind };
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch
        }
      }
      setBranchStatus(statusMap);

    } catch (error) {
      console.error('Error during push:', error);
      setError(`Push failed: ${error.message}`);
    }
  };

  return (
    <div className="repository-view">
      <div className="repo-header">
        <h2>{repoPath}</h2>
        {currentBranch && (
          <p className="repo-status">Current branch: <strong>{currentBranch}</strong></p>
        )}
      </div>
      <Toolbar onRefresh={handleRefreshClick} onFetch={handleFetchClick} onPull={handlePullClick} onPush={handlePushClick} refreshing={refreshing} />
      <div
        className="repo-content-horizontal"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && <div className="loading">Loading repository...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && (
          <>
            <div className="repo-sidebar" style={{ width: `${leftWidth}%` }}>
              <div className="split-panel top-panel" style={{ height: `${topHeight}%` }}>
                <ChangesList
                  modifiedCount={modifiedCount}
                  selectedItem={selectedItem}
                  onSelectItem={setSelectedItem}
                />
              </div>
              <div
                className="splitter-handle"
                onMouseDown={() => handleMouseDown(0)}
              >
                <div className="splitter-line"></div>
              </div>
              <div className="split-panel middle-panel" style={{ height: `${middleHeight}%` }}>
                <BranchTree branches={branches} currentBranch={currentBranch} branchStatus={branchStatus} />
              </div>
              <div
                className="splitter-handle"
                onMouseDown={() => handleMouseDown(1)}
              >
                <div className="splitter-line"></div>
              </div>
              <div className="split-panel bottom-panel" style={{ height: `${100 - topHeight - middleHeight}%` }}>
                <StashList
                  stashes={stashes}
                  onSelectStash={(stash, index) => setSelectedItem({ type: 'stash', stash, index })}
                  selectedItem={selectedItem}
                />
              </div>
            </div>
            <div
              className="horizontal-splitter-handle"
              onMouseDown={() => handleMouseDown('horizontal')}
            >
              <div className="horizontal-splitter-line"></div>
            </div>
            <div className="repo-content-viewer" style={{ width: `${100 - leftWidth}%` }}>
              <ContentViewer
                selectedItem={selectedItem}
                unstagedFiles={unstagedFiles}
                stagedFiles={stagedFiles}
                repoPath={repoPath}
                onRefresh={refreshFileStatus}
              />
            </div>
          </>
        )}
      </div>
      {showPullDialog && (
        <PullDialog
          onClose={() => setShowPullDialog(false)}
          onPull={handlePull}
          branches={branches}
          currentBranch={currentBranch}
        />
      )}
      {showPushDialog && (
        <PushDialog
          onClose={() => setShowPushDialog(false)}
          onPush={handlePush}
          branches={branches}
          currentBranch={currentBranch}
        />
      )}
    </div>
  );
}

export default RepositoryView;
