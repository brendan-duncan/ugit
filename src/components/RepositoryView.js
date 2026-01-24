import React, { useState, useEffect, useRef } from 'react';
import ChangesList from './ChangesList';
import BranchTree from './BranchTree';
import StashList from './StashList';
import ContentViewer from './ContentViewer';
import Toolbar from './Toolbar';
import PullDialog from './PullDialog';
import PushDialog from './PushDialog';
import StashDialog from './StashDialog';
import './RepositoryView.css';

const GitFactory = window.require('./src/git/GitFactory');
const { ipcRenderer } = window.require('electron');
const cacheManager = window.require('./src/utils/cacheManager');

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
  const [usingCache, setUsingCache] = useState(false);
  const [topHeight, setTopHeight] = useState(12);
  const [middleHeight, setMiddleHeight] = useState(48);
  const [leftWidth, setLeftWidth] = useState(30);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [showStashDialog, setShowStashDialog] = useState(false);
  const [pullingBranch, setPullingBranch] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const activeSplitter = useRef(null);
  const gitAdapter = useRef(null);
  const hasLoadedCache = useRef(false);
  const cacheInitialized = useRef(false);
  const currentBranchLoadId = useRef(0);

  // Initialize cache manager with user data path
  useEffect(() => {
    const initCache = async () => {
      if (!cacheInitialized.current) {
        const userDataPath = await ipcRenderer.invoke('get-user-data-path');
        cacheManager.setCacheDir(userDataPath);
        cacheInitialized.current = true;
      }
    };
    initCache();
  }, []);

  const loadRepoData = async (isRefresh = false) => {
    try {
      // Wait for cache to be initialized
      while (!cacheInitialized.current) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Load from cache first on initial load
      if (!isRefresh && !hasLoadedCache.current) {
        const cachedData = cacheManager.loadCache(repoPath);
        if (cachedData) {
          // Apply cached data immediately
          setCurrentBranch(cachedData.currentBranch || '');
          setUnstagedFiles(cachedData.unstagedFiles || []);
          setStagedFiles(cachedData.stagedFiles || []);
          setModifiedCount(cachedData.modifiedCount || 0);
          setBranches(cachedData.branches || []);
          setBranchStatus(cachedData.branchStatus || {});
          setStashes(cachedData.stashes || []);
          setUsingCache(true);
          setLoading(false);
          hasLoadedCache.current = true;

          // Continue loading fresh data in background
          setTimeout(() => loadRepoData(true), 100);
          return;
        }
        hasLoadedCache.current = true;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setUsingCache(false);

      // Initialize git adapter if needed
      if (!gitAdapter.current) {
        const backend = await ipcRenderer.invoke('get-git-backend');
        gitAdapter.current = await GitFactory.createAdapter(repoPath, backend);
      }
      const git = gitAdapter.current;

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

      // Get ahead/behind status for each branch (parallel)
      const statusPromises = branchNames.map(async (branchName) => {
        try {
          // Check if branch has a remote tracking branch
          const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);

          if (ahead > 0 || behind > 0) {
            return { branchName, ahead, behind };
          } else {
            // Branch is in sync, don't include in status
            return null;
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch, skip it
          return null;
        }
      });

      const statusResults = await Promise.all(statusPromises);
      const statusMap = {};
      statusResults.forEach(result => {
        if (result) {
          statusMap[result.branchName] = { ahead: result.ahead, behind: result.behind };
        }
      });
      setBranchStatus(statusMap);

      // Get stashes
      const stashList = await git.stashList();
      setStashes(stashList.all);

      // Save to cache
      cacheManager.saveCache(repoPath, {
        currentBranch: status.current,
        unstagedFiles: unstaged,
        stagedFiles: staged,
        modifiedCount: allPaths.size,
        branches: branchNames,
        branchStatus: statusMap,
        stashes: stashList.all
      });

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

  // Periodic background check for local changes
  useEffect(() => {
    // Don't start checking until initial load is complete
    if (loading) return;

    // Check for changes every 5 seconds
    const intervalId = setInterval(() => {
      // Silently refresh file status in the background
      refreshFileStatus();
    }, 5000);

    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [loading]); // Re-run if loading state changes

  const refreshFileStatus = async () => {
    try {
      const git = gitAdapter.current;

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
      const git = gitAdapter.current;

      console.log('Fetching from origin...');
      await git.fetch('origin');
      console.log('Fetch completed successfully');

      // Refresh branch status after fetch (parallel, update UI incrementally)
      branches.forEach(async (branchName) => {
        try {
          const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);
          if (ahead > 0 || behind > 0) {
            setBranchStatus(prev => ({
              ...prev,
              [branchName]: { ahead, behind }
            }));
          } else {
            // Remove status if branch is now in sync
            setBranchStatus(prev => {
              const newStatus = { ...prev };
              delete newStatus[branchName];
              return newStatus;
            });
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch
          // Remove status for this branch
          setBranchStatus(prev => {
            const newStatus = { ...prev };
            delete newStatus[branchName];
            return newStatus;
          });
        }
      });

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
    setPullingBranch(branch);

    try {
      const git = gitAdapter.current;
      let stashCreated = false;
      let stashMessage = '';

      // Stash local changes if requested
      if (stashAndReapply && (unstagedFiles.length > 0 || stagedFiles.length > 0)) {
        stashMessage = `Auto-stash before pull at ${new Date().toISOString()}`;
        await git.stashPush(stashMessage);
        stashCreated = true;
        console.log('Created stash before pull');
      }

      // Perform git pull
      console.log(`Pulling from origin/${branch}...`);
      await git.pull('origin', branch);
      console.log('Pull completed successfully');

      // Clear pulling indicator immediately after pull completes
      setPullingBranch(null);

      // Reapply stash if it was created
      if (stashCreated) {
        try {
          await git.stashPop();
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

      // Refresh branch status (parallel, update UI incrementally)
      branches.forEach(async (branchName) => {
        try {
          const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);
          if (ahead > 0 || behind > 0) {
            setBranchStatus(prev => ({
              ...prev,
              [branchName]: { ahead, behind }
            }));
          } else {
            // Remove status if branch is now in sync
            setBranchStatus(prev => {
              const newStatus = { ...prev };
              delete newStatus[branchName];
              return newStatus;
            });
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch
          // Remove status for this branch
          setBranchStatus(prev => {
            const newStatus = { ...prev };
            delete newStatus[branchName];
            return newStatus;
          });
        }
      });

    } catch (error) {
      console.error('Error during pull:', error);
      setError(`Pull failed: ${error.message}`);
      setPullingBranch(null);
    }
  };

  const handlePush = async (branch, remoteBranch, pushAllTags) => {
    setShowPushDialog(false);

    try {
      const git = gitAdapter.current;

      console.log(`Pushing ${branch} to origin/${remoteBranch}...`);

      if (pushAllTags) {
        await git.push('origin', `${branch}:${remoteBranch}`, ['--tags']);
        console.log('Push with tags completed successfully');
      } else {
        await git.push('origin', `${branch}:${remoteBranch}`);
        console.log('Push completed successfully');
      }

      // Refresh branch status after push (parallel, update UI incrementally)
      branches.forEach(async (branchName) => {
        try {
          const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);
          if (ahead > 0 || behind > 0) {
            setBranchStatus(prev => ({
              ...prev,
              [branchName]: { ahead, behind }
            }));
          } else {
            // Remove status if branch is now in sync
            setBranchStatus(prev => {
              const newStatus = { ...prev };
              delete newStatus[branchName];
              return newStatus;
            });
          }
        } catch (error) {
          // Branch doesn't have a remote tracking branch
          // Remove status for this branch
          setBranchStatus(prev => {
            const newStatus = { ...prev };
            delete newStatus[branchName];
            return newStatus;
          });
        }
      });

    } catch (error) {
      console.error('Error during push:', error);
      setError(`Push failed: ${error.message}`);
    }
  };

  const handleBranchSwitch = async (branchName) => {
    try {
      const git = gitAdapter.current;

      console.log(`Switching to branch: ${branchName}`);
      await git.checkoutBranch(branchName);
      console.log('Branch switch completed successfully');

      // Refresh all data after branch switch
      await loadRepoData(true);
    } catch (error) {
      console.error('Error switching branch:', error);
      setError(`Branch switch failed: ${error.message}`);
    }
  };

  const handleItemSelect = (item) => {
    // If switching away from a branch, cancel any pending branch loads
    if (item.type !== 'branch') {
      currentBranchLoadId.current += 1;
    }
    setSelectedItem(item);
  };

  const handleBranchSelect = async (branchName) => {
    // Increment load ID to cancel any pending requests
    currentBranchLoadId.current += 1;
    const thisLoadId = currentBranchLoadId.current;

    try {
      const git = gitAdapter.current;
      setSelectedBranch(branchName);

      // Set loading state immediately
      setSelectedItem({
        type: 'branch',
        branchName,
        commits: [],
        loading: true
      });

      console.log(`Loading commits for branch: ${branchName}`);
      const commits = await git.log(branchName);

      // Only update state if this request is still current
      if (thisLoadId === currentBranchLoadId.current) {
        setSelectedItem({
          type: 'branch',
          branchName,
          commits,
          loading: false
        });
      }
    } catch (error) {
      console.error('Error loading branch commits:', error);

      // Only update error state if this request is still current
      if (thisLoadId === currentBranchLoadId.current) {
        setError(`Failed to load commits: ${error.message}`);
        setSelectedItem({
          type: 'branch',
          branchName,
          commits: [],
          loading: false
        });
      }
    }
  };

  const handleStashClick = () => {
    setShowStashDialog(true);
  };

  const handleStash = async (message, stageNewFiles) => {
    setShowStashDialog(false);

    try {
      const git = gitAdapter.current;

      // If stageNewFiles is checked, stage all new (untracked) files
      if (stageNewFiles) {
        // Find files that are new (created) and unstaged
        const newFiles = unstagedFiles.filter(file => file.status === 'created');

        if (newFiles.length > 0) {
          console.log(`Staging ${newFiles.length} new files before stash...`);
          await git.add(newFiles.map(f => f.path));
        }
      }

      // Create stash with optional message
      const stashMessage = message || `Stash created at ${new Date().toISOString()}`;
      console.log(`Creating stash: ${stashMessage}`);
      await git.stashPush(stashMessage);
      console.log('Stash created successfully');

      // Refresh file status and stashes
      await refreshFileStatus();
      const stashList = await git.stashList();
      setStashes(stashList.all);

    } catch (error) {
      console.error('Error creating stash:', error);
      setError(`Stash failed: ${error.message}`);
    }
  };

  const hasLocalChanges = unstagedFiles.length > 0 || stagedFiles.length > 0;

  return (
    <div className="repository-view">
      <Toolbar onRefresh={handleRefreshClick} onFetch={handleFetchClick} onPull={handlePullClick} onPush={handlePushClick} onStash={hasLocalChanges ? handleStashClick : null} refreshing={refreshing} />
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
                  repoPath={repoPath}
                  currentBranch={currentBranch}
                  modifiedCount={modifiedCount}
                  selectedItem={selectedItem}
                  onSelectItem={handleItemSelect}
                  usingCache={usingCache}
                />
              </div>
              <div
                className="splitter-handle"
                onMouseDown={() => handleMouseDown(0)}
              >
                <div className="splitter-line"></div>
              </div>
              <div className="split-panel middle-panel" style={{ height: `${middleHeight}%` }}>
                <BranchTree branches={branches} currentBranch={currentBranch} branchStatus={branchStatus} onBranchSwitch={handleBranchSwitch} pullingBranch={pullingBranch} onBranchSelect={handleBranchSelect} selectedBranch={selectedBranch} />
              </div>
              <div
                className="splitter-handle"
                onMouseDown={() => handleMouseDown(1)}
              >
                <div className="splitter-line"></div>
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
                  onSelectStash={(stash, index) => handleItemSelect({ type: 'stash', stash, index })}
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
      {showStashDialog && (
        <StashDialog
          onClose={() => setShowStashDialog(false)}
          onStash={handleStash}
        />
      )}
    </div>
  );
}

export default RepositoryView;
