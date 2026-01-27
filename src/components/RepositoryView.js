import React, { useState, useEffect, useRef } from 'react';
import RepoInfo from './RepoInfo';
import BranchStashPanel from './BranchStashPanel';
import ErrorDialog from './ErrorDialog';
import CreateBranchDialog from './CreateBranchDialog';
import ContentViewer from './ContentViewer';
import Toolbar from './Toolbar';
import PullDialog from './PullDialog';
import PushDialog from './PushDialog';
import StashDialog from './StashDialog';
import ResetToOriginDialog from './ResetToOriginDialog';
import LocalChangesDialog from './LocalChangesDialog';
import './RepositoryView.css';

const GitFactory = window.require('./src/git/GitFactory');
const { ipcRenderer } = window.require('electron');
const cacheManager = window.require('./src/utils/cacheManager');

function RepositoryView({ repoPath }) {
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [branchStatus, setBranchStatus] = useState({});
  const [originUrl, setOriginUrl] = useState('');
  const [stashes, setStashes] = useState([]);
  const [modifiedCount, setModifiedCount] = useState(0);
  const [unstagedFiles, setUnstagedFiles] = useState([]);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [lastContentPanel, setLastContentPanel] = useState(''); // Will be set based on current branch
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [usingCache, setUsingCache] = useState(false);
  const [branchesHeight, setBranchesHeight] = useState(50);
  const [leftWidth, setLeftWidth] = useState(30);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [showStashDialog, setShowStashDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showLocalChangesDialog, setShowLocalChangesDialog] = useState(false);
  const [pendingBranchSwitch, setPendingBranchSwitch] = useState(null);
  const [pullingBranch, setPullingBranch] = useState(null);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const activeSplitter = useRef(null);
  const gitAdapter = useRef(null);
  const hasLoadedCache = useRef(false);
  const branchCommitsCache = useRef(new Map()); // Cache commits per branch

  // Helper function to update branch commits cache
  const updateBranchCache = (branchName, commits) => {
    branchCommitsCache.current.set(branchName, commits);
    
    // Persist to cache manager (merge with existing)
    const cacheData = cacheManager.loadCache(repoPath) || {};
    cacheData.branchCommits = {
      ...cacheData.branchCommits,
      [branchName]: commits
    };
    cacheManager.saveCache(repoPath, cacheData);
  };

  // Helper function to clear branch commits cache
  const clearBranchCache = (branchName = null) => {
    if (branchName) {
      branchCommitsCache.current.delete(branchName);
      
      // Remove from persistent cache
      const cacheData = cacheManager.loadCache(repoPath) || {};
      if (cacheData.branchCommits) {
        delete cacheData.branchCommits[branchName];
        cacheManager.saveCache(repoPath, cacheData);
      }
    } else {
      branchCommitsCache.current.clear();
      
      // Clear all from persistent cache
      const cacheData = cacheManager.loadCache(repoPath) || {};
      delete cacheData.branchCommits;
      cacheManager.saveCache(repoPath, cacheData);
    }
  };

  // Helper function to load branch commits from persistent cache
  const loadBranchCommitsFromCache = () => {
    const cacheData = cacheManager.loadCache(repoPath);
    if (cacheData && cacheData.branchCommits) {
      // Load into memory cache
      Object.entries(cacheData.branchCommits).forEach(([branchName, commits]) => {
        branchCommitsCache.current.set(branchName, commits);
      });
      return cacheData.branchCommits;
    }
    return {};
  };
  const cacheInitialized = useRef(false);
  const currentBranchLoadId = useRef(0);

  const _setSelectedItem = (item) => {
    setSelectedItem(item);
  };

  // Initialize git adapter and load repository data
  useEffect(() => {
    const initRepository = async () => {
      if (!gitAdapter.current) {
        const backend = await ipcRenderer.invoke('get-git-backend');
        gitAdapter.current = await GitFactory.createAdapter(repoPath, backend);
        // Wait for adapter to be fully initialized before loading data
        if (gitAdapter.current) {
          await gitAdapter.current.open();
        }
      }

      // Initialize cache manager with user data path
      const initCache = async () => {
        if (!cacheInitialized.current) {
          const userDataPath = await ipcRenderer.invoke('get-user-data-path');
          cacheManager.setCacheDir(userDataPath);
          cacheInitialized.current = true;

          // Initialize branch commits cache from persistent cache
          loadBranchCommitsFromCache();

          // Load repository data after adapter is ready
          loadRepoData(false);
        }
      };
      initCache();
    };

    initRepository();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath]); // Load repo when path changes


  // Add event listener for branch status refresh
  useEffect(() => {
    const handleBranchStatusRefresh = () => {
      refreshBranchStatus();
    };
    window.addEventListener('refresh-branch-status', handleBranchStatusRefresh);

    // Cleanup event listener on unmount
    return () => {
      window.removeEventListener('refresh-branch-status', handleBranchStatusRefresh);
    };
  }, []);

  const loadRepoData = async (isRefresh = false) => {
    if (loading) {
      return;
    }

    const cacheLoadTime = performance.now();

    if (isRefresh) {
      setRefreshing(true);
    }
    setLoading(true);

    try {
      // Wait for cache to be initialized
      while (!cacheInitialized.current) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Load from cache first on initial load
      if (!isRefresh /*&& !hasLoadedCache.current*/) {
        const cachedData = cacheManager.loadCache(repoPath);
        if (cachedData) {
          // Apply cached data immediately
          setCurrentBranch(cachedData.currentBranch || '');
          setOriginUrl(cachedData.originUrl || '');
          setUnstagedFiles(cachedData.unstagedFiles || []);
          setStagedFiles(cachedData.stagedFiles || []);
          setModifiedCount(cachedData.modifiedCount || 0);
          setBranches(cachedData.branches || []);
          setBranchStatus(cachedData.branchStatus || {});
          setStashes(cachedData.stashes || []);
          setUsingCache(true);
          
          hasLoadedCache.current = true;

          // Always select local changes
          if (selectedItem == null) {
            setLastContentPanel('local-changes');
            _setSelectedItem({ type: 'local-changes' });
          }

          setLoading(false);

          return;
        }
        hasLoadedCache.current = true;
      }

      setError(null);
      setUsingCache(false);

      // Ensure git adapter is available
      if (!gitAdapter.current) {
        console.error('Git adapter not available in loadRepoData');
        return;
      }

      const git = gitAdapter.current;

      // Get current branch and modified files
      const status = await git.status();
      setCurrentBranch(status.current);

      // Get origin URL
      const url = await git.getOriginUrl();
      setOriginUrl(url);

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

      // Always select local changes
      if (selectedItem == null) {
        setLastContentPanel('local-changes');
        _setSelectedItem({ type: 'local-changes' });
      }

      // Save to cache (excluding lastContentPanel to avoid persistence)
      const cacheData = {
        currentBranch: status.current,
        originUrl: url,
        unstagedFiles: unstaged,
        stagedFiles: staged,
        modifiedCount: allPaths.size,
        branches: branchNames,
        branchStatus: statusMap,
        stashes: stashList.all
      };
      
      // Include all branch commits from memory cache
      const currentBranchCommits = {};
      branchCommitsCache.current.forEach((commits, branchName) => {
        currentBranchCommits[branchName] = commits;
      });
      cacheData.branchCommits = currentBranchCommits;
      
      cacheManager.saveCache(repoPath, cacheData);

    } catch (err) {
      console.error('Error loading repo data:', err);
      setError(err.message);
    }
    if (refreshing) {
      setRefreshing(false);
    }
    if (loading) {
      setLoading(false);
    }
  };

  // Periodic background check for local changes
  useEffect(() => {
    // Don't start checking until initial load is complete
    if (loading)
      return;

    // Check for changes every 10 seconds
    const intervalId = setInterval(() => {
      // Silently refresh file status in the background
      refreshFileStatus();
    }, 10000);

    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [loading]); // Re-run if loading state changes

  const refreshFileStatus = async () => {
    // Ensure git adapter is available before attempting to use it
    if (!gitAdapter.current) {
      return;
    }

    try {
      const git = gitAdapter.current;

      // Get current branch and modified files
      const status = await git.status();
      setCurrentBranch(status.current);

      // Update origin URL (refresh it in case it changed)
      const url = await git.getOriginUrl();
      setOriginUrl(url);

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

  const refreshBranchStatus = async () => {
    // Ensure git adapter is available before attempting to use it
    if (!gitAdapter.current) {
      return;
    }

    try {
      const git = gitAdapter.current;

      // Get all local branches
      const branchSummary = await git.branchLocal();
      const branchNames = branchSummary.all;

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
    } catch (error) {
      console.error('Error refreshing branch status:', error);
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
      // Vertical splitter in branch-stash panel
      const mouseY = ((e.clientY - rect.top) / rect.height) * 100;

      if (activeSplitter.current === 1) {
        // Branches/Stashes splitter
        if (mouseY >= 20 && mouseY <= 80) {
          setBranchesHeight(mouseY);
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

      // Clear branch commits cache since remote changes may affect commits
      clearBranchCache();

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

      // Clear branch commits cache since pull may have changed commits
      clearBranchCache();

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

      // Clear branch commits cache since push may have changed commits
      clearBranchCache();

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
    // Check if there are local changes
    if (hasLocalChanges) {
      setPendingBranchSwitch(branchName);
      setShowLocalChangesDialog(true);
      return;
    }

    // No local changes, proceed with branch switch
    await performBranchSwitch(branchName);
  };

  const performBranchSwitch = async (branchName) => {
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

  const handleLocalChangesDialog = async (option) => {
    setShowLocalChangesDialog(false);

    if (!pendingBranchSwitch) {
      return;
    }

    const branchName = pendingBranchSwitch;
    setPendingBranchSwitch(null);

    try {
      const git = gitAdapter.current;

      switch (option) {
        case 'leave-alone':
          // Just switch branches, keep changes as they are
          await performBranchSwitch(branchName);
          break;

        case 'stash-and-reapply':
          // Stash changes, switch branches, then reapply
          console.log('Stashing changes before branch switch...');
          await git.stashPush(`Auto-stash before switching to ${branchName}`);

          // Switch branches
          await performBranchSwitch(branchName);

          // Try to reapply the stash without deleting it
          try {
            console.log('Reapplying stashed changes...');
            await git.stashApply();
            console.log('Stash reapplied successfully');

            // If apply succeeded, then pop the stash to remove it
            // Try to pop stash to remove it
            try {
              await git.stashPop();
              console.log('Stash removed successfully');
            } catch (popError) {
              console.warn('Failed to remove stash after successful apply:', popError.message);
              setError(`Stash reapplied but could not be removed: ${popError.message}`);
            }

            // Refresh Local Changes panel after stash reapplication
            await refreshFileStatus();
          } catch (stashError) {
            console.warn('Could not reapply stash automatically:', stashError.message);
            setError(`Branch switched but stash could not be reapplied: ${stashError.message}`);
            console.info('The stash has been preserved and can be applied manually.');

            // Still refresh file status even if stash failed
            await refreshFileStatus();
          }

          // Refresh all data after stash operations
          await loadRepoData(true);
          break;

        case 'discard':
          // Discard all local changes
          console.log('Discarding local changes...');

          // Discard staged changes
          if (stagedFiles.length > 0) {
            const stagedPaths = stagedFiles.map(f => f.path);
            if (stagedPaths.length === 1) {
              await git.reset(stagedPaths[0]);
            } else {
              await git.reset(stagedPaths);
            }
          }

          // Discard unstaged changes
          if (unstagedFiles.length > 0) {
            await git.discard(unstagedFiles.map(f => f.path));
          }

          // Switch branches
          await performBranchSwitch(branchName);
          break;

        default:
          // Cancel, do nothing
          return;
      }
    } catch (error) {
      console.error('Error handling local changes:', error);
      setError(`Failed to handle local changes: ${error.message}`);
    }
  };

  const handleItemSelect = (item) => {
    // If switching away from a branch, cancel any pending branch loads
    if (item.type !== 'branch') {
      currentBranchLoadId.current += 1;
    }
    _setSelectedItem(item);

    // Update content panel type when selecting content panel items (no persistence)
    if (item.type === 'local-changes' || item.type === 'branch' || item.type === 'stash') {
      setLastContentPanel(item.type);
    }
  };

  const handleBranchSelect = async (branchName) => {
    // Check cache first
    if (branchCommitsCache.current.has(branchName)) {
      console.log(`Loading commits for ${branchName} from cache`);
      _setSelectedItem({
        type: 'branch',
        branchName,
        commits: branchCommitsCache.current.get(branchName),
        loading: false
      });
      return;
    }

    // Increment load ID to cancel any pending requests
    currentBranchLoadId.current += 1;
    const thisLoadId = currentBranchLoadId.current;

    try {
      const git = gitAdapter.current;

      // Set loading state immediately
      _setSelectedItem({
        type: 'branch',
        branchName,
        commits: [],
        loading: true
      });

      console.log(`Loading commits for branch: ${branchName}`);
      const commits = await git.log(branchName);

      // Cache the commits for this branch
      updateBranchCache(branchName, commits);

      // Only update state if this request is still current
      if (thisLoadId === currentBranchLoadId.current) {
        _setSelectedItem({
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
        _setSelectedItem({
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

      // Clear branch commits cache since stash may affect working tree
      clearBranchCache();

      // Refresh file status and stashes
      await refreshFileStatus();
      const stashList = await git.stashList();
      setStashes(stashList.all);

    } catch (error) {
      console.error('Error creating stash:', error);
      setError(`Stash failed: ${error.message}`);
    }
  };

  const handleResetToOrigin = async () => {
    setShowResetDialog(false);

    try {
      const git = gitAdapter.current;

      console.log(`Resetting ${currentBranch} to origin...`);
      await git.resetToOrigin(currentBranch);
      console.log('Reset to origin completed successfully');

      // Clear branch commits cache since reset changes commits
      clearBranchCache();

      // Refresh all data after reset
      await loadRepoData(true);
    } catch (error) {
      console.error('Error resetting to origin:', error);
      setError(`Reset to origin failed: ${error.message}`);
    }
  };

  const handleCreateBranch = async (branchName, checkoutAfterCreate) => {
    try {
      const git = gitAdapter.current;

      await git.createBranch(branchName);

      // Get current branch before creating new one
      const previousBranch = gitAdapter.current.currentBranch || currentBranch;

      if (checkoutAfterCreate && previousBranch && previousBranch !== branchName) {
        await git.checkoutBranch(branchName);

        // Select the newly checked out branch to update the branch view
        await handleBranchSelect(branchName);
      }

      // Clear branch commits cache since branch operations may affect commits
      clearBranchCache();

      // Refresh all data after branch operations
      await loadRepoData(true);
    } catch (error) {
      console.error('Error creating branch:', error);
      setError(`Branch creation failed: ${error.message}`);
    }
  };

  const hasLocalChanges = unstagedFiles.length > 0 || stagedFiles.length > 0;

  return (
    <div className="repository-view">
      <Toolbar onRefresh={handleRefreshClick} onFetch={handleFetchClick} onPull={handlePullClick} onPush={handlePushClick} onStash={hasLocalChanges ? handleStashClick : null} onResetToOrigin={() => setShowResetDialog(true)} onCreateBranch={() => setShowCreateBranchDialog(true)} refreshing={refreshing} currentBranch={currentBranch} branchStatus={branchStatus} />
      <div
        className="repo-content-horizontal"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && <div className="loading">Loading repository...</div>}
        {error && !showErrorDialog && (
          <ErrorDialog
            error={error}
            onClose={() => {
              setError(null);
              setShowErrorDialog(false);
            }}
          />
        )}
        {!loading && !error && (
          <>
            <div className="repo-sidebar" style={{ width: `${leftWidth}%` }}>
              <RepoInfo
                gitAdapter={gitAdapter.current}
                currentBranch={currentBranch}
                originUrl={originUrl}
                modifiedCount={modifiedCount}
                selectedItem={selectedItem}
                onSelectItem={handleItemSelect}
                usingCache={usingCache}
              />
              <div className="branch-stash-panel">
                <BranchStashPanel
                  branches={branches}
                  currentBranch={currentBranch}
                  branchStatus={branchStatus}
                  onBranchSwitch={handleBranchSwitch}
                  pullingBranch={pullingBranch}
                  onBranchSelect={handleBranchSelect}
                  stashes={stashes}
                  onSelectStash={(stash) => handleItemSelect(stash)}
                  selectedItem={selectedItem}
                  onMouseDown={handleMouseDown}
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
                selectedItem={selectedItem || { type: lastContentPanel }}
                unstagedFiles={unstagedFiles}
                stagedFiles={stagedFiles}
                gitAdapter={gitAdapter.current}
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
      {showResetDialog && (
        <ResetToOriginDialog
          onClose={() => setShowResetDialog(false)}
          onReset={handleResetToOrigin}
          currentBranch={currentBranch}
        />
      )}
      {showLocalChangesDialog && (
        <LocalChangesDialog
          onClose={() => {
            setShowLocalChangesDialog(false);
            setPendingBranchSwitch(null);
          }}
          onProceed={handleLocalChangesDialog}
          targetBranch={pendingBranchSwitch}
        />
      )}
      {showCreateBranchDialog && (
        <CreateBranchDialog
          onClose={() => setShowCreateBranchDialog(false)}
          onCreateBranch={handleCreateBranch}
          currentBranch={currentBranch}
          gitAdapter={gitAdapter.current}
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
      {showResetDialog && (
        <ResetToOriginDialog
          onClose={() => setShowResetDialog(false)}
          onReset={handleResetToOrigin}
        />
      )}
    </div>
  );
}

export default RepositoryView;
