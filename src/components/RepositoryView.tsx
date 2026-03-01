import React, { useState, useEffect, useRef, useCallback } from 'react';
import RepoInfo from './RepoInfo';
import BranchStashPanel from './BranchStashPanel';
import ErrorDialog from './ErrorDialog';
import CreateBranchDialog from './CreateBranchDialog';
import DeleteBranchDialog from './DeleteBranchDialog';
import RenameBranchDialog from './RenameBranchDialog';
import MergeBranchDialog from './MergeBranchDialog';
import RebaseBranchDialog from './RebaseBranchDialog';
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
import AmendCommitDialog from './AmendCommitDialog';
import PullRequestDialog from './PullRequestDialog';
import { useGitAdapter, useRepositoryData } from '../hooks/useGit';
import { useRepositoryViewDialogs } from '../hooks/useRepositoryViewDialogs';
import { useSettings } from '../contexts/SettingsContext';
import { useAlert } from '../contexts/AlertContext';
import cacheManager from '../utils/cacheManager';
import { GitAdapter, Commit } from "../git/GitAdapter"
import { RunningCommand, RemoteInfo, FileInfo, SelectedItem } from './types';
import './RepositoryView.css';

interface RepositoryViewProps {
  repoPath: string;
  isActiveTab: boolean;
}

function RepositoryView({ repoPath, isActiveTab }: RepositoryViewProps) {
  const { showAlert, showConfirm } = useAlert();
  const { settings, getSetting } = useSettings();

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [lastContentPanel, setLastContentPanel] = useState<string>('local-changes');
  const [refreshing, setRefreshing] = useState(false);
  const [branchesHeight, setBranchesHeight] = useState<number>(50);
  const [leftWidth, setLeftWidth] = useState<number>(30);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [busyMessage, setBusyMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const activeSplitter = useRef<number | string | null>(null);
  const currentBranchLoadId = useRef(0);

  const handleGitError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const {
    gitAdapter,
    isLoading: gitLoading,
    error: gitError,
    commandState,
    refresh: refreshGit
  } = useGitAdapter({ repoPath, onError: handleGitError });

  const {
    currentBranch,
    setCurrentBranch,
    originUrl,
    setOriginUrl,
    unstagedFiles,
    setUnstagedFiles,
    stagedFiles,
    setStagedFiles,
    modifiedCount,
    setModifiedCount,
    branches,
    remotes,
    branchStatus,
    setBranchStatus,
    stashes,
    loading: repoLoading,
    usingCache,
    error: repoError,
    setError: setRepoError,
    branchCommitsCache,
    loadRepoData,
    refreshStashes,
    updateBranchCache,
    clearBranchCache,
    getFileStatusType
  } = useRepositoryData(repoPath, gitAdapter);

  const {
    dialogStates,
    pendingState,
    showPullDialog,
    hidePullDialog,
    showPushDialog,
    hidePushDialog,
    showStashDialog,
    hideStashDialog,
    showResetDialog,
    hideResetDialog,
    showCleanWorkingDirectoryDialog,
    hideCleanWorkingDirectoryDialog,
    showErrorDialog,
    hideErrorDialog,
    showLocalChangesDialog,
    hideLocalChangesDialog,
    showCreateBranchDialog,
    hideCreateBranchDialog,
    showDeleteBranchDialog,
    hideDeleteBranchDialog,
    showRenameBranchDialog,
    hideRenameBranchDialog,
    showMergeBranchDialog,
    hideMergeBranchDialog,
    showRebaseBranchDialog,
    hideRebaseBranchDialog,
    showApplyStashDialog,
    hideApplyStashDialog,
    showRenameStashDialog,
    hideRenameStashDialog,
    showDeleteStashDialog,
    hideDeleteStashDialog,
    showCreateBranchFromCommitDialog,
    hideCreateBranchFromCommitDialog,
    showCreateTagFromCommitDialog,
    hideCreateTagFromCommitDialog,
    showAmendCommitDialog,
    hideAmendCommitDialog,
    showPullRequestDialog,
    hidePullRequestDialog,
  } = useRepositoryViewDialogs();

  const loading = gitLoading || repoLoading;
  
  const hasLocalChanges = unstagedFiles.length > 0 || stagedFiles.length > 0;

  const setErrorWithDialog = useCallback((err: string) => {
    setError(err);
    showErrorDialog();
  }, [showErrorDialog]);

  const updateCachedCommitsOriginStatus = useCallback(async () => {
    const git = gitAdapter;
    if (!git) return;

    const cachedBranches = Array.from(branchCommitsCache.current.keys());
    if (cachedBranches.length === 0) return;

    for (const branchName of cachedBranches) {
      if (branchName.startsWith('origin/')) continue;

      const commits = branchCommitsCache.current.get(branchName);
      if (!commits || commits.length === 0) continue;

      const commitsToCheck = commits.filter(commit => commit.onOrigin === false);
      if (commitsToCheck.length === 0) continue;

      for (const commit of commitsToCheck) {
        try {
          const unpushedCommits = await git.raw(['branch', '-r', `--contains`, `${commit.hash}`]);
          commit.onOrigin = unpushedCommits.trim().length !== 0;
        } catch {
          commit.onOrigin = false;
        }
      }

      updateBranchCache(branchName, commits);
    }
  }, [gitAdapter, branchCommitsCache, updateBranchCache]);

  const refreshFileStatus = useCallback(async (noLock: boolean) => {
    if (!gitAdapter || !currentBranch) return;

    try {
      const status = await gitAdapter.status(undefined, noLock, true);
      setCurrentBranch(status.current || '');

      const unstaged: FileInfo[] = [];
      const staged: FileInfo[] = [];

      status.files.forEach(file => {
        if (file.working_dir && file.working_dir !== ' ') {
          unstaged.push({ path: file.path, status: getFileStatusType(file.working_dir) });
        } else if (file.index && file.index !== ' ' && file.index !== '?') {
          staged.push({ path: file.path, status: getFileStatusType(file.index) });
        }
      });

      // Update state to refresh the UI
      setUnstagedFiles(unstaged);
      setStagedFiles(staged);

      const allPaths = new Set([...unstaged.map(f => f.path), ...staged.map(f => f.path)]);
      setModifiedCount(allPaths.size);
      
      const cacheData = cacheManager.loadCache(repoPath) || {};
      cacheData.currentBranch = status.current;
      cacheData.unstagedFiles = unstaged;
      cacheData.stagedFiles = staged;
      cacheData.modifiedCount = allPaths.size;
      if (status.ahead !== undefined && status.behind !== undefined) {
        if (!cacheData.branchStatus) cacheData.branchStatus = {};
        if (status.ahead > 0 || status.behind > 0) {
          cacheData.branchStatus[status.current!] = { ahead: status.ahead, behind: status.behind };
        } else {
          delete cacheData.branchStatus[status.current!];
        }
      }
      cacheManager.saveCache(repoPath, cacheData);
    } catch (err) {
      console.error('Error refreshing file status:', err);
    }
  }, [gitAdapter, currentBranch, repoPath, getFileStatusType, setCurrentBranch, setUnstagedFiles, setStagedFiles, setModifiedCount]);

  const refreshBranchStatus = useCallback(async () => {
    if (!gitAdapter) return;

    try {
      const branchSummary = await gitAdapter.branchLocal();
      const statusPromises = branchSummary.all.map(async (branchName) => {
        const { ahead, behind } = await gitAdapter.getAheadBehind(branchName, `origin/${branchName}`);
        return (ahead > 0 || behind > 0) ? { branchName, ahead, behind } : null;
      });

      const statusResults = await Promise.all(statusPromises);
      const statusMap: { [key: string]: { ahead: number; behind: number } } = {};
      statusResults.forEach(result => {
        if (result) statusMap[result.branchName] = { ahead: result.ahead, behind: result.behind };
      });
      setBranchStatus(statusMap);
    } catch (error) {
      console.error('Error refreshing branch status:', error);
    }
  }, [gitAdapter, setBranchStatus]);

  useEffect(() => {
    if (loading || !settings || !isActiveTab) return;

    const refreshTime = getSetting('localFileRefreshTime') || 5;
    const intervalId = setInterval(() => refreshFileStatus(true), refreshTime * 1000);
    refreshFileStatus(true);

    return () => clearInterval(intervalId);
  }, [loading, isActiveTab, settings, getSetting, refreshFileStatus]);

  useEffect(() => {
    const handleBranchStatusRefresh = () => refreshBranchStatus();
    window.addEventListener('refresh-branch-status', handleBranchStatusRefresh);
    return () => window.removeEventListener('refresh-branch-status', handleBranchStatusRefresh);
  }, [refreshBranchStatus]);

  useEffect(() => {
    if (!loading && selectedItem == null) {
      setLastContentPanel('local-changes');
      setSelectedItem({ type: 'local-changes' });
    }
  }, [loading, selectedItem]);

  const handleRefreshClick = useCallback(async () => {
    clearBranchCache();
    try {
      if (gitAdapter) {
        setIsBusy(true);
        setBusyMessage('git fetch --tags');
        await gitAdapter.raw(['fetch', '--tags']);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
    await loadRepoData(true);
  }, [gitAdapter, clearBranchCache, loadRepoData]);

  const handleFetchClick = useCallback(async () => {
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage('git fetch origin');
      await gitAdapter.fetch('origin');
      setBusyMessage('Updating branch status...');
      await updateCachedCommitsOriginStatus();
    } catch (error) {
      console.error('Error during fetch:', error);
      setError(`Fetch failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, updateCachedCommitsOriginStatus]);

  const handlePull = useCallback(async (branch: string, stashAndReapply: boolean) => {
    hidePullDialog();
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      
      if (stashAndReapply && hasLocalChanges) {
        setBusyMessage('git stash push');
        await gitAdapter.stashPush(`Auto-stash before pull at ${new Date().toISOString()}`);
      }

      setBusyMessage(`git pull origin ${branch}`);
      await gitAdapter.pull('origin', branch);
      clearBranchCache(branch);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error during pull:', error);
      setError(`Pull failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hidePullDialog, hasLocalChanges, clearBranchCache, loadRepoData]);

  const handlePush = useCallback(async (branch: string, remoteBranch: string, pushAllTags: boolean) => {
    hidePushDialog();
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(pushAllTags 
        ? `git push origin ${branch}:${remoteBranch} --tags`
        : `git push origin ${branch}:${remoteBranch}`
      );
      
      const pushOutput = pushAllTags
        ? await gitAdapter.push('origin', `${branch}:${remoteBranch}`, ['--tags'])
        : await gitAdapter.push('origin', `${branch}:${remoteBranch}`);

      const prUrlMatch = pushOutput.match(/https?:\/\/[^\s\)]+\/pull\/new\/[^\s\)]+/);
      if (prUrlMatch) {
        showPullRequestDialog(prUrlMatch[0], branch);
      }

      await loadRepoData(true);
    } catch (error: any) {
      const prUrlMatch = error.message?.match(/https?:\/\/[^\s\)]+\/pull\/new\/[^\s\)]+/);
      if (prUrlMatch) {
        showPullRequestDialog(prUrlMatch[0], branch);
      } else {
        setError(`Push failed: ${error.message}`);
      }
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hidePushDialog, loadRepoData, showPullRequestDialog]);

  const handleBranchSwitch = useCallback(async (branchName: string) => {
    if (hasLocalChanges) {
      showLocalChangesDialog(branchName);
      return;
    }
    await performBranchSwitch(branchName);
  }, [hasLocalChanges, showLocalChangesDialog]);

  const performBranchSwitch = useCallback(async (branchName: string, skipBusyManagement = false) => {
    if (!gitAdapter) return;

    try {
      if (!skipBusyManagement) {
        setIsBusy(true);
        setBusyMessage(`git checkout ${branchName}`);
      }
      
      await gitAdapter.checkoutBranch(branchName);

      const branchStashMessage = `branch-stash-${branchName}`;
      const stashList = await gitAdapter.stashList();
      const branchStash = stashList.all.find((stash, index) => {
        if (stash.message.includes(branchStashMessage)) {
          stash.index = index;
          return true;
        }
        return false;
      });

      if (branchStash) {
        setBusyMessage('Applying branch stash');
        await gitAdapter.raw(['stash', 'apply', `stash@{${branchStash.index}}`]);
        await gitAdapter.raw(['stash', 'drop', `stash@{${branchStash.index}}`]);
        await refreshFileStatus(false);
      }
    } catch (error) {
      console.error('Error switching branch:', error);
      setError(`Branch switch failed: ${(error as Error).message}`);
    } finally {
      if (!skipBusyManagement) {
        setIsBusy(false);
        setBusyMessage('');
      }
    }
  }, [gitAdapter, refreshFileStatus]);

  const handleLocalChangesDialog = useCallback(async (option: string) => {
    hideLocalChangesDialog();
    const branchName = pendingState.pendingBranchSwitch;
    if (!branchName || !gitAdapter) return;

    try {
      setIsBusy(true);

      switch (option) {
        case 'leave-alone':
          await performBranchSwitch(branchName, true);
          break;
        case 'stash-and-reapply':
          setBusyMessage('git stash push');
          await gitAdapter.stashPush(`Auto-stash before switching to ${branchName}`);
          await performBranchSwitch(branchName, true);
          try {
            await gitAdapter.stashPop();
          } catch (err) {
            setError(`Stash reapplied but could not be removed: ${(err as Error).message}`);
          }
          await refreshFileStatus(false);
          await refreshStashes();
          break;
        case 'discard':
          if (stagedFiles.length > 0) {
            setBusyMessage(`git reset`);
            await gitAdapter.reset(stagedFiles.map(f => f.path));
          }
          if (unstagedFiles.length > 0) {
            setBusyMessage(`git checkout`);
            await gitAdapter.discard(unstagedFiles.map(f => f.path));
          }
          await performBranchSwitch(branchName, true);
          break;
        case 'branch-stash':
          const stashMessage = `branch-stash-${currentBranch}`;
          setBusyMessage(`git stash push -m "${stashMessage}"`);
          await gitAdapter.stashPush(stashMessage);
          await performBranchSwitch(branchName, true);
          await refreshStashes();
          break;
      }
    } catch (error) {
      console.error('Error handling local changes:', error);
      setError(`Failed to handle local changes: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideLocalChangesDialog, pendingState.pendingBranchSwitch, performBranchSwitch, 
      refreshFileStatus, refreshStashes, stagedFiles, unstagedFiles, currentBranch]);

  const handleBranchSelect = useCallback(async (branchName: string) => {
    if (branchCommitsCache.current.has(branchName)) {
      setSelectedItem({
        type: 'branch',
        branchName,
        commits: branchCommitsCache.current.get(branchName),
        loading: false
      });
      return;
    }

    currentBranchLoadId.current += 1;
    const thisLoadId = currentBranchLoadId.current;

    if (!gitAdapter) return;

    setSelectedItem({ type: 'branch', branchName, commits: [], loading: true });

    try {
      const commits = await gitAdapter.log(branchName, 100);
      updateBranchCache(branchName, commits);

      if (thisLoadId === currentBranchLoadId.current) {
        setSelectedItem({ type: 'branch', branchName, commits, loading: false });
      }
    } catch (error) {
      console.error('Error loading branch commits:', error);
      if (thisLoadId === currentBranchLoadId.current) {
        setError(`Failed to load commits: ${(error as Error).message}`);
        setSelectedItem({ type: 'branch', branchName, commits: [], loading: false });
      }
    }
  }, [gitAdapter, branchCommitsCache, updateBranchCache]);

  const handleCreateBranch = useCallback(async (branchName: string, checkoutAfterCreate: boolean) => {
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git branch ${branchName}`);
      await gitAdapter.createBranch(branchName);

      if (checkoutAfterCreate) {
        setBusyMessage(`git checkout ${branchName}`);
        await gitAdapter.checkoutBranch(branchName);
        await handleBranchSelect(branchName);
      }

      await loadRepoData(true);
    } catch (error) {
      console.error('Error creating branch:', error);
      setError(`Branch creation failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, handleBranchSelect, loadRepoData]);

  const handleDeleteBranchDialog = useCallback(async ({ deleteRemote }: { deleteRemote: boolean }) => {
    hideDeleteBranchDialog();
    const branchName = pendingState.branchToDelete;
    if (!branchName || !gitAdapter) return;

    try {
      setIsBusy(true);
      
      if (branchName === currentBranch) {
        setError('Cannot delete the currently active branch');
        return;
      }

      setBusyMessage(`git branch -D ${branchName}`);
      await gitAdapter.raw(['branch', '-D', branchName]);

      if (deleteRemote) {
        setBusyMessage(`git push origin --delete ${branchName}`);
        await gitAdapter.raw(['push', 'origin', '--delete', branchName]);
      }

      await loadRepoData(true);
    } catch (error) {
      console.error('Error deleting branch:', error);
      setError(`Failed to delete branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideDeleteBranchDialog, pendingState.branchToDelete, currentBranch, loadRepoData]);

  const handleRenameBranchDialog = useCallback(async (newName: string) => {
    hideRenameBranchDialog();
    const oldName = pendingState.branchToRename;
    if (!oldName || !gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git branch -m ${oldName} ${newName}`);
      await gitAdapter.raw(['branch', '-m', oldName, newName]);

      if (selectedItem?.type === 'branch' && selectedItem.branchName === oldName) {
        setSelectedItem({ ...selectedItem, branchName: newName });
      }

      if (currentBranch === oldName) {
        setCurrentBranch(newName);
      }

      branchCommitsCache.current.delete(oldName);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error renaming branch:', error);
      setError(`Failed to rename branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideRenameBranchDialog, pendingState.branchToRename, selectedItem, currentBranch, loadRepoData, setCurrentBranch]);

  const handleMergeBranchDialog = useCallback(async ({ sourceBranch, targetBranch, flag }: { sourceBranch: string; targetBranch: string; flag?: string }) => {
    hideMergeBranchDialog();
    if (!gitAdapter || !sourceBranch || !targetBranch) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git merge ${flag || ''} ${sourceBranch}`);
      await gitAdapter.raw(['merge', ...(flag ? [flag] : []), sourceBranch]);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error merging branch:', error);
      setError(`Failed to merge: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideMergeBranchDialog, clearBranchCache, loadRepoData]);

  const handleRebaseBranchDialog = useCallback(async ({ sourceBranch, targetBranch }: { sourceBranch: string; targetBranch: string }) => {
    hideRebaseBranchDialog();
    if (!gitAdapter || !sourceBranch || !targetBranch) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git rebase ${targetBranch}`);
      await gitAdapter.rebase(targetBranch);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error rebasing branch:', error);
      setError(`Failed to rebase: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideRebaseBranchDialog, clearBranchCache, loadRepoData]);

  const handleStash = useCallback(async (message: string, stageNewFiles: boolean) => {
    hideStashDialog();
    if (!gitAdapter) return;

    try {
      setIsBusy(true);

      if (stageNewFiles) {
        const newFiles = unstagedFiles.filter(f => f.status === 'created');
        if (newFiles.length > 0) {
          setBusyMessage('git add');
          await gitAdapter.add(newFiles.map(f => f.path));
        }
      }

      setBusyMessage('git stash push');
      await gitAdapter.stashPush(message || `Stash created at ${new Date().toISOString()}`);
      await refreshFileStatus(false);
      await refreshStashes();
    } catch (error) {
      console.error('Error creating stash:', error);
      setError(`Stash failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideStashDialog, unstagedFiles, refreshFileStatus, refreshStashes]);

  const handleResetToOrigin = useCallback(async () => {
    hideResetDialog();
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git reset --hard origin/${currentBranch}`);
      await gitAdapter.resetToOrigin(currentBranch);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error resetting to origin:', error);
      setError(`Reset to origin failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideResetDialog, currentBranch, clearBranchCache, loadRepoData]);

  const handleCleanWorkingDirectory = useCallback(async () => {
    hideCleanWorkingDirectoryDialog();
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage('git clean -fdx');
      await gitAdapter.raw(['clean', '-fdx']);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error cleaning working directory:', error);
      setError(`Clean working directory failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCleanWorkingDirectoryDialog, loadRepoData]);

  const handleDiscardAllChanges = useCallback(async () => {
    if (modifiedCount === 0 || !gitAdapter) return;

    const confirmed = await showConfirm(`Are you sure you want to discard all ${modifiedCount} local changes?`);
    if (!confirmed) return;

    try {
      setIsBusy(true);

      if (stagedFiles.length > 0) {
        setBusyMessage('git reset');
        await gitAdapter.reset(stagedFiles.map(f => f.path));
      }

      if (unstagedFiles.length > 0) {
        setBusyMessage('git checkout');
        await gitAdapter.discard(unstagedFiles.map(f => f.path));
      }

      await loadRepoData(true);
    } catch (error) {
      console.error('Error discarding changes:', error);
      setError(`Discard changes failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, modifiedCount, stagedFiles, unstagedFiles, showConfirm, loadRepoData]);

  const handleItemSelect = useCallback((item: SelectedItem) => {
    if (item.type !== 'branch' && item.type !== 'remote-branch') {
      currentBranchLoadId.current += 1;
    }
    setSelectedItem(item);
    if (['local-changes', 'branch', 'stash', 'remote-branch'].includes(item.type)) {
      setLastContentPanel(item.type);
    }
  }, []);

  const handleBranchContextMenu = useCallback(async (action: string, branchName: string) => {
    switch (action) {
      case 'checkout':
        handleBranchSwitch(branchName);
        break;
      case 'pull':
        if (branchName === currentBranch) {
          showPullDialog();
        } else {
          await handleFetchClick();
        }
        break;
      case 'push-to-origin':
      case 'push-branch':
        showPushDialog(branchName);
        break;
      case 'merge-into-active':
        showMergeBranchDialog(branchName);
        break;
      case 'rebase-active-onto-branch':
        showRebaseBranchDialog(currentBranch);
        break;
      case 'new-branch':
        showCreateBranchDialog(branchName);
        break;
      case 'new-tag':
        if (gitAdapter) {
          const commits = await gitAdapter.log(branchName, 1);
          if (commits?.[0]) {
            showCreateTagFromCommitDialog(commits[0]);
          }
        }
        break;
      case 'rename':
        showRenameBranchDialog(branchName);
        break;
      case 'delete':
        showDeleteBranchDialog(branchName);
        break;
      case 'copy-branch-name':
        navigator.clipboard.writeText(branchName);
        break;
    }
  }, [gitAdapter, currentBranch, handleBranchSwitch, handleFetchClick, showPullDialog, 
      showPushDialog, showMergeBranchDialog, showRebaseBranchDialog, showCreateBranchDialog,
      showCreateTagFromCommitDialog, showRenameBranchDialog, showDeleteBranchDialog]);

  const handleStashContextMenu = useCallback((action: string, stash: any, stashIndex: number) => {
    switch (action) {
      case 'apply':
        showApplyStashDialog({ message: stash.message, index: stashIndex });
        break;
      case 'rename':
        showRenameStashDialog({ message: stash.message, index: stashIndex });
        break;
      case 'delete':
        showDeleteStashDialog({ message: stash.message, index: stashIndex });
        break;
    }
  }, [showApplyStashDialog, showRenameStashDialog, showDeleteStashDialog]);

  const handleApplyStashDialog = useCallback(async ({ stashIndex, deleteAfterApplying }: { stashIndex: number; deleteAfterApplying: boolean }) => {
    hideApplyStashDialog();
    if (!gitAdapter) return;

    try {
      await gitAdapter.raw(['stash', 'apply', `stash@{${stashIndex}}`]);
      if (deleteAfterApplying) {
        await gitAdapter.raw(['stash', 'drop', `stash@{${stashIndex}}`]);
      }
      await refreshFileStatus(false);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error applying stash:', error);
      setError(`Failed to apply stash: ${(error as Error).message}`);
    }
  }, [gitAdapter, hideApplyStashDialog, refreshFileStatus, loadRepoData]);

  const handleRenameStashDialog = useCallback(async (newName: string) => {
    hideRenameStashDialog();
    const stash = pendingState.stashToRename;
    if (!stash || !gitAdapter) return;

    try {
      const currentMessage = stash.message;
      const currentName = currentMessage.replace(/^On [^:]+:\s*/, '');
      const prefix = currentMessage.substring(0, currentMessage.indexOf(currentName));
      const finalName = prefix + newName;

      const stashContent = await gitAdapter.raw(['show', `stash@{${stash.index}}`]);
      await gitAdapter.raw(['stash', 'drop', `stash@{${stash.index}}`]);
      await gitAdapter.raw(['stash', 'store', '-m', finalName, stashContent]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error renaming stash:', error);
      setError(`Failed to rename stash: ${(error as Error).message}`);
    }
  }, [gitAdapter, hideRenameStashDialog, pendingState.stashToRename, loadRepoData]);

  const handleDeleteStashDialog = useCallback(async (stashIndex: number) => {
    hideDeleteStashDialog();
    if (!gitAdapter) return;

    try {
      await gitAdapter.raw(['stash', 'drop', `stash@{${stashIndex}}`]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error deleting stash:', error);
      setError(`Failed to delete stash: ${(error as Error).message}`);
    }
  }, [gitAdapter, hideDeleteStashDialog, loadRepoData]);

  const loadRemoteBranchCommits = useCallback(async (remoteName: string, branchName: string, fullName: string) => {
    if (branchCommitsCache.current.has(fullName)) {
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

    if (!gitAdapter) return;

    currentBranchLoadId.current += 1;
    const thisLoadId = currentBranchLoadId.current;

    setSelectedItem({ type: 'remote-branch', remoteName, branchName, fullName, commits: [], loading: true });

    try {
      const commits = await gitAdapter.log(fullName, 100);
      updateBranchCache(fullName, commits);

      if (thisLoadId === currentBranchLoadId.current) {
        setSelectedItem({ type: 'remote-branch', remoteName, branchName, fullName, commits, loading: false });
      }
    } catch (error) {
      console.error('Error loading remote branch commits:', error);
      if (thisLoadId === currentBranchLoadId.current) {
        setError(`Failed to load commits: ${(error as Error).message}`);
        setSelectedItem({ type: 'remote-branch', remoteName, branchName, fullName, commits: [], loading: false });
      }
    }
  }, [gitAdapter, branchCommitsCache, updateBranchCache]);

  const handleRemoteBranchSelect = useCallback((info: any) => {
    if (info.type === 'remote-branch' && info.fullName) {
      loadRemoteBranchCommits(info.remoteName, info.branchName, info.fullName);
    } else {
      setSelectedItem(info);
    }
  }, [loadRemoteBranchCommits]);

  const handleDeleteRemoteBranch = useCallback(async (remoteName: string, branchName: string) => {
    const confirmed = await showConfirm(`Delete remote branch '${remoteName}/${branchName}'?`);
    if (!confirmed || !gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git push ${remoteName} --delete ${branchName}`);
      await gitAdapter.raw(['push', remoteName, '--delete', branchName]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error deleting remote branch:', error);
      setError(`Failed to delete remote branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, showConfirm, loadRepoData]);

  const handleCheckoutRemoteBranch = useCallback(async (remoteName: string, branchName: string) => {
    if (!gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git checkout -b ${branchName} ${remoteName}/${branchName}`);
      await gitAdapter.raw(['checkout', '-b', branchName, `${remoteName}/${branchName}`]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error checking out remote branch:', error);
      setError(`Failed to checkout remote branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, loadRepoData]);

  const handleRemoteBranchContextMenu = useCallback(async (action: string, remoteName: string, branchName: string, fullName: string) => {
    switch (action) {
      case 'checkout':
        await handleCheckoutRemoteBranch(remoteName, branchName);
        break;
      case 'merge':
        showMergeBranchDialog(fullName);
        break;
      case 'new-branch':
        const refSpec = `${remoteName}/${branchName}`;
        if (gitAdapter) {
          const result = await gitAdapter.raw(['rev-parse', refSpec]);
          const hash = result.trim();
          const logResult = await gitAdapter.raw(['log', '-1', '--format=%H|%an|%ae|%ad|%s', '--date=short', hash]);
          const [h, author, email, date, message] = logResult.trim().split('|');
          showCreateBranchFromCommitDialog({ hash: h, author_name: author, author_email: email, date, message, body: '', onOrigin: true, tags: [] });
        }
        break;
      case 'new-tag':
        if (gitAdapter) {
          await gitAdapter.fetch(remoteName);
          const result = await gitAdapter.raw(['rev-parse', `${remoteName}/${branchName}`]);
          const logResult = await gitAdapter.raw(['log', '-1', '--format=%H|%an|%ae|%ad|%s', '--date=short', result.trim()]);
          const [h, author, email, date, message] = logResult.trim().split('|');
          showCreateTagFromCommitDialog({ hash: h, author_name: author, author_email: email, date, message, body: '', onOrigin: true, tags: [] });
        }
        break;
      case 'delete':
        handleDeleteRemoteBranch(remoteName, branchName);
        break;
      case 'copy-name':
        navigator.clipboard.writeText(fullName);
        break;
    }
  }, [gitAdapter, handleCheckoutRemoteBranch, showMergeBranchDialog, showCreateBranchFromCommitDialog, showCreateTagFromCommitDialog, handleDeleteRemoteBranch]);

  const handleCreateBranchFromCommit = useCallback(async (branchName: string, checkoutAfterCreate: boolean) => {
    const commit = pendingState.commitForDialog;
    hideCreateBranchFromCommitDialog();
    if (!commit || !gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git checkout -b ${branchName} ${commit.hash}`);
      await gitAdapter.raw(['checkout', '-b', branchName, commit.hash]);
      
      if (checkoutAfterCreate) {
        await handleBranchSelect(branchName);
      }
      
      await loadRepoData(true);
    } catch (error) {
      console.error('Error creating branch from commit:', error);
      setError(`Branch creation failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCreateBranchFromCommitDialog, pendingState.commitForDialog, handleBranchSelect, loadRepoData]);

  const handleCreateTagFromCommit = useCallback(async (tagName: string, tagMessage: string) => {
    const commit = pendingState.commitForDialog;
    hideCreateTagFromCommitDialog();
    if (!commit || !gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(tagMessage ? `git tag -a ${tagName} -m "${tagMessage}"` : `git tag ${tagName}`);
      
      if (tagMessage) {
        await gitAdapter.raw(['tag', '-a', tagName, '-m', tagMessage, commit.hash]);
      } else {
        await gitAdapter.raw(['tag', tagName, commit.hash]);
      }

      clearBranchCache();
      await loadRepoData(true);

      // Refresh the currently selected branch to show the new tag
      if (selectedItem?.type === 'branch' && selectedItem.branchName) {
        await handleBranchSelect(selectedItem.branchName);
      }
    } catch (error) {
      console.error('Error creating tag from commit:', error);
      setError(`Tag creation failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCreateTagFromCommitDialog, pendingState.commitForDialog, clearBranchCache, loadRepoData, selectedItem, handleBranchSelect]);

  const handleAmendCommit = useCallback(async (newMessage: string) => {
    const commit = pendingState.commitForDialog;
    hideAmendCommitDialog();
    if (!commit || !gitAdapter) return;

    try {
      setIsBusy(true);
      setBusyMessage(`git commit --amend -m "${newMessage.replace(/"/g, '\\"')}"`);
      await gitAdapter.raw(['commit', '--amend', '-m', newMessage]);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error amending commit:', error);
      setError(`Failed to amend commit: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideAmendCommitDialog, pendingState.commitForDialog, clearBranchCache, loadRepoData]);

  const handleCommitContextMenu = useCallback(async (action: string, commit: Commit, _currentBranch: string, tagName?: string) => {
    if (!gitAdapter) return;

    switch (action) {
      case 'new-branch':
        showCreateBranchFromCommitDialog(commit);
        break;
      case 'new-tag':
        showCreateTagFromCommitDialog(commit);
        break;
      case 'show-tag-details':
        if (tagName) {
          const tagInfo = await gitAdapter.raw(['show', tagName]);
          showAlert(`Tag: ${tagName}\n\n${tagInfo}`, 'Tag details');
        }
        break;
      case 'copy-tag-name':
        if (tagName) navigator.clipboard.writeText(tagName);
        break;
      case 'delete-tag':
        if (tagName) {
          const confirmed = await showConfirm(`Delete tag '${tagName}'?`);
          if (confirmed) {
            await gitAdapter.raw(['tag', '-d', tagName]);
            clearBranchCache();
            await loadRepoData(true);
            // Refresh the currently selected branch to remove the deleted tag
            if (selectedItem?.type === 'branch' && selectedItem.branchName) {
              await handleBranchSelect(selectedItem.branchName);
            }
          }
        }
        break;
      case 'push-tag':
        if (tagName) {
          await gitAdapter.raw(['push', 'origin', tagName]);
        }
        break;
      case 'checkout-commit':
        if (await showConfirm(`Checkout commit ${commit.hash.substring(0, 7)}?`)) {
          await gitAdapter.checkoutBranch(commit.hash);
          await loadRepoData(true);
        }
        break;
      case 'cherry-pick':
        if (await showConfirm(`Cherry-pick ${commit.hash.substring(0, 7)}?`)) {
          await gitAdapter.raw(['cherry-pick', commit.hash]);
          clearBranchCache();
          await loadRepoData(true);
        }
        break;
      case 'revert-commit':
        if (await showConfirm(`Revert ${commit.hash.substring(0, 7)}?`)) {
          await gitAdapter.raw(['revert', commit.hash]);
          clearBranchCache();
          await loadRepoData(true);
        }
        break;
      case 'reset-to-here':
        if (await showConfirm(`Reset to ${commit.hash.substring(0, 7)}?`)) {
          await gitAdapter.raw(['reset', '--hard', commit.hash]);
          clearBranchCache();
          await loadRepoData(true);
        }
        break;
      case 'amend-commit':
        showAmendCommitDialog(commit);
        break;
      case 'copy-sha':
        navigator.clipboard.writeText(commit.hash);
        break;
      case 'copy-info':
        const info = `Commit: ${commit.hash.substring(0, 7)}\nAuthor: ${commit.author_name}\nDate: ${commit.date}\n\n${commit.message}`;
        navigator.clipboard.writeText(info);
        break;
      case 'save-patch':
        const patchContent = await gitAdapter.raw(['format-patch', '-1', commit.hash]);
        const blob = new Blob([patchContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${commit.hash.substring(0, 7)}.patch`;
        a.click();
        URL.revokeObjectURL(url);
        break;
    }
  }, [gitAdapter, showAlert, showConfirm, showCreateBranchFromCommitDialog, showCreateTagFromCommitDialog, showAmendCommitDialog, clearBranchCache, loadRepoData, selectedItem, handleBranchSelect]);

  const handleMouseDown = useCallback((splitterIndex: number | string) => {
    activeSplitter.current = splitterIndex;
  }, []);

  const handleMouseUp = useCallback(() => {
    activeSplitter.current = null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeSplitter.current === null) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();

    if (activeSplitter.current === 'horizontal') {
      const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
      if (mouseX >= 20 && mouseX <= 50) {
        setLeftWidth(mouseX);
      }
    } else {
      const mouseY = ((e.clientY - rect.top) / rect.height) * 100;
      if (mouseY >= 20 && mouseY <= 80) {
        setBranchesHeight(mouseY);
      }
    }
  }, []);

  const handleCancelOperation = useCallback(() => {
    console.log('Cancelling git operation...');
    setIsBusy(false);
    setBusyMessage('');
  }, []);

  return (
    <div className="repository-view">
      <Toolbar 
        runningCommands={commandState} 
        onRefresh={handleRefreshClick} 
        onFetch={handleFetchClick} 
        onPull={() => showPullDialog()} 
        onPush={() => showPushDialog(currentBranch)} 
        onStash={hasLocalChanges ? () => showStashDialog() : null} 
        onCreateBranch={() => showCreateBranchDialog()} 
        refreshing={refreshing} 
        currentBranch={currentBranch} 
        branchStatus={branchStatus} 
      />
      <div
        className="repo-content-horizontal"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isBusy && (
          <div className="repo-busy-overlay">
            <div className="repo-busy-spinner"></div>
            <div className="repo-busy-message">{busyMessage || 'Processing...'}</div>
            <button className="repo-busy-cancel-button" onClick={handleCancelOperation}>
              Cancel
            </button>
          </div>
        )}
        {loading && <div className="loading">Loading repository...</div>}
        {error && dialogStates.showErrorDialog && (
          <ErrorDialog
            error={error}
            onClose={() => { setError(null); hideErrorDialog(); }}
          />
        )}
        {!loading && !error && (
          <>
            <div className="repo-sidebar" style={{ width: `${leftWidth}%` }}>
              <RepoInfo
                gitAdapter={gitAdapter}
                currentBranch={currentBranch}
                originUrl={originUrl}
                modifiedCount={modifiedCount}
                selectedItem={selectedItem}
                onSelectItem={handleItemSelect}
                usingCache={usingCache}
                onResetToOrigin={() => showResetDialog()}
                onCleanWorkingDirectory={() => showCleanWorkingDirectoryDialog()}
                onGitGC={async () => { if (gitAdapter) await gitAdapter.raw(['gc']); }}
                onOriginChanged={async () => { if (gitAdapter) setOriginUrl(await gitAdapter.getOriginUrl()); }}
                onStashChanges={hasLocalChanges ? () => showStashDialog() : undefined}
                onDiscardChanges={hasLocalChanges ? handleDiscardAllChanges : undefined}
                onRefresh={() => loadRepoData(true)}
                onError={setError}
              />
              <div className="branch-stash-panel">
                <BranchStashPanel
                  branches={branches}
                  currentBranch={currentBranch}
                  branchStatus={branchStatus}
                  onBranchSwitch={handleBranchSwitch}
                  pullingBranch={pendingState.pullingBranch}
                  onBranchSelect={handleBranchSelect}
                  stashes={stashes}
                  onSelectStash={(stash) => handleItemSelect({ type: 'stash', ...stash })}
                  selectedItem={selectedItem}
                  onMouseDown={handleMouseDown}
                  onBranchContextMenu={handleBranchContextMenu}
                  onStashContextMenu={handleStashContextMenu}
                  remotes={remotes}
                  onSelectRemoteBranch={handleRemoteBranchSelect}
                  onRemoteBranchAction={handleRemoteBranchContextMenu}
                  onRemoteAdded={() => loadRepoData(true)}
                  gitAdapter={gitAdapter}
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
                gitAdapter={gitAdapter}
                onRefresh={() => refreshFileStatus(false)}
                onBranchStatusRefresh={refreshBranchStatus}
                onContextMenu={handleCommitContextMenu}
                currentBranch={currentBranch}
                branchStatus={branchStatus}
                onError={setError}
                onBusyChange={setIsBusy}
                onBusyMessageChange={setBusyMessage}
                onCommitCreated={() => clearBranchCache(currentBranch)}
              />
            </div>
          </>
        )}
      </div>

      {dialogStates.showPullDialog && (
        <PullDialog
          onClose={hidePullDialog}
          onPull={handlePull}
          branches={branches}
          currentBranch={currentBranch}
        />
      )}
      {dialogStates.showPushDialog && (
        <PushDialog
          onClose={hidePushDialog}
          onPush={handlePush}
          branches={branches}
          currentBranch={dialogStates.showPushDialog}
        />
      )}
      {dialogStates.showStashDialog && (
        <StashDialog
          onClose={hideStashDialog}
          onStash={handleStash}
        />
      )}
      {dialogStates.showResetDialog && (
        <ResetToOriginDialog
          onClose={hideResetDialog}
          onReset={handleResetToOrigin}
        />
      )}
      {dialogStates.showLocalChangesDialog && (
        <LocalChangesDialog
          onClose={hideLocalChangesDialog}
          onProceed={handleLocalChangesDialog}
          targetBranch={pendingState.pendingBranchSwitch}
        />
      )}
      {dialogStates.showCreateBranchDialog && (
        <CreateBranchDialog
          onClose={hideCreateBranchDialog}
          onCreateBranch={handleCreateBranch}
          currentBranch={pendingState.newBranchFrom || currentBranch}
          gitAdapter={gitAdapter}
          branches={branches}
        />
      )}
      {dialogStates.showCreateBranchFromCommitDialog && (
        <CreateBranchFromCommitDialog
          onClose={hideCreateBranchFromCommitDialog}
          onCreateBranch={handleCreateBranchFromCommit}
          commitHash={pendingState.commitForDialog?.hash || ''}
          commitMessage={pendingState.commitForDialog?.message || ''}
        />
      )}
      {dialogStates.showCreateTagFromCommitDialog && (
        <CreateTagFromCommitDialog
          onClose={hideCreateTagFromCommitDialog}
          onCreateTag={handleCreateTagFromCommit}
          commitHash={pendingState.commitForDialog?.hash || ''}
          commitMessage={pendingState.commitForDialog?.message || ''}
        />
      )}
      {dialogStates.showAmendCommitDialog && (
        <AmendCommitDialog
          onClose={hideAmendCommitDialog}
          onAmend={handleAmendCommit}
          commitMessage={pendingState.commitForDialog?.message || ''}
        />
      )}
      {dialogStates.showDeleteBranchDialog && (
        <DeleteBranchDialog
          onClose={hideDeleteBranchDialog}
          onConfirm={handleDeleteBranchDialog}
          branchName={pendingState.branchToDelete}
        />
      )}
      {dialogStates.showRenameBranchDialog && (
        <RenameBranchDialog
          onClose={hideRenameBranchDialog}
          onRename={handleRenameBranchDialog}
          currentBranchName={pendingState.branchToRename}
        />
      )}
      {dialogStates.showMergeBranchDialog && (
        <MergeBranchDialog
          onClose={hideMergeBranchDialog}
          onMerge={handleMergeBranchDialog}
          sourceBranch={pendingState.mergeSourceBranch}
          targetBranch={currentBranch}
          gitAdapter={gitAdapter}
        />
      )}
      {dialogStates.showRebaseBranchDialog && (
        <RebaseBranchDialog
          onClose={hideRebaseBranchDialog}
          onRebase={handleRebaseBranchDialog}
          sourceBranch={pendingState.rebaseSourceBranch}
          targetBranch={currentBranch}
          gitAdapter={gitAdapter}
        />
      )}
      {dialogStates.showApplyStashDialog && (
        <ApplyStashDialog
          onClose={hideApplyStashDialog}
          onApply={handleApplyStashDialog}
          stashMessage={pendingState.stashToApply?.message || ''}
          stashIndex={pendingState.stashToApply?.index || 0}
        />
      )}
      {dialogStates.showRenameStashDialog && (
        <RenameStashDialog
          onClose={hideRenameStashDialog}
          onRename={handleRenameStashDialog}
          currentStashName={pendingState.stashToRename?.message.replace(/^On [^:]+:\s*/, '') || ''}
          stashIndex={pendingState.stashToRename?.index || 0}
        />
      )}
      {dialogStates.showDeleteStashDialog && (
        <DeleteStashDialog
          onClose={hideDeleteStashDialog}
          onDelete={handleDeleteStashDialog}
          stashMessage={pendingState.stashToDelete?.message || ''}
          stashIndex={pendingState.stashToDelete?.index || 0}
        />
      )}
      {dialogStates.showCleanWorkingDirectoryDialog && (
        <CleanWorkingDirectoryDialog
          onClose={hideCleanWorkingDirectoryDialog}
          onClean={handleCleanWorkingDirectory}
        />
      )}
      {dialogStates.showPullRequestDialog && (
        <PullRequestDialog
          prUrl={pendingState.pullRequestUrl}
          branchName={pendingState.pullRequestBranch}
          onClose={hidePullRequestDialog}
        />
      )}
    </div>
  );
}

export default RepositoryView;
