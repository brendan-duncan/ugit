import React, { useState, useEffect, useRef } from 'react';
import RepoInfo from './RepoInfo';
import BranchStashPanel from './BranchStashPanel';
import ErrorDialog from './ErrorDialog';
import CreateBranchDialog from './CreateBranchDialog';
import DeleteBranchDialog from './DeleteBranchDialog';
import RenameBranchDialog from './RenameBranchDialog';
import MergeBranchDialog from './MergeBranchDialog';
import ApplyStashDialog from './ApplyStashDialog';
import DeleteStashDialog from './DeleteStashDialog';
import ContentViewer from './ContentViewer';
import Toolbar from './Toolbar';
import PullDialog from './PullDialog';
import PushDialog from './PushDialog';
import StashDialog from './StashDialog';
import RenameStashDialog from './RenameStashDialog';
import ResetToOriginDialog from './ResetToOriginDialog';
import LocalChangesDialog from './LocalChangesDialog';
import CleanWorkingDirectoryDialog from './CleanWorkingDirectoryDialog';
import CreateBranchFromCommitDialog from './CreateBranchFromCommitDialog';
import CreateTagFromCommitDialog from './CreateTagFromCommitDialog';
import GitFactory from '../git/GitFactory';
import cacheManager from '../utils/cacheManager';
import { GitAdapter, Commit, StashInfo } from "../git/GitAdapter"
import { RunningCommand, RemoteInfo, FileInfo } from './types';
import { ipcRenderer } from 'electron';
import './RepositoryView.css';

interface RepositoryViewProps {
  repoPath: string;
  isActiveTab: boolean;
}

function RepositoryView({ repoPath, isActiveTab }: RepositoryViewProps) {
  const [commandState, setCommandState] = useState<RunningCommand[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [branchStatus, setBranchStatus] = useState({});
  const [originUrl, setOriginUrl] = useState('');
  const [stashes, setStashes] = useState<StashInfo[]>([]);
  const [modifiedCount, setModifiedCount] = useState<number>(0);
  const [unstagedFiles, setUnstagedFiles] = useState<FileInfo[]>([]);
  const [stagedFiles, setStagedFiles] = useState<FileInfo[]>([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [lastContentPanel, setLastContentPanel] = useState(''); // Will be set based on current branch
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [branchesHeight, setBranchesHeight] = useState<number>(50);
  const [leftWidth, setLeftWidth] = useState<number>(30);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(null);
  const [showStashDialog, setShowStashDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showCleanWorkingDirectoryDialog, setShowCleanWorkingDirectoryDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showLocalChangesDialog, setShowLocalChangesDialog] = useState(false);
  const [pendingBranchSwitch, setPendingBranchSwitch] = useState(null);
  const [pullingBranch, setPullingBranch] = useState(null);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const [showDeleteBranchDialog, setShowDeleteBranchDialog] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState(null);
  const [showRenameBranchDialog, setShowRenameBranchDialog] = useState(false);
  const [branchToRename, setBranchToRename] = useState(null);
  const [showMergeBranchDialog, setShowMergeBranchDialog] = useState(false);
  const [mergeSourceBranch, setMergeSourceBranch] = useState(null);
  const [showApplyStashDialog, setShowApplyStashDialog] = useState(false);
  const [stashToApply, setStashToApply] = useState(null);
  const [showRenameStashDialog, setShowRenameStashDialog] = useState(false);
  const [stashToRename, setStashToRename] = useState(null);
  const [showDeleteStashDialog, setShowDeleteStashDialog] = useState(false);
  const [stashToDelete, setStashToDelete] = useState(null);
  const [showCreateBranchFromCommitDialog, setShowCreateBranchFromCommitDialog] = useState(false);
  const [showCreateTagFromCommitDialog, setShowCreateTagFromCommitDialog] = useState(false);
  const [commitForDialog, setCommitForDialog] = useState(null);
  const activeSplitter = useRef(null);
  const gitAdapter = useRef<GitAdapter | null>(null);
  const branchCommitsCache = useRef(new Map()); // Cache commits per branch

  let runningCommands = null;

  // Helper function to update branch commits cache
  const updateBranchCache = (branchName: string, commits: Commit[]) => {
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
  const clearBranchCache = (branchName: string | null = null) => {
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

        gitAdapter.current.commandStateCallback = (isStarting, id, command, time) => {
          setCommandState(prev => {
            const newState = isStarting
              ? [...prev, { id, command, time }]
              : prev.filter(cmd => cmd.id !== id);
            runningCommands = newState;
            return newState;
          });
        };
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
    if (loading || refreshing) {
      return;
    }

    console.log("Loading repository data for ", repoPath, "... (isRefresh:", isRefresh, ")");
    const cacheLoadTime = performance.now();

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Wait for cache to be initialized
      while (!cacheInitialized.current) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Load from cache first on initial load
      if (!isRefresh) {
        const cachedData = cacheManager.loadCache(repoPath);
        if (cachedData) {
          // Apply cached data immediately
          setCurrentBranch(cachedData.currentBranch || '');
          setOriginUrl(cachedData.originUrl || '');
          setUnstagedFiles(cachedData.unstagedFiles || []);
          setStagedFiles(cachedData.stagedFiles || []);
          setModifiedCount(cachedData.modifiedCount || 0);
          setBranches(cachedData.branches || []);
          setRemotes(cachedData.remotes || []);
          setBranchStatus(cachedData.branchStatus || {});
          setStashes(cachedData.stashes || []);
          setUsingCache(true);

          // Always select local changes
          if (selectedItem == null) {
            setLastContentPanel('local-changes');
            setSelectedItem({ type: 'local-changes' });
          }

          setLoading(false);
          console.log(`Loaded repository data from cache in ${(performance.now() - cacheLoadTime).toFixed(2)} ms`);
          return;
        }
      }

      setError(null);
      setUsingCache(false);

      // Ensure git adapter is available
      if (!gitAdapter.current) {
        console.error('Git adapter not available in loadRepoData');
        return;
      }

      const git = gitAdapter.current;

      clearBranchCache(); // Clear entire branch cache on full reload

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
            case 'U': return 'conflict';
            case 'AA': return 'conflict';
            case 'DD': return 'conflict';
            case 'UU': return 'conflict';
            case 'AU': return 'conflict';
            case 'UA': return 'conflict';
            case 'DU': return 'conflict';
            case 'UD': return 'conflict';
            default: return 'modified';
          }
        };

        // Check if file has unstaged changes (working_dir is not empty/space)
        if (file.working_dir && file.working_dir !== ' ') {
          unstaged.push({
            path: file.path,
            status: getStatusType(file.working_dir)
          });
        } else if (file.index && file.index !== ' ' && file.index !== '?') {
          // Check if file has staged changes (index is not empty/space)
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

      // Get remotes
      let remotesList = null;
      try {
        const remotesOutput = await git.raw(['remote', '-v']);
        remotesList = remotesOutput
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const match = line.match(/^([^\s]+)\s+([^\s]+)(?:\s+\(fetch\))?$/);
            return match ? { name: match[1], url: match[2] } : null;
          })
          .filter(Boolean);

        setRemotes(remotesList);
        console.log(`Loaded ${remotesList.length} remotes`);
      } catch (error) {
        console.warn('Failed to load remotes:', error);
        setRemotes([]);
        remotesList = [];
      }

      // Get ahead/behind status for each branch (parallel)
      const statusPromises = branchNames.map(async (branchName) => {
        // Check if branch has a remote tracking branch
        const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);

        if (ahead > 0 || behind > 0) {
          return { branchName, ahead, behind };
        } else {
          // Branch is in sync or isn't tracked, don't include in status
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
        setSelectedItem({ type: 'local-changes' });
      }

      // Save to cache (excluding lastContentPanel to avoid persistence)
      const cacheData = {
        currentBranch: status.current,
        originUrl: url,
        unstagedFiles: unstaged,
        stagedFiles: staged,
        modifiedCount: allPaths.size,
        branches: branchNames,
        remotes: remotesList,
        branchStatus: statusMap,
        stashes: stashList.all,
        branchCommits: {}
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

    if (isRefresh) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }

    console.log(`Finished loading repository data in ${(performance.now() - cacheLoadTime).toFixed(2)} ms`);
  };

  // Periodic background check for local changes
  useEffect(() => {
    // Don't start checking until initial load is complete
    if (loading)
      return;

    let refreshFileStatusId = null;
    // Only run if this tab is active
    if (isActiveTab) {
      // Check for changes every 5 seconds
      refreshFileStatusId = setInterval(async () => {
        // Silently refresh file status in the background
        await refreshFileStatus();
      }, 5000); // The interval time should be a setting...

      refreshFileStatus();
    }

    // Clean up interval on unmount
    return () => {
      if (refreshFileStatusId !== null) {
        clearInterval(refreshFileStatusId);
      }
    };
  }, [loading, isActiveTab]); // Re-run if loading state or active tab changes

  const refreshFileStatus = async () => {
    // Ensure git adapter is available before attempting to use it
    if (!gitAdapter.current || runningCommands?.length > 0) {
      return;
    }

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
            case 'U': return 'conflict';
            case 'AA': return 'conflict';
            case 'DD': return 'conflict';
            case 'UU': return 'conflict';
            case 'AU': return 'conflict';
            case 'UA': return 'conflict';
            case 'DU': return 'conflict';
            case 'UD': return 'conflict';
            default: return 'modified';
          }
        };

        // Check if file has unstaged changes (working_dir is not empty/space)
        if (file.working_dir && file.working_dir !== ' ') {
          unstaged.push({
            path: file.path,
            status: getStatusType(file.working_dir)
          });
        } else if (file.index && file.index !== ' ' && file.index !== '?') {
          // Check if file has staged changes (index is not empty/space)
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

      // Update persistent cache with file status data
      try {
        const cacheData = cacheManager.loadCache(repoPath) || {};
        cacheData.currentBranch = status.current;
        cacheData.unstagedFiles = unstaged;
        cacheData.stagedFiles = staged;
        cacheData.modifiedCount = allPaths.size;
        cacheManager.saveCache(repoPath, cacheData);
      } catch (cacheErr) {
        console.warn('Failed to update file status cache:', cacheErr);
      }
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
        // Check if branch has a remote tracking branch
        const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);

        if (ahead > 0 || behind > 0) {
          return { branchName, ahead, behind };
        } else {
          // Branch is in sync or isn't tracked, don't include in status
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeSplitter.current === null)
      return;

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
        // Branches/Remotes splitter
        if (mouseY >= 20 && mouseY <= 80) {
          setBranchesHeight(mouseY);
        }
      } else if (activeSplitter.current === 2) {
        // Remotes/Stashes splitter
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
        const { ahead, behind } = await git.getAheadBehind(branchName, `origin/${branchName}`);
        if (ahead > 0 || behind > 0) {
          setBranchStatus(prev => ({
            ...prev,
            [branchName]: { ahead, behind }
          }));
        } else if (ahead < 0 || behind < 0) {
          // Branch doesn't have a remote tracking branch
          // Remove status for this branch
          setBranchStatus(prev => {
            const newStatus = { ...prev };
            delete newStatus[branchName];
            return newStatus;
          });
        } else {
          // Remove status if branch is now in sync
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
    setShowPushDialog(currentBranch);
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

      await loadRepoData(true);

    } catch (error) {
      console.error('Error during pull:', error);
      setError(`Pull failed: ${error.message}`);
    }
    setPullingBranch(null);
  };

  const handlePush = async (branch, remoteBranch, pushAllTags) => {
    setShowPushDialog(null);

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

      await loadRepoData(true);

    } catch (error) {
      console.error('Error during push:', error);
      setError(`Push failed: ${error.message}`);
    }
  };

  const handleBranchSwitch = async (branchName: string) => {
    // Check if there are local changes
    if (hasLocalChanges) {
      setPendingBranchSwitch(branchName);
      setShowLocalChangesDialog(true);
      return;
    }

    // No local changes, proceed with branch switch
    await performBranchSwitch(branchName);
  };

  const performBranchSwitch = async (branchName: string) => {
    try {
      const git = gitAdapter.current;

      console.log(`Switching to branch: ${branchName}`);
      await git.checkoutBranch(branchName);
      console.log('Branch switch completed successfully');

      // Refresh all data after branch switch
      //await loadRepoData(true);
    } catch (error) {
      console.error('Error switching branch:', error);
      setError(`Branch switch failed: ${error.message}`);
    }
  };

  const handleLocalChangesDialog = async (option: string) => {
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
          //await loadRepoData(true);
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

  const handleOriginChanged = async () => {
    try {
      const git = gitAdapter.current;
      const url = await git.getOriginUrl();
      setOriginUrl(url);
      console.log('Origin URL refreshed:', url);
    } catch (error) {
      console.error('Error refreshing origin URL:', error);
      setOriginUrl('');
    }
  };

  const handleDeleteBranchDialog = async ({ deleteRemote }) => {
    setShowDeleteBranchDialog(false);

    if (!branchToDelete) {
      return;
    }

    const branchName = branchToDelete;
    setBranchToDelete(null);

    try {
      const git = gitAdapter.current;

      // Check if trying to delete the current branch
      if (branchName === currentBranch) {
        setError('Cannot delete the currently active branch');
        return;
      }

      // Delete local branch
      console.log(`Deleting local branch: ${branchName}`);
      await git.raw(['branch', '-D', branchName]);

      // Delete remote branch if requested
      if (deleteRemote) {
        try {
          console.log(`Deleting remote branch: origin/${branchName}`);
          await git.raw(['push', 'origin', '--delete', branchName]);
        } catch (remoteError) {
          console.warn(`Failed to delete remote branch origin/${branchName}:`, remoteError);
          // Continue with local deletion success, but warn about remote
          setError(`Local branch deleted successfully, but failed to delete remote branch: ${remoteError.message}`);
          // Still refresh the data to show the local deletion
          await loadRepoData(true);
          return;
        }
      }

      console.log(`Branch ${branchName} deleted successfully`);

      // Refresh repository data to show updated branch list
      await loadRepoData(true);

    } catch (error) {
      console.error('Error deleting branch:', error);
      setError(`Failed to delete branch '${branchName}': ${error.message}`);
    }
  };

  const handleRenameBranchDialog = async (newName: string) => {
    setShowRenameBranchDialog(false);

    if (!branchToRename) {
      return;
    }

    const oldName = branchToRename;
    setBranchToRename(null);

    try {
      const git = gitAdapter.current;

      console.log(`Renaming branch '${oldName}' to '${newName}'`);
      await git.raw(['branch', '-m', oldName, newName]);

      // Update selected item if it was the renamed branch
      if (selectedItem?.type === 'branch' && selectedItem.branchName === oldName) {
        setSelectedItem({
          ...selectedItem,
          branchName: newName
        });
      }

      // Update current branch if it was the renamed branch
      if (currentBranch === oldName) {
        setCurrentBranch(newName);
      }

      console.log(`Branch renamed successfully from '${oldName}' to '${newName}'`);

      // Clear branch commits cache since branch operations may affect commits
      if (branchCommitsCache.current.has(oldName)) {
        branchCommitsCache.current.delete(oldName);
      }

      // Refresh repository data to show updated branch list
      await loadRepoData(true);

    } catch (error) {
      console.error('Error renaming branch:', error);
      setError(`Failed to rename branch '${oldName}' to '${newName}': ${error.message}`);
    }
  };

  const handleMergeBranchDialog = async ({ sourceBranch, targetBranch, mergeOption, flag }: { sourceBranch: string; targetBranch: string; mergeOption: string; flag?: string }) => {
    setShowMergeBranchDialog(false);

    if (!sourceBranch || !targetBranch) {
      return;
    }

    setMergeSourceBranch(null);

    try {
      const git = gitAdapter.current;

      console.log(`Merging '${sourceBranch}' into '${targetBranch}' with option: ${mergeOption}`);

      // Build merge command
      const mergeArgs = ['merge'];
      if (flag) {
        mergeArgs.push(flag);
      }
      mergeArgs.push(sourceBranch);

      // Perform the merge
      await git.raw(mergeArgs);

      console.log(`Merge completed successfully: '${sourceBranch}' into '${targetBranch}'`);

      // Clear branch commits cache since merge affects commits
      clearBranchCache();

      // Refresh repository data to show updated state
      await loadRepoData(true);

      // If we're on the target branch, refresh the commits view
      if (selectedItem?.type === 'branch' && selectedItem.branchName === targetBranch) {
        await handleBranchSelect(targetBranch);
      }

    } catch (error) {
      console.error('Error merging branch:', error);
      setError(`Failed to merge '${sourceBranch}' into '${targetBranch}': ${error.message}`);
    }
  };

  const handleItemSelect = (item: any) => {
    // If switching away from a branch or remote branch, cancel any pending loads
    if (item.type !== 'branch' && item.type !== 'remote-branch') {
      currentBranchLoadId.current += 1;
    }
    setSelectedItem(item);

    // Update content panel type when selecting content panel items (no persistence)
    if (item.type === 'local-changes' || item.type === 'branch' || item.type === 'stash' || item.type === 'remote-branch') {
      setLastContentPanel(item.type);
    }
  };

  const handleBranchSelect = async (branchName: string) => {
    // Check cache first
    if (branchCommitsCache.current.has(branchName)) {
      console.log(`Loading commits for ${branchName} from cache`);
      setSelectedItem({
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
      setSelectedItem({
        type: 'branch',
        branchName,
        commits: [],
        loading: true
      });

      console.log(`Loading commits for branch: ${branchName}`);
      const maxCommits = 100;
      const commits = await git.log(branchName, maxCommits);

      // Cache the commits for this branch
      updateBranchCache(branchName, commits);

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

  const handleStash = async (message: string, stageNewFiles: boolean) => {
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

  const handleCleanWorkingDirectory = async () => {
    setShowCleanWorkingDirectoryDialog(false);

    try {
      const git = gitAdapter.current;

      console.log('Cleaning working directory...');
      await git.raw(['clean', '-fdx']);
      console.log('Working directory cleaned successfully');

      // Clear branch commits cache since cleaning may affect file status
      clearBranchCache();

      // Refresh all data after cleaning
      await loadRepoData(true);
    } catch (error) {
      console.error('Error cleaning working directory:', error);
      setError(`Clean working directory failed: ${error.message}`);
    }
  };

  const handleCreateBranch = async (branchName: string, checkoutAfterCreate: boolean) => {
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

  const handleCreateBranchFromCommit = async (branchName, checkoutAfterCreate) => {
    if (!commitForDialog) return;

    try {
      const git = gitAdapter.current;
      await git.raw(['checkout', '-b', branchName, commitForDialog.hash]);
      console.log(`Created branch '${branchName}' from commit ${commitForDialog.hash.substring(0, 7)}`);

      if (checkoutAfterCreate) {
        // Select newly checked out branch to update branch view
        await handleBranchSelect(branchName);
      }

      // Clear branch commits cache since branch operations may affect commits
      clearBranchCache();

      // Refresh all data after branch operations
      await loadRepoData(true);
    } catch (error) {
      console.error('Error creating branch from commit:', error);
      setError(`Branch creation failed: ${error.message}`);
    } finally {
      setShowCreateBranchFromCommitDialog(false);
      setCommitForDialog(null);
    }
  };

  const handleCreateTagFromCommit = async (tagName, tagMessage) => {
    if (!commitForDialog) return;

    try {
      const git = gitAdapter.current;
      
      // Create tag with optional message
      if (tagMessage) {
        await git.raw(['tag', '-a', tagName, '-m', tagMessage, commitForDialog.hash]);
      } else {
        await git.raw(['tag', tagName, commitForDialog.hash]);
      }
      
      console.log(`Created tag '${tagName}' on commit ${commitForDialog.hash.substring(0, 7)}`);

      // Refresh all data to show new tag
      await loadRepoData(true);
    } catch (error) {
      console.error('Error creating tag from commit:', error);
      setError(`Tag creation failed: ${error.message}`);
    } finally {
      setShowCreateTagFromCommitDialog(false);
      setCommitForDialog(null);
    }
  };

  const handleBranchContextMenu = (action: string, branchName: string, currentBranch: string) => {
    console.log('Branch context menu action:', action, 'on branch:', branchName);

    switch (action) {
      case 'checkout':
        handleBranchSwitch(branchName);
        break;
      case 'push-to-origin':
        setShowPushDialog(branchName);
        break;
      case 'merge-into-active':
        setMergeSourceBranch(branchName);
        setShowMergeBranchDialog(true);
        break;
      case 'rebase-active-onto-branch':
        // TODO: Implement rebase active branch onto branch
        alert(`Rebase ${currentBranch} onto branch: ${branchName}`);
        break;
      case 'new-branch':
        // TODO: Implement new branch dialog
        alert(`New branch from: ${currentBranch} to ${branchName}`);
        break;
      case 'new-tag':
        // TODO: Implement new tag dialog
        alert(`New tag on branch: ${branchName}`);
        break;
      case 'rename':
        setBranchToRename(branchName);
        setShowRenameBranchDialog(true);
        break;
      case 'delete':
        setBranchToDelete(branchName);
        setShowDeleteBranchDialog(true);
        break;
      case 'copy-branch-name':
        // Copy branch name to clipboard
        navigator.clipboard.writeText(branchName).then(() => {
          console.log(`Branch name copied to clipboard: ${branchName}`);
        }).catch(err => {
          console.error('Failed to copy branch name:', err);
        });
        break;
      default:
        alert(`Unknown context menu action: ${action}`);
    }
  };

  const handleStashContextMenu = (action: string, stash: any, stashIndex: number): void => {
    console.log('Stash context menu action:', action, 'on stash:', stash);

    switch (action) {
      case 'apply':
        setStashToApply({ ...stash, index: stashIndex });
        setShowApplyStashDialog(true);
        break;
      case 'rename':
        setStashToRename({ ...stash, index: stashIndex });
        setShowRenameStashDialog(true);
        break;
      case 'delete':
        setStashToDelete({ ...stash, index: stashIndex });
        setShowDeleteStashDialog(true);
        break;
      default:
        alert(`Unknown stash context menu action: ${action}`);
    }
  };

  const handleApplyStashDialog = async ({ stashIndex, deleteAfterApplying }) => {
    setShowApplyStashDialog(false);

    if (stashToApply === null) {
      return;
    }

    const stash = stashToApply;
    setStashToApply(null);

    try {
      const git = gitAdapter.current;

      console.log(`Applying stash: ${stash.message} (index: ${stashIndex})`);

      // Apply the stash
      await git.raw(['stash', 'apply', `stash@{${stashIndex}}`]);

      console.log(`Stash applied successfully: ${stash.message}`);

      // Only delete the stash if it was requested and there were no errors
      if (deleteAfterApplying) {
        try {
          console.log(`Deleting stash after successful apply: ${stash.message}`);
          await git.raw(['stash', 'drop', `stash@{${stashIndex}}`]);
          console.log(`Stash deleted successfully after apply: ${stash.message}`);
        } catch (dropError) {
          console.warn(`Failed to delete stash after apply: ${dropError.message}`);
          setError(`Stash applied successfully, but failed to delete it: ${dropError.message}`);
        }
      }

      // Refresh the file statuses to show applied changes
      await refreshFileStatus();

      // Refresh repository data to show updated stash list
      await loadRepoData(true);

    } catch (error) {
      console.error('Error applying stash:', error);
      setError(`Failed to apply stash '${stash.message}': ${error.message}`);
    }
  };

  const handleRenameStashDialog = async (newName) => {
    setShowRenameStashDialog(false);

    if (!stashToRename) {
      return;
    }

    const stash = stashToRename;
    setStashToRename(null);

    try {
      const git = gitAdapter.current;

      const currentMessage = stash.message;
      const currentName = currentMessage.replace(/^On [^:]+:\s*/, '');
      const currentPrfix = currentMessage.substring(0, currentMessage.indexOf(currentName));
      newName = currentPrfix + newName;

      console.log(`Renaming stash: "${stash.message}" to "${newName}"`);

      // Rename the stash using git stash drop and git stash store
      // First, get the current stash content
      const stashContent = await git.raw(['show', `stash@{${stash.index}}`]);

      // Drop the old stash
      await git.raw(['stash', 'drop', `stash@{${stash.index}}`]);

      // Create a new stash with the new name
      await git.raw(['stash', 'store', '-m', newName, stashContent]);

      console.log(`Stash renamed successfully from "${stash.message}" to "${newName}"`);

      // Refresh repository data to show updated stash list
      await loadRepoData(true);

    } catch (error) {
      console.error('Error renaming stash:', error);
      setError(`Failed to rename stash from '${stash.message}' to '${newName}': ${error.message}`);
    }
};

  const handleDeleteStashDialog = async (stashIndex) => {
    setShowDeleteStashDialog(false);

    if (stashToDelete === null) {
      return;
    }

    const stash = stashToDelete;
    setStashToDelete(null);

    try {
      const git = gitAdapter.current;

      console.log(`Deleting stash: ${stash.message} (index: ${stashIndex})`);

      // Delete the stash
      await git.raw(['stash', 'drop', `stash@{${stashIndex}}`]);

      console.log(`Stash deleted successfully: ${stash.message}`);

      // Refresh repository data to show updated stash list
      await loadRepoData(true);

    } catch (error) {
      console.error('Error deleting stash:', error);
      setError(`Failed to delete stash '${stash.message}': ${error.message}`);
    }
};

  const handleRemoteBranchSelect = (remoteBranchInfo: any) => {
    console.log('Remote branch selected:', remoteBranchInfo);
    
    if (remoteBranchInfo.type === 'remote-branch' && remoteBranchInfo.fullName) {
      // Load commits for the remote branch
      loadRemoteBranchCommits(remoteBranchInfo.remoteName, remoteBranchInfo.branchName, remoteBranchInfo.fullName);
    } else {
      setSelectedItem(remoteBranchInfo);
    }
  };

  const loadRemoteBranchCommits = async (remoteName: string, branchName: string, fullName: string) => {
    // Check cache first
    if (branchCommitsCache.current.has(fullName)) {
      console.log(`Loading commits for ${fullName} from cache`);
      setSelectedItem({
        type: 'remote-branch',
        remoteName,
        branchName,
        fullName,
        commits: branchCommitsCache.current.get(fullName),
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
      setSelectedItem({
        type: 'remote-branch',
        remoteName,
        branchName,
        fullName,
        commits: [],
        loading: true
      });

      console.log(`Loading commits for remote branch: ${fullName}`);
      const maxCommits = 100;
      const commits = await git.log(fullName, maxCommits);

      // Cache commits for this remote branch
      updateBranchCache(fullName, commits);

      // Only update state if this request is still current
      if (thisLoadId === currentBranchLoadId.current) {
        setSelectedItem({
          type: 'remote-branch',
          remoteName,
          branchName,
          fullName,
          commits,
          loading: false
        });
      }
    } catch (error) {
      console.error('Error loading remote branch commits:', error);

      // Only update error state if this request is still current
      if (thisLoadId === currentBranchLoadId.current) {
        setError(`Failed to load commits: ${error.message}`);
        setSelectedItem({
          type: 'remote-branch',
          remoteName,
          branchName,
          fullName,
          commits: [],
          loading: false
        });
      }
    }
  };

  const handleRemoteAdded = () => {
    // Refresh repository data to show the new remote
    loadRepoData(true);
  };

  const handleRemoteBranchContextMenu = (action: string, remoteName: string, branchName: string, fullName: string): void => {
    console.log('Remote branch context menu action:', action, 'on branch:', fullName);

    switch (action) {
      case 'checkout':
        // TODO: Implement checkout remote branch
        alert(`Check out remote branch: ${fullName}`);
        break;
      case 'pull':
        // TODO: Implement pull remote branch into current branch
        alert(`Pull '${fullName}' into '${currentBranch}'`);
        break;
      case 'merge':
        // TODO: Implement merge remote branch into current branch
        alert(`Merge '${fullName}' into '${currentBranch}'`);
        break;
      case 'new-branch':
        // TODO: Implement new branch from remote branch
        alert(`New branch from: ${fullName}`);
        break;
      case 'new-tag':
        // TODO: Implement new tag from remote branch
        alert(`New tag from: ${fullName}`);
        break;
      case 'delete':
        // TODO: Implement delete remote branch confirmation
        alert(`Delete remote branch: ${fullName}`);
        break;
      case 'copy-name':
        // Copy remote branch name to clipboard
        navigator.clipboard.writeText(fullName).then(() => {
          console.log(`Remote branch name copied to clipboard: ${fullName}`);
        }).catch(err => {
          console.error('Failed to copy remote branch name:', err);
        });
        break;
      default:
        alert(`Unknown remote branch context menu action: ${action}`);
    }
  };

  const hasLocalChanges = unstagedFiles.length > 0 || stagedFiles.length > 0;

  const handleCommitContextMenu = async (action: string, commit: Commit, currentBranch: string) => {
    console.log('Commit context menu action:', action, 'on commit:', commit.hash);

    try {
      const git = gitAdapter.current;

      switch (action) {
        case 'new-branch':
          setCommitForDialog(commit);
          setShowCreateBranchFromCommitDialog(true);
          break;

        case 'new-tag':
          setCommitForDialog(commit);
          setShowCreateTagFromCommitDialog(true);
          break;

        case 'rebase-to-here':
          if (currentBranch) {
            const confirmed = window.confirm(
              `Are you sure you want to rebase '${currentBranch}' onto commit ${commit.hash.substring(0, 7)}?\n\nThis will rewrite the history of '${currentBranch}'.`
            );
            if (confirmed) {
              await git.raw(['rebase', '--interactive', '--onto', commit.hash, `$(git merge-base ${currentBranch} ${commit.hash})`, currentBranch]);
              console.log(`Rebased '${currentBranch}' onto commit ${commit.hash.substring(0, 7)}`);
              await loadRepoData(true);
            }
          } else {
            alert('No current branch found for rebase');
          }
          break;

        case 'reset-to-here':
          if (currentBranch) {
            const confirmed = window.confirm(
              `Are you sure you want to reset '${currentBranch}' to commit ${commit.hash.substring(0, 7)}?\n\nThis will discard all commits after this point.`
            );
            if (confirmed) {
              await git.raw(['reset', '--hard', commit.hash]);
              console.log(`Reset '${currentBranch}' to commit ${commit.hash.substring(0, 7)}`);
              await loadRepoData(true);
            }
          } else {
            alert('No current branch found for reset');
          }
          break;

        case 'checkout-commit':
          const confirmed = window.confirm(
            `Are you sure you want to checkout commit ${commit.hash.substring(0, 7)}?\n\nThis will put you in a 'detached HEAD' state.`
          );
          if (confirmed) {
            await git.checkoutBranch(commit.hash);
            console.log(`Checked out commit ${commit.hash.substring(0, 7)}`);
            await loadRepoData(true);
          }
          break;

        case 'cherry-pick':
          if (currentBranch) {
            const confirmed = window.confirm(
              `Are you sure you want to cherry-pick commit ${commit.hash.substring(0, 7)} onto '${currentBranch}'?`
            );
            if (confirmed) {
              await git.raw(['cherry-pick', commit.hash]);
              console.log(`Cherry-picked commit ${commit.hash.substring(0, 7)} onto '${currentBranch}'`);
              await loadRepoData(true);
            }
          } else {
            alert('No current branch found for cherry-pick');
          }
          break;

        case 'revert-commit':
          if (currentBranch) {
            const confirmed = window.confirm(
              `Are you sure you want to revert commit ${commit.hash.substring(0, 7)} on '${currentBranch}'?`
            );
            if (confirmed) {
              await git.raw(['revert', commit.hash]);
              console.log(`Reverted commit ${commit.hash.substring(0, 7)} on '${currentBranch}'`);
              await loadRepoData(true);
            }
          } else {
            alert('No current branch found for revert');
          }
          break;

        case 'save-patch':
          try {
            const patchContent = await git.raw(['format-patch', '-1', commit.hash]);
            const blob = new Blob([patchContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${commit.hash.substring(0, 7)}.patch`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`Saved patch for commit ${commit.hash.substring(0, 7)}`);
          } catch (error) {
            console.error('Error creating patch:', error);
            alert('Failed to create patch: ' + error.message);
          }
          break;

        case 'copy-sha':
          try {
            await navigator.clipboard.writeText(commit.hash);
            console.log(`Copied commit SHA to clipboard: ${commit.hash}`);
          } catch (error) {
            console.error('Failed to copy SHA:', error);
            alert('Failed to copy SHA to clipboard');
          }
          break;

        case 'copy-info':
          try {
            const commitInfo = `Commit: ${commit.hash.substring(0, 7)} (${commit.hash})\nAuthor: ${commit.author_name}\nDate: ${commit.date}\n\n${commit.message}`;
            await navigator.clipboard.writeText(commitInfo);
            console.log(`Copied commit info to clipboard: ${commit.hash.substring(0, 7)}`);
          } catch (error) {
            console.error('Failed to copy commit info:', error);
            alert('Failed to copy commit info to clipboard');
          }
          break;

        default:
          alert(`Unknown context menu action: ${action}`);
      }
    } catch (error) {
      console.error(`Error handling commit context menu action '${action}':`, error);
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="repository-view">
      <Toolbar runningCommands={commandState} onRefresh={handleRefreshClick} onFetch={handleFetchClick} onPull={handlePullClick} onPush={handlePushClick} onStash={hasLocalChanges ? handleStashClick : null} onCreateBranch={() => setShowCreateBranchDialog(true)} refreshing={refreshing} currentBranch={currentBranch} branchStatus={branchStatus} />
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
                onResetToOrigin={() => setShowResetDialog(true)}
                onCleanWorkingDirectory={() => setShowCleanWorkingDirectoryDialog(true)}
                onOriginChanged={handleOriginChanged}
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
                  onBranchContextMenu={handleBranchContextMenu}
                  onStashContextMenu={handleStashContextMenu}
                  remotes={remotes}
                  onSelectRemoteBranch={handleRemoteBranchSelect}
                  onRemoteBranchAction={handleRemoteBranchContextMenu}
                  onRemoteAdded={handleRemoteAdded}
                  gitAdapter={gitAdapter.current}
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
                onContextMenu={handleCommitContextMenu}
                currentBranch={currentBranch}
                branchStatus={branchStatus}
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
          onClose={() => setShowPushDialog(null)}
          onPush={handlePush}
          branches={branches}
          currentBranch={showPushDialog}
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
      {showCreateBranchFromCommitDialog && (
        <CreateBranchFromCommitDialog
          onClose={() => {
            setShowCreateBranchFromCommitDialog(false);
            setCommitForDialog(null);
          }}
          onCreateBranch={handleCreateBranchFromCommit}
          commitHash={commitForDialog ? commitForDialog.hash : ''}
          commitMessage={commitForDialog ? commitForDialog.message : ''}
        />
      )}
      {showCreateTagFromCommitDialog && (
        <CreateTagFromCommitDialog
          onClose={() => {
            setShowCreateTagFromCommitDialog(false);
            setCommitForDialog(null);
          }}
          onCreateTag={handleCreateTagFromCommit}
          commitHash={commitForDialog ? commitForDialog.hash : ''}
          commitMessage={commitForDialog ? commitForDialog.message : ''}
        />
      )}
      {showDeleteBranchDialog && (
        <DeleteBranchDialog
          onClose={() => {
            setShowDeleteBranchDialog(false);
            setBranchToDelete(null);
          }}
          onConfirm={handleDeleteBranchDialog}
          branchName={branchToDelete}
        />
      )}
      {showRenameBranchDialog && (
        <RenameBranchDialog
          onClose={() => {
            setShowRenameBranchDialog(false);
            setBranchToRename(null);
          }}
          onRename={handleRenameBranchDialog}
          currentBranchName={branchToRename}
        />
      )}
      {showMergeBranchDialog && (
        <MergeBranchDialog
          onClose={() => {
            setShowMergeBranchDialog(false);
            setMergeSourceBranch(null);
          }}
          onMerge={handleMergeBranchDialog}
          sourceBranch={mergeSourceBranch}
          targetBranch={currentBranch}
          gitAdapter={gitAdapter.current}
        />
      )}
      {showApplyStashDialog && (
        <ApplyStashDialog
          onClose={() => {
            setShowApplyStashDialog(false);
            setStashToApply(null);
          }}
          onApply={handleApplyStashDialog}
          stashMessage={stashToApply?.message || ''}
          stashIndex={stashToApply?.index || 0}
        />
      )}
      {showRenameStashDialog && (
        <RenameStashDialog
          onClose={() => {
            setShowRenameStashDialog(false);
            setStashToRename(null);
          }}
          onRename={handleRenameStashDialog}
          currentStashName={stashToRename?.message.replace(/^On [^:]+:\s*/, '') || ''}
          stashIndex={stashToRename?.index || 0}
        />
      )}
      {showDeleteStashDialog && (
        <DeleteStashDialog
          onClose={() => {
            setShowDeleteStashDialog(false);
            setStashToDelete(null);
          }}
          onDelete={handleDeleteStashDialog}
          stashMessage={stashToDelete?.message || ''}
          stashIndex={stashToDelete?.index || 0}
        />
      )}
      {showPushDialog && (
        <PushDialog
          onClose={() => setShowPushDialog(null)}
          onPush={handlePush}
          branches={branches}
          currentBranch={showPushDialog}
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
      {showCleanWorkingDirectoryDialog && (
        <CleanWorkingDirectoryDialog
          onClose={() => setShowCleanWorkingDirectoryDialog(false)}
          onClean={handleCleanWorkingDirectory}
        />
      )}
    </div>
  );
}

export default RepositoryView;
