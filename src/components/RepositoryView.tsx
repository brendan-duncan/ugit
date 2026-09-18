import React, { useState, useEffect, useRef, useCallback } from 'react';
import RepoInfo from './RepoInfo';
import BranchStashPanel from './BranchStashPanel';
import ErrorDialog from './ErrorDialog';
import CreateBranchDialog from './CreateBranchDialog';
import DeleteBranchDialog from './DeleteBranchDialog';
import RenameBranchDialog from './RenameBranchDialog';
import MergeBranchDialog from './MergeBranchDialog';
import RebaseBranchDialog from './RebaseBranchDialog';
import RebaseBanner from './RebaseBanner';
import InteractiveRebaseDialog from './InteractiveRebaseDialog';
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
import ConfirmDialog from './ConfirmDialog';
import CreateWorktreeDialog, { CreateWorktreeParams } from './CreateWorktreeDialog';
import { ipcRenderer, shell } from 'electron';
import path from 'path';
import { convertGitSshToHttps } from '../utils/utils';
import { useGitAdapter, useRepositoryData } from '../hooks/useGit';
import { useRepositoryViewDialogs } from '../hooks/useRepositoryViewDialogs';
import { useSettings } from '../contexts/SettingsContext';
import { useAlert } from '../contexts/AlertContext';
import cacheManager from '../utils/cacheManager';
import { GitAdapter, Commit, IncompleteHistoryError, RebaseStatus, RebaseTodoEntry, SearchQuery, WorktreeInfo } from "../git/GitAdapter"
import { RunningCommand, RemoteInfo, FileInfo, SelectedItem } from './types';
import './RepositoryView.css';

interface RepositoryViewProps {
  repoPath: string;
  isActiveTab: boolean;
  onTabStatusChange?: (status: { ahead: number; behind: number } | null) => void;
  // Incremented by the parent to request a reload from git (e.g. after init).
  refreshSignal?: number;
  // Open a repository/worktree path as a tab (provided by App).
  onOpenRepository?: (repoPath: string) => void;
}

// How often to ask the remote whether it has moved. This is an `ls-remote` probe,
// not a fetch: one round trip, no object transfer, and it cannot trigger git's
// automatic maintenance. A real fetch only follows when the SHA actually changed.
const REMOTE_POLL_INTERVAL_MS = 5 * 60 * 1000;
// Floor on the interval expressed as a multiple of how long the last fetch took, so
// a repository whose fetches take minutes automatically polls less often. Without
// this, a fetch slower than the interval leaves ticks queueing behind each other.
const REMOTE_POLL_FETCH_COST_FACTOR = 4;
// Ceiling for the failure backoff. A remote that is unreachable - or a repository
// that cannot complete a fetch at all - must not be retried every interval forever;
// each failed attempt on a large repo can abandon hundreds of megabytes of pack.
const REMOTE_POLL_MAX_BACKOFF_MS = 60 * 60 * 1000;

function RepositoryView({ repoPath, isActiveTab, onTabStatusChange, refreshSignal = 0, onOpenRepository }: RepositoryViewProps) {
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
  const [errorTitle, setErrorTitle] = useState<string | undefined>(undefined);
  const [rebaseStatus, setRebaseStatus] = useState<RebaseStatus | null>(null);
  // Commits gathered for the interactive rebase editor, and what they replay onto.
  const [interactiveRebase, setInteractiveRebase] =
    useState<{ base: string | null; commits: Commit[]; ontoLabel: string } | null>(null);
  // Bumped by any command that brings new commits into the repository. The selected
  // branch's commit list was rendered from the cache as it stood before the command
  // ran, so it has to be reloaded; see the effect next to the branch loaders.
  const [commitViewReloadKey, setCommitViewReloadKey] = useState(0);

  const activeSplitter = useRef<number | string | null>(null);
  const currentBranchLoadId = useRef(0);
  const isBusyRef = useRef(false);
  const refreshInFlight = useRef(false);
  // Guards the Refresh button specifically. Separate from refreshInFlight, which
  // drops ticks of the background file-status poll, and read synchronously so a
  // double-click can't start a second reload before `refreshing` re-renders.
  const manualRefreshInFlight = useRef(false);
  const remoteFetchInFlight = useRef(false);
  const branchStatusRef = useRef<{ [branchName: string]: { ahead: number; behind: number } }>({});
  const currentBranchCacheRef = useRef<string>('');
  // Last background remote-status failure, shown inline rather than as a dialog:
  // polling runs unattended, so a modal on every failed tick would be unusable.
  const [remoteStatusError, setRemoteStatusError] = useState<string | null>(null);

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
    worktrees,
    loading: repoLoading,
    usingCache,
    error: repoError,
    setError: setRepoError,
    branchCommitsCache,
    loadRepoData,
    refreshStashes,
    refreshWorktrees,
    updateBranchCache,
    clearBranchCache,
    getFileStatusType
  } = useRepositoryData(repoPath, gitAdapter);

  // Reload from git when the parent bumps the refresh signal (e.g. after init).
  // Skip the initial mount value so we don't double-load on top of the mount fetch.
  const prevRefreshSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal !== prevRefreshSignal.current) {
      prevRefreshSignal.current = refreshSignal;
      if (gitAdapter) {
        loadRepoData(true);
      }
    }
  }, [refreshSignal, gitAdapter, loadRepoData]);

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
    showCheckoutCommitDialog,
    hideCheckoutCommitDialog,
    showCreateWorktreeDialog,
    hideCreateWorktreeDialog,
  } = useRepositoryViewDialogs();

  const loading = gitLoading || repoLoading;
  
  const hasLocalChanges = unstagedFiles.length > 0 || stagedFiles.length > 0;

  const setErrorWithDialog = useCallback((err: string, title?: string) => {
    setError(err);
    setErrorTitle(title);
    showErrorDialog();
  }, [showErrorDialog]);

  const updateCachedCommitsOriginStatus = useCallback(async () => {
    const git = gitAdapter;
    if (!git)
      return;

    const cachedBranches = Array.from(branchCommitsCache.current.keys());
    if (cachedBranches.length === 0)
      return;

    for (const branchName of cachedBranches) {
      if (branchName.startsWith('origin/'))
        continue;

      const entry = branchCommitsCache.current.get(branchName);
      if (!entry || !entry.pages)
        continue;

      const allCommits: Commit[] = Object.values(entry.pages).flat();
      if (allCommits.length === 0)
        continue;

      const commitsToCheck = allCommits.filter((commit: Commit) => commit.onOrigin === false);
      if (commitsToCheck.length === 0)
        continue;

      for (const commit of commitsToCheck) {
        try {
          const unpushedCommits = await git.raw(['branch', '-r', `--contains`, `${commit.hash}`]);
          commit.onOrigin = unpushedCommits.trim().length !== 0;
        } catch {
          commit.onOrigin = false;
        }
      }

      updateBranchCache(branchName, entry);
    }
  }, [gitAdapter, branchCommitsCache, updateBranchCache]);

  const refreshFileStatus = useCallback(async (noLock: boolean) => {
    if (!gitAdapter || !currentBranch)
      return;

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

      // Only touch the on-disk cache when something the cache stores actually changed:
      // the current branch or this branch's ahead/behind counts. The unstaged/staged
      // file lists are no longer cached (rebuilt from git status on open), so the
      // sync I/O storm during huge working-tree changes is gone.
      const branchName = status.current;
      if (!branchName)
        return;

      const newAhead = status.ahead;
      const newBehind = status.behind;
      const prevStatus = branchStatusRef.current[branchName];
      const branchChanged = branchName !== currentBranchCacheRef.current;

      let aheadBehindChanged = false;
      if (newAhead !== undefined && newBehind !== undefined) {
        const newHasStatus = newAhead > 0 || newBehind > 0;
        const prevHasStatus = !!prevStatus;
        if (newHasStatus !== prevHasStatus) {
          aheadBehindChanged = true;
        } else if (newHasStatus && prevStatus && (prevStatus.ahead !== newAhead || prevStatus.behind !== newBehind)) {
          aheadBehindChanged = true;
        }
      }

      if (!branchChanged && !aheadBehindChanged)
        return;

      const cacheData = cacheManager.loadCache(repoPath) || {};
      cacheData.currentBranch = branchName;
      if (newAhead !== undefined && newBehind !== undefined) {
        if (!cacheData.branchStatus) cacheData.branchStatus = {};
        if (newAhead > 0 || newBehind > 0) {
          cacheData.branchStatus[branchName] = { ahead: newAhead, behind: newBehind };
        } else {
          delete cacheData.branchStatus[branchName];
        }
      }
      cacheManager.saveCache(repoPath, cacheData);
      currentBranchCacheRef.current = branchName;
    } catch (err) {
      console.error('Error refreshing file status:', err);
    }
  }, [gitAdapter, currentBranch, repoPath, getFileStatusType, setCurrentBranch, setUnstagedFiles, setStagedFiles, setModifiedCount]);

  const refreshBranchStatus = useCallback(async () => {
    if (!gitAdapter)
      return;

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

  const refreshRebaseStatus = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      const status = await gitAdapter.getRebaseStatus();
      setRebaseStatus(status);
    } catch (error) {
      console.error('Error checking rebase status:', error);
    }
  }, [gitAdapter]);

  useEffect(() => {
    branchStatusRef.current = branchStatus;
  }, [branchStatus]);

  // Whenever the current branch's ahead/behind changes from any source
  // (initial load, fetch, pull, push, branch-status refresh), mirror it to the
  // tab indicator immediately instead of waiting for the 5-minute remote fetch
  // tick. The Pull/Push toolbar buttons already show this count — the tab
  // should too.
  useEffect(() => {
    if (!currentBranch || !onTabStatusChange)
      return;
    const s = branchStatus[currentBranch];
    if (s && (s.ahead > 0 || s.behind > 0)) {
      onTabStatusChange({ ahead: s.ahead, behind: s.behind });
    } else {
      onTabStatusChange(null);
    }
  }, [branchStatus, currentBranch, onTabStatusChange]);

  useEffect(() => {
    if (loading || !settings || !isActiveTab)
      return;

    const refreshTime = getSetting('localFileRefreshTime') || 5;
    const refresh = async () => {
      // Drop ticks if the previous one is still running. With a huge working
      // tree, `git status` can take longer than the poll interval; without this
      // guard, ticks stack up and the renderer falls further behind.
      if (refreshInFlight.current)
        return;
      refreshInFlight.current = true;
      try {
        await Promise.allSettled([refreshFileStatus(true), refreshRebaseStatus()]);
      } finally {
        refreshInFlight.current = false;
      }
    };
    const intervalId = setInterval(refresh, refreshTime * 1000);
    refresh();

    return () => clearInterval(intervalId);
  }, [loading, isActiveTab, settings, getSetting, refreshFileStatus, refreshRebaseStatus]);

  useEffect(() => {
    const handleBranchStatusRefresh = () => refreshBranchStatus();
    window.addEventListener('refresh-branch-status', handleBranchStatusRefresh);
    return () => window.removeEventListener('refresh-branch-status', handleBranchStatusRefresh);
  }, [refreshBranchStatus]);

  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  // Keep the ahead/behind indicator current without fetching on a fixed timer.
  //
  // This polled `git fetch origin --prune` every five minutes regardless of whether
  // anything had changed. On a large repository that is actively harmful: a fetch
  // can take longer than the interval, every fetch makes git consider running
  // automatic maintenance, and a fetch that dies mid-transfer leaves an abandoned
  // pack temporary behind that git never reclaims. Instead, ask the remote for the
  // branch SHA (cheap, read-only) and fetch only when it differs from ours.
  //
  // Self-scheduling timeout rather than setInterval so the delay can adapt to how
  // expensive fetching this repository actually is.
  useEffect(() => {
    if (loading || !gitAdapter || !currentBranch)
      return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;
    let lastFetchDurationMs = 0;

    const nextDelay = () => {
      if (consecutiveFailures > 0) {
        return Math.min(REMOTE_POLL_INTERVAL_MS * 2 ** consecutiveFailures, REMOTE_POLL_MAX_BACKOFF_MS);
      }
      return Math.max(REMOTE_POLL_INTERVAL_MS, lastFetchDurationMs * REMOTE_POLL_FETCH_COST_FACTOR);
    };

    const updateLocalStatus = async () => {
      let status: { ahead: number; behind: number } | null = null;
      try {
        // Compares local refs only - no network.
        const { ahead, behind } = await gitAdapter.getAheadBehind(currentBranch, `origin/${currentBranch}`);
        if (ahead > 0 || behind > 0) {
          status = { ahead, behind };
        }
      } catch {
        status = null;
      }
      if (cancelled)
        return;

      setBranchStatus(prev => {
        const next = { ...prev };
        if (status) {
          next[currentBranch] = status;
        } else {
          delete next[currentBranch];
        }
        return next;
      });
      // No direct onTabStatusChange call — the branchStatus useEffect above
      // mirrors current-branch status to the tab indicator on every change.
    };

    const checkRemoteStatus = async () => {
      if (cancelled)
        return;

      // Skip a tab the user isn't looking at, and never queue behind another git
      // command - ours or one the user started. A dropped tick costs nothing.
      if (document.hidden || isBusyRef.current || remoteFetchInFlight.current) {
        timer = setTimeout(checkRemoteStatus, nextDelay());
        return;
      }

      remoteFetchInFlight.current = true;
      try {
        if (await gitAdapter.isRepoBusy())
          return;

        const remoteSha = await gitAdapter.getRemoteHeadSha('origin', currentBranch);
        if (cancelled)
          return;

        if (remoteSha) {
          const localSha = (await gitAdapter.raw(
            ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${currentBranch}`])).trim();
          if (remoteSha !== localSha) {
            // Only this branch, not every ref: the indicator needs one branch, and
            // a full fetch on a repository with thousands of refs is not free.
            const startedAt = Date.now();
            if (await gitAdapter.fetchIfIdle('origin', [currentBranch]))
              lastFetchDurationMs = Date.now() - startedAt;
            if (cancelled)
              return;
          }
        }

        consecutiveFailures = 0;
        setRemoteStatusError(null);
        await updateLocalStatus();
      } catch (error) {
        consecutiveFailures++;
        // Surface it instead of retrying silently: the previous code swallowed these,
        // so a repository that could not fetch at all kept trying every five minutes
        // with nothing shown to the user.
        console.error('Remote status check failed:', error);
        if (!cancelled)
          setRemoteStatusError((error as Error).message || 'Could not reach origin');
      } finally {
        remoteFetchInFlight.current = false;
        if (!cancelled)
          timer = setTimeout(checkRemoteStatus, nextDelay());
      }
    };

    checkRemoteStatus();

    return () => {
      cancelled = true;
      if (timer)
        clearTimeout(timer);
    };
  }, [loading, gitAdapter, currentBranch, setBranchStatus]);

  useEffect(() => {
    if (!loading && selectedItem == null) {
      setLastContentPanel('local-changes');
      setSelectedItem({ type: 'local-changes' });
    }
  }, [loading, selectedItem]);

  // Re-read the repository from disk, without touching the network. This is what
  // picks up work done outside ugit - a commit from a terminal, a branch someone's
  // script created, a stash from another tool - none of which a fetch would show.
  // Anything that needs the remote belongs to Fetch and Pull.
  const handleRefreshClick = useCallback(async () => {
    if (!gitAdapter || manualRefreshInFlight.current)
      return;

    manualRefreshInFlight.current = true;
    setRefreshing(true);
    try {
      clearBranchCache();
      await loadRepoData(true);
      await refreshRebaseStatus();
      setCommitViewReloadKey(key => key + 1);
    } catch (error) {
      console.error('Error refreshing repository:', error);
      setErrorWithDialog(`Refresh failed: ${(error as Error).message}`);
    } finally {
      manualRefreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [gitAdapter, clearBranchCache, loadRepoData, refreshRebaseStatus, setErrorWithDialog]);

  const handleFetchClick = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      setBusyMessage('git fetch origin --tags --prune');
      // --tags belongs here rather than on Refresh, which no longer touches the
      // network. git already fetches tags reachable from the refs it downloads, so
      // this only adds the ones that aren't.
      await gitAdapter.fetch('origin', ['--tags', '--prune']);
      setBusyMessage('Updating branch status...');
      await updateCachedCommitsOriginStatus();
      setCommitViewReloadKey(key => key + 1);
    } catch (error) {
      console.error('Error during fetch:', error);
      setErrorWithDialog(`Fetch failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, updateCachedCommitsOriginStatus, setErrorWithDialog]);

  const handleGitGC = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      // Repacking can run for several minutes on a large repository, so keep the
      // busy overlay up for the whole run rather than letting it work unannounced.
      setBusyMessage('git maintenance run --task=incremental-repack (this can take a while on a large repository)');
      await gitAdapter.gc();
      showAlert('Repack complete.', 'Repack Repository');
    } catch (error) {
      console.error('Error during repack:', error);
      setErrorWithDialog(`Repack failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, showAlert, setErrorWithDialog]);

  // Abandoned pack temporaries are the fallout of fetches that died mid-transfer.
  // Git never cleans them up, and on a large repository with a failing remote they
  // accumulate at hundreds of megabytes per attempt.
  const handleCleanPackTemps = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      setBusyMessage('Scanning for abandoned pack files...');
      const { files, bytes } = await gitAdapter.findStalePackTemps();
      if (files.length === 0) {
        showAlert('No abandoned pack files found.', 'Clean Up Pack Files');
        return;
      }

      const megabytes = (bytes / (1024 * 1024)).toFixed(1);
      const confirmed = await showConfirm(
        `Found ${files.length} abandoned pack file(s) totalling ${megabytes} MB, left behind by interrupted fetches. Delete them?`,
        'Clean Up Pack Files');
      if (!confirmed)
        return;

      setBusyMessage('Removing abandoned pack files...');
      const { removed } = await gitAdapter.removeStalePackTemps();
      showAlert(`Removed ${removed} file(s), freeing ${megabytes} MB.`, 'Clean Up Pack Files');
    } catch (error) {
      console.error('Error cleaning up pack files:', error);
      setErrorWithDialog(`Clean up failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, showAlert, showConfirm, setErrorWithDialog]);

  const handlePull = useCallback(async (branch: string, stashAndReapply: boolean, rebase: boolean) => {
    hidePullDialog();
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      
      if (stashAndReapply && hasLocalChanges) {
        setBusyMessage('git stash push');
        await gitAdapter.stashPush(`Auto-stash before pull at ${new Date().toISOString()}`);
      }

      setBusyMessage(`git pull origin ${branch}${rebase ? ' --rebase' : ''}`);
      await gitAdapter.pull('origin', branch, rebase);
      clearBranchCache(branch);
      await loadRepoData(true);
      setCommitViewReloadKey(key => key + 1);
    } catch (error) {
      console.error('Error during pull:', error);
      setErrorWithDialog(`Pull failed: ${(error as Error).message}`);
    } finally {
      await refreshRebaseStatus();
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hidePullDialog, hasLocalChanges, clearBranchCache, loadRepoData, refreshRebaseStatus, setErrorWithDialog]);

  // Tags origin already has at a different commit can only be reconciled by
  // overwriting one side. A plain fetch never updates a tag that already exists
  // locally, so these stay stale indefinitely until someone forces them - offer that
  // here rather than printing the git command and leaving the user to run it in a
  // terminal. Only the conflicting tags are touched; local-only tags are left alone.
  const confirmAndSyncTags = useCallback(async (lead: string, conflicting: string[]) => {
    if (!gitAdapter)
      return;

    const one = conflicting.length === 1;
    const shown = conflicting.slice(0, 10).join(', ');
    const rest = conflicting.length - 10;
    const confirmed = await showConfirm(
      `${lead}\n${shown}${rest > 0 ? `, and ${rest} more` : ''}\n\n` +
      `Reset ${one ? 'that local tag' : 'those local tags'} to the commit${one ? '' : 's'} ` +
      `origin has? To overwrite the tag${one ? '' : 's'} on origin instead, run ` +
      `'git push origin --tags --force'.`,
      'Tags Out of Sync');
    if (!confirmed)
      return;

    try {
      setBusyMessage(`git fetch origin --force ${conflicting.length} tag${one ? '' : 's'}`);
      await gitAdapter.syncTags('origin', conflicting);
      await loadRepoData(true);
      setCommitViewReloadKey(key => key + 1);
      showAlert(`Reset ${conflicting.length} local tag${one ? '' : 's'} to origin.`, 'Sync Tags');
    } catch (error) {
      // Reported on its own: a push that succeeded shouldn't be retitled as a failure
      // because the follow-up sync went wrong.
      console.error('Error syncing tags:', error);
      setErrorWithDialog(`Sync tags failed: ${(error as Error).message}`);
    }
  }, [gitAdapter, loadRepoData, showAlert, showConfirm, setErrorWithDialog]);

  const handlePush = useCallback(async (branch: string, remoteBranch: string, pushAllTags: boolean) => {
    hidePushDialog();
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      // The branch and the tags are pushed as separate commands. Combining them into
      // 'git push <branch> --tags' makes git exit non-zero when any single tag is
      // rejected, which reports the whole push as failed even though the branch went up.
      setBusyMessage(`git push origin ${branch}:${remoteBranch}`);
      const pushOutput = await gitAdapter.push('origin', `${branch}:${remoteBranch}`);

      const prUrlMatch = pushOutput.match(/https?:\/\/[^\s\)]+\/pull\/new\/[^\s\)]+/);
      if (prUrlMatch) {
        showPullRequestDialog(prUrlMatch[0], branch);
      }

      if (pushAllTags) {
        setBusyMessage('git ls-remote --tags origin');
        const tags = await gitAdapter.compareTags('origin');

        if (tags.toPush.length > 0) {
          setBusyMessage(`git push origin ${tags.toPush.length} tag${tags.toPush.length === 1 ? '' : 's'}`);
          await gitAdapter.pushTags('origin', tags.toPush);
        }

        // Tags origin already has at a different commit can't be pushed without
        // overwriting the remote tag, so skip them and offer the other direction.
        if (tags.conflicting.length > 0) {
          const one = tags.conflicting.length === 1;
          await confirmAndSyncTags(
            `Pushed ${branch} to origin/${remoteBranch}.\n\n` +
            `${tags.conflicting.length} tag${one ? '' : 's'} not pushed because origin ` +
            `already has ${one ? 'it' : 'them'} at a different commit:`,
            tags.conflicting);
        }
      }

      await loadRepoData(true);
    } catch (error: any) {
      const prUrlMatch = error.message?.match(/https?:\/\/[^\s\)]+\/pull\/new\/[^\s\)]+/);
      if (prUrlMatch) {
        showPullRequestDialog(prUrlMatch[0], branch);
      } else {
        setErrorWithDialog(`Push failed: ${error.message}`);
      }
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hidePushDialog, loadRepoData, confirmAndSyncTags, showPullRequestDialog, setErrorWithDialog]);

  // Tags on their own. The Push dialog can only send tags along with a branch, but
  // tags are often created and pushed without any branch having moved.
  const handlePushTags = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      setBusyMessage('git ls-remote --tags origin');
      const tags = await gitAdapter.compareTags('origin');

      if (tags.toPush.length === 0) {
        // Nothing to publish, but tags that differ from origin are exactly the case
        // this is usually opened for, so offer to reconcile them rather than
        // reporting the mismatch and stopping.
        if (tags.conflicting.length > 0) {
          const one = tags.conflicting.length === 1;
          await confirmAndSyncTags(
            `No new tags to push. ${tags.conflicting.length} local tag${one ? '' : 's'} ` +
            `differ${one ? 's' : ''} from origin:`,
            tags.conflicting);
        } else {
          showAlert('All local tags are already on origin.', 'Push Tags');
        }
        return;
      }

      // Confirm before publishing: this is one click from a menu, where the Push
      // dialog at least tells you what it's about to send.
      const shownToPush = tags.toPush.slice(0, 10).join(', ');
      const restToPush = tags.toPush.length - 10;
      const confirmed = await showConfirm(
        `Push ${tags.toPush.length} tag${tags.toPush.length === 1 ? '' : 's'} to origin?\n\n` +
        `${shownToPush}${restToPush > 0 ? `, and ${restToPush} more` : ''}`,
        'Push Tags');
      if (!confirmed)
        return;

      setBusyMessage(`git push origin ${tags.toPush.length} tag${tags.toPush.length === 1 ? '' : 's'}`);
      await gitAdapter.pushTags('origin', tags.toPush);

      // Tags origin already has at a different commit can't be pushed without
      // overwriting the remote tag, so skip them and offer the other direction.
      if (tags.conflicting.length > 0) {
        const one = tags.conflicting.length === 1;
        await confirmAndSyncTags(
          `Pushed ${tags.toPush.length} tag${tags.toPush.length === 1 ? '' : 's'} to origin.\n\n` +
          `${tags.conflicting.length} tag${one ? '' : 's'} not pushed because origin ` +
          `already has ${one ? 'it' : 'them'} at a different commit:`,
          tags.conflicting);
      } else {
        showAlert(`Pushed ${tags.toPush.length} tag${tags.toPush.length === 1 ? '' : 's'} to origin.`, 'Push Tags');
      }
    } catch (error) {
      console.error('Error pushing tags:', error);
      setErrorWithDialog(`Push tags failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, confirmAndSyncTags, showAlert, showConfirm, setErrorWithDialog]);

  // The other direction of Push Tags. Git never updates a tag it already has on a
  // plain fetch, so once a tag is moved or recreated on the remote the local copy
  // points at the old commit until it is force-fetched.
  const handleSyncTags = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      setBusyMessage('git ls-remote --tags origin');
      const tags = await gitAdapter.compareTags('origin');

      if (tags.conflicting.length === 0) {
        const unpushed = tags.toPush.length;
        showAlert(unpushed > 0
          ? `Every tag origin has matches your local copy. ${unpushed} local ` +
            `tag${unpushed === 1 ? '' : 's'} ${unpushed === 1 ? 'is' : 'are'} not on ` +
            `origin - use Push Tags to publish ${unpushed === 1 ? 'it' : 'them'}.`
          : 'All local tags already match origin.',
          'Sync Tags');
        return;
      }

      const one = tags.conflicting.length === 1;
      await confirmAndSyncTags(
        `${tags.conflicting.length} local tag${one ? '' : 's'} point${one ? 's' : ''} at a ` +
        `different commit than origin:`,
        tags.conflicting);
    } catch (error) {
      console.error('Error comparing tags:', error);
      setErrorWithDialog(`Sync tags failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, confirmAndSyncTags, showAlert, setErrorWithDialog]);

  const performBranchSwitch = useCallback(async (branchName: string, skipBusyManagement = false) => {
    if (!gitAdapter)
      return;

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
      setErrorWithDialog(`Branch switch failed: ${(error as Error).message}`);
    } finally {
      if (!skipBusyManagement) {
        setIsBusy(false);
        setBusyMessage('');
      }
    }
  }, [gitAdapter, refreshFileStatus, setErrorWithDialog]);

  const handleBranchSwitch = useCallback(async (branchName: string) => {
    if (hasLocalChanges) {
      showLocalChangesDialog(branchName);
      return;
    }
    await performBranchSwitch(branchName);
  }, [hasLocalChanges, showLocalChangesDialog, performBranchSwitch]);

  const handleLocalChangesDialog = useCallback(async (option: string) => {
    hideLocalChangesDialog();
    const branchName = pendingState.pendingBranchSwitch;
    if (!branchName || !gitAdapter)
      return;

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
            setErrorWithDialog(`Stash reapplied but could not be removed: ${(err as Error).message}`);
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
      setErrorWithDialog(`Failed to handle local changes: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideLocalChangesDialog, pendingState.pendingBranchSwitch, performBranchSwitch,
      refreshFileStatus, refreshStashes, stagedFiles, unstagedFiles, currentBranch, setErrorWithDialog]);

  const handleBranchSelect = useCallback(async (branchName: string, page?: number) => {
    const pageSize = getSetting('maxCommits') || 100;
    const cached = branchCommitsCache.current.get(branchName);
    const targetPage = page ?? cached?.currentPage ?? 0;

    // Cache hit: render the page instantly, skip git entirely.
    const cachedPage = cached?.pages?.[targetPage];
    if (cachedPage) {
      if (cached.currentPage !== targetPage) {
        updateBranchCache(branchName, { ...cached, currentPage: targetPage });
      }
      setSelectedItem({
        type: 'branch',
        branchName,
        commits: cachedPage,
        loading: false,
        page: targetPage,
        totalCount: cached.totalCount
      });
      return;
    }

    currentBranchLoadId.current += 1;
    const thisLoadId = currentBranchLoadId.current;

    if (!gitAdapter)
      return;

    setSelectedItem({
      type: 'branch',
      branchName,
      commits: [],
      loading: true,
      page: targetPage,
      totalCount: cached?.totalCount
    });

    try {
      const offset = targetPage * pageSize;
      const [commits, totalCount] = await Promise.all([
        gitAdapter.log(branchName, pageSize, offset),
        gitAdapter.getCommitCount(branchName)
      ]);
      const existing = branchCommitsCache.current.get(branchName);
      updateBranchCache(branchName, {
        pages: { ...(existing?.pages || {}), [targetPage]: commits },
        currentPage: targetPage,
        totalCount
      });

      if (thisLoadId === currentBranchLoadId.current) {
        setSelectedItem({
          type: 'branch',
          branchName,
          commits,
          loading: false,
          page: targetPage,
          totalCount
        });
      }
    } catch (error) {
      console.error('Error loading branch commits:', error);
      if (thisLoadId === currentBranchLoadId.current) {
        // A partial log still lets the user work with the history git could read.
        const partialCommits = error instanceof IncompleteHistoryError ? error.commits : [];
        setErrorWithDialog(partialCommits.length > 0
          ? `Only the first ${partialCommits.length} commits could be read: ${(error as Error).message}`
          : `Failed to load commits: ${(error as Error).message}`);
        setSelectedItem({
          type: 'branch',
          branchName,
          commits: partialCommits,
          loading: false,
          page: targetPage,
          totalCount: undefined
        });
      }
    }
  }, [gitAdapter, branchCommitsCache, updateBranchCache, setErrorWithDialog, getSetting]);

  const handleCreateBranch = useCallback(async (branchName: string, checkoutAfterCreate: boolean) => {
    if (!gitAdapter)
      return;

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
      setErrorWithDialog(`Branch creation failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, handleBranchSelect, loadRepoData, setErrorWithDialog]);

  const handleDeleteBranchDialog = useCallback(async ({ deleteRemote }: { deleteRemote: boolean }) => {
    hideDeleteBranchDialog();
    const branchName = pendingState.branchToDelete;
    if (!branchName || !gitAdapter)
      return;

    try {
      setIsBusy(true);
      
      if (branchName === currentBranch) {
        setErrorWithDialog('Cannot delete the currently active branch');
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
      setErrorWithDialog(`Failed to delete branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideDeleteBranchDialog, pendingState.branchToDelete, currentBranch, loadRepoData, setErrorWithDialog]);

  const handleRenameBranchDialog = useCallback(async (newName: string) => {
    hideRenameBranchDialog();
    const oldName = pendingState.branchToRename;
    if (!oldName || !gitAdapter) 
      return;

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
      setErrorWithDialog(`Failed to rename branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideRenameBranchDialog, pendingState.branchToRename, selectedItem, currentBranch, loadRepoData, setCurrentBranch, setErrorWithDialog]);

  const handleMergeBranchDialog = useCallback(async ({ sourceBranch, targetBranch, flag }: { sourceBranch: string; targetBranch: string; flag?: string }) => {
    hideMergeBranchDialog();
    if (!gitAdapter || !sourceBranch || !targetBranch) 
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git merge ${flag || ''} ${sourceBranch}`);
      await gitAdapter.raw(['merge', ...(flag ? [flag] : []), sourceBranch]);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error merging branch:', error);
      setErrorWithDialog(`Failed to merge: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideMergeBranchDialog, clearBranchCache, loadRepoData, setErrorWithDialog]);

  const handleRebaseBranchDialog = useCallback(async ({ sourceBranch, targetBranch }: { sourceBranch: string; targetBranch: string }) => {
    hideRebaseBranchDialog();
    if (!gitAdapter || !sourceBranch || !targetBranch) 
      return;

    let stashed = false;
    try {
      setIsBusy(true);

      if (hasLocalChanges) {
        setBusyMessage('git stash push');
        await gitAdapter.stashPush(`Auto-stash before rebase at ${new Date().toISOString()}`);
        stashed = true;
      }

      setBusyMessage(`git checkout ${sourceBranch}`);
      await gitAdapter.checkoutBranch(sourceBranch);
      setBusyMessage(`git rebase ${targetBranch}`);
      await gitAdapter.rebase(targetBranch);
      clearBranchCache();
      await loadRepoData(true);

      if (stashed) {
        setBusyMessage('git stash pop');
        await gitAdapter.stashPop();
      }
    } catch (error) {
      console.error('Error rebasing branch:', error);
      // A rebase that stops on conflicts is not a failure — the rebase banner
      // takes over and lets the user resolve, continue, or abort it. Only show
      // an error dialog when no rebase is left in progress.
      const inProgress = await gitAdapter.getRebaseStatus().catch(() => null);
      if (!inProgress) {
        setErrorWithDialog(`Failed to rebase: ${(error as Error).message}`);
      }
    } finally {
      await refreshRebaseStatus();
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideRebaseBranchDialog, clearBranchCache, loadRepoData, hasLocalChanges, refreshRebaseStatus, setErrorWithDialog]);

  const runRebaseStep = useCallback(async (action: 'continue' | 'skip') => {
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git rebase --${action}`);
      if (action === 'continue') {
        await gitAdapter.rebaseContinue();
      } else {
        await gitAdapter.rebaseSkip();
      }
    } catch (error) {
      // `git rebase --continue/--skip` exits non-zero when the rebase stops
      // again on a later conflict — that is expected, and the banner will
      // surface the new conflicts. Only show an error if the rebase truly
      // failed to make progress.
      const stillRebasing = await gitAdapter.getRebaseStatus().catch(() => null);
      if (!stillRebasing) {
        setErrorWithDialog(`Failed to ${action} rebase: ${(error as Error).message}`);
      }
    } finally {
      clearBranchCache();
      await loadRepoData(true);
      await refreshFileStatus(false);
      await refreshRebaseStatus();
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, clearBranchCache, loadRepoData, refreshFileStatus, refreshRebaseStatus, setErrorWithDialog]);

  const handleRebaseContinue = useCallback(() => runRebaseStep('continue'), [runRebaseStep]);
  const handleRebaseSkip = useCallback(() => runRebaseStep('skip'), [runRebaseStep]);

  const handleRebaseAbort = useCallback(async () => {
    if (!gitAdapter)
      return;

    const confirmed = await showConfirm(
      'Abort the rebase and restore the branch to its state before the rebase started?',
      'Abort Rebase'
    );
    if (!confirmed)
      return;

    try {
      setIsBusy(true);
      setBusyMessage('git rebase --abort');
      await gitAdapter.rebaseAbort();
    } catch (error) {
      setErrorWithDialog(`Failed to abort rebase: ${(error as Error).message}`);
    } finally {
      clearBranchCache();
      await loadRepoData(true);
      await refreshFileStatus(false);
      await refreshRebaseStatus();
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, showConfirm, clearBranchCache, loadRepoData, refreshFileStatus, refreshRebaseStatus, setErrorWithDialog]);

  const handleStash = useCallback(async (message: string, stageNewFiles: boolean, keepChanges: boolean) => {
    hideStashDialog();
    if (!gitAdapter)
      return;

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
      await gitAdapter.stashPush(message || `Stash created at ${new Date().toISOString()}`, null, keepChanges);
      await refreshFileStatus(false);
      await refreshStashes();
    } catch (error) {
      console.error('Error creating stash:', error);
      setErrorWithDialog(`Stash failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideStashDialog, unstagedFiles, refreshFileStatus, refreshStashes, setErrorWithDialog]);

  const handleResetToOrigin = useCallback(async () => {
    hideResetDialog();
    if (!gitAdapter) 
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git reset --hard origin/${currentBranch}`);
      await gitAdapter.resetToOrigin(currentBranch);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error resetting to origin:', error);
      setErrorWithDialog(`Reset to origin failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideResetDialog, currentBranch, clearBranchCache, loadRepoData, setErrorWithDialog]);

  const handleCleanWorkingDirectory = useCallback(async () => {
    hideCleanWorkingDirectoryDialog();
    if (!gitAdapter) 
      return;

    try {
      setIsBusy(true);
      setBusyMessage('git clean -fdx');
      await gitAdapter.raw(['clean', '-fdx']);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error cleaning working directory:', error);
      setErrorWithDialog(`Clean working directory failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCleanWorkingDirectoryDialog, loadRepoData, setErrorWithDialog]);

  const handleDiscardAllChanges = useCallback(async () => {
    if (modifiedCount === 0 || !gitAdapter) 
      return;

    const confirmed = await showConfirm(`Are you sure you want to discard all ${modifiedCount} local changes?`);
    if (!confirmed) 
      return;

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
      setErrorWithDialog(`Discard changes failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, modifiedCount, stagedFiles, unstagedFiles, showConfirm, loadRepoData, setErrorWithDialog]);

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
        showRebaseBranchDialog(currentBranch, branchName);
        break;
      case 'new-branch':
        showCreateBranchDialog(branchName);
        break;
      case 'new-worktree':
        showCreateWorktreeDialog(branchName);
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
      case 'open-remote-url':
        if (originUrl) {
          shell.openExternal(`${convertGitSshToHttps(originUrl)}/commits/${branchName}`);
        }
        break;
      case 'open-pr':
        if (originUrl) {
          shell.openExternal(`${convertGitSshToHttps(originUrl)}/compare/${branchName}?expand=1`);
        }
        break;
      case 'open-branch-compare':
        if (originUrl) {
          shell.openExternal(`${convertGitSshToHttps(originUrl)}/compare/${branchName}`);
        }
        break;
    }
  }, [gitAdapter, currentBranch, originUrl, handleBranchSwitch, handleFetchClick, showPullDialog,
      showPushDialog, showMergeBranchDialog, showRebaseBranchDialog, showCreateBranchDialog,
      showCreateTagFromCommitDialog, showRenameBranchDialog, showDeleteBranchDialog, showCreateWorktreeDialog]);

  const saveStashAsPatch = useCallback(async (stash: any, stashIndex: number, includeUntracked: boolean) => {
    if (!gitAdapter)
      return;

    try {
      const name = stash.message.replace(/^On [^:]+:\s*/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
      const result = await ipcRenderer.invoke('show-save-dialog', {
        title: 'Save Patch As',
        defaultPath: path.join(gitAdapter.repoPath, name ? `${name}.patch` : `stash-${stashIndex}.patch`),
        filters: [
          { name: 'Patch Files', extensions: ['patch'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath)
        return;

      const saved = await gitAdapter.createStashPatch(stashIndex, result.filePath, includeUntracked);
      if (!saved) {
        showAlert(stash.hasUntracked && !includeUntracked
          ? 'This stash contains only untracked files.\n\nUse "Save as Patch (include untracked)..." to export them.'
          : 'This stash has no changes to export.', 'Nothing to save');
        return;
      }
      console.log(`Saved patch to ${result.filePath}`);
    } catch (error) {
      console.error('Error saving stash as patch:', error);
      setErrorWithDialog(`Failed to save stash as patch: ${(error as Error).message}`);
    }
  }, [gitAdapter, showAlert, setErrorWithDialog]);

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
      case 'save-patch':
        saveStashAsPatch(stash, stashIndex, false);
        break;
      case 'save-patch-untracked':
        saveStashAsPatch(stash, stashIndex, true);
        break;
    }
  }, [showApplyStashDialog, showRenameStashDialog, showDeleteStashDialog, saveStashAsPatch]);

  const handleApplyStashDialog = useCallback(async ({ stashIndex, deleteAfterApplying }: { stashIndex: number; deleteAfterApplying: boolean }) => {
    hideApplyStashDialog();
    if (!gitAdapter)
      return;

    try {
      await gitAdapter.raw(['stash', 'apply', `stash@{${stashIndex}}`]);
      if (deleteAfterApplying) {
        await gitAdapter.raw(['stash', 'drop', `stash@{${stashIndex}}`]);
      }
      await refreshFileStatus(false);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error applying stash:', error);
      setErrorWithDialog(`Failed to apply stash: ${(error as Error).message}`);
    }
  }, [gitAdapter, hideApplyStashDialog, refreshFileStatus, loadRepoData, setErrorWithDialog]);

  const handleStashDoubleClick = useCallback(async (stashIndex: number) => {
    showApplyStashDialog({ message: stashes[stashIndex].message, index: stashIndex });
  }, [gitAdapter, stashes, showApplyStashDialog]);

  const handleRenameStashDialog = useCallback(async (newName: string) => {
    hideRenameStashDialog();
    const stash = pendingState.stashToRename;
    if (!stash || !gitAdapter) 
      return;

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
      setErrorWithDialog(`Failed to rename stash: ${(error as Error).message}`);
    }
  }, [gitAdapter, hideRenameStashDialog, pendingState.stashToRename, loadRepoData, setErrorWithDialog]);

  const handleDeleteStashDialog = useCallback(async (stashIndex: number) => {
    hideDeleteStashDialog();
    if (!gitAdapter) 
      return;

    try {
      await gitAdapter.raw(['stash', 'drop', `stash@{${stashIndex}}`]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error deleting stash:', error);
      setErrorWithDialog(`Failed to delete stash: ${(error as Error).message}`);
    }
  }, [gitAdapter, hideDeleteStashDialog, loadRepoData, setErrorWithDialog]);

  const loadRemoteBranchCommits = useCallback(async (remoteName: string, branchName: string, fullName: string, page?: number) => {
    const pageSize = getSetting('maxCommits') || 100;
    const cached = branchCommitsCache.current.get(fullName);
    const targetPage = page ?? cached?.currentPage ?? 0;

    const cachedPage = cached?.pages?.[targetPage];
    if (cachedPage) {
      if (cached.currentPage !== targetPage) {
        updateBranchCache(fullName, { ...cached, currentPage: targetPage });
      }
      setSelectedItem({
        type: 'remote-branch',
        remoteName,
        branchName,
        fullName,
        commits: cachedPage,
        loading: false,
        page: targetPage,
        totalCount: cached.totalCount
      });
      return;
    }

    if (!gitAdapter)
      return;

    currentBranchLoadId.current += 1;
    const thisLoadId = currentBranchLoadId.current;

    setSelectedItem({
      type: 'remote-branch',
      remoteName,
      branchName,
      fullName,
      commits: [],
      loading: true,
      page: targetPage,
      totalCount: cached?.totalCount
    });

    try {
      const offset = targetPage * pageSize;
      const [commits, totalCount] = await Promise.all([
        gitAdapter.log(fullName, pageSize, offset),
        gitAdapter.getCommitCount(fullName)
      ]);
      const existing = branchCommitsCache.current.get(fullName);
      updateBranchCache(fullName, {
        pages: { ...(existing?.pages || {}), [targetPage]: commits },
        currentPage: targetPage,
        totalCount
      });

      if (thisLoadId === currentBranchLoadId.current) {
        setSelectedItem({
          type: 'remote-branch',
          remoteName,
          branchName,
          fullName,
          commits,
          loading: false,
          page: targetPage,
          totalCount
        });
      }
    } catch (error) {
      console.error('Error loading remote branch commits:', error);
      if (thisLoadId === currentBranchLoadId.current) {
        // A partial log still lets the user work with the history git could read.
        const partialCommits = error instanceof IncompleteHistoryError ? error.commits : [];
        setErrorWithDialog(partialCommits.length > 0
          ? `Only the first ${partialCommits.length} commits could be read: ${(error as Error).message}`
          : `Failed to load commits: ${(error as Error).message}`);
        setSelectedItem({
          type: 'remote-branch',
          remoteName,
          branchName,
          fullName,
          commits: partialCommits,
          loading: false,
          page: targetPage,
          totalCount: undefined
        });
      }
    }
  }, [gitAdapter, branchCommitsCache, updateBranchCache, setErrorWithDialog, getSetting]);

  const handleRemoteBranchSelect = useCallback((info: any) => {
    if (info.type === 'remote-branch' && info.fullName) {
      loadRemoteBranchCommits(info.remoteName, info.branchName, info.fullName);
    } else {
      setSelectedItem(info);
    }
  }, [loadRemoteBranchCommits]);

  // Reload the selected branch's commits after a fetch, pull or refresh. Those
  // commands move refs, which makes both the rendered list and the cache entry it
  // came from stale, so the cache is dropped for that branch before reloading.
  // Keyed only on commitViewReloadKey: selectedItem is read for its current value,
  // and reloading every time the selection changes would defeat the cache.
  useEffect(() => {
    if (commitViewReloadKey === 0 || !selectedItem)
      return;

    if (selectedItem.type === 'branch') {
      clearBranchCache(selectedItem.branchName);
      handleBranchSelect(selectedItem.branchName, selectedItem.page ?? 0);
    } else if (selectedItem.type === 'remote-branch') {
      clearBranchCache(selectedItem.fullName);
      loadRemoteBranchCommits(
        selectedItem.remoteName, selectedItem.branchName, selectedItem.fullName, selectedItem.page ?? 0);
    }
  }, [commitViewReloadKey]);

  const handleLoadCommitPage = useCallback((page: number) => {
    if (!selectedItem)
      return;
    if (selectedItem.type === 'branch') {
      handleBranchSelect(selectedItem.branchName, page);
    } else if (selectedItem.type === 'remote-branch') {
      loadRemoteBranchCommits(selectedItem.remoteName, selectedItem.branchName, selectedItem.fullName, page);
    }
  }, [selectedItem, handleBranchSelect, loadRemoteBranchCommits]);

  const handleSearchCommits = useCallback(async (query: SearchQuery) => {
    if (!gitAdapter || !selectedItem)
      return;
    const branchRef = selectedItem.type === 'remote-branch' ? selectedItem.fullName : selectedItem.branchName;
    if (!branchRef)
      return;

    setSelectedItem(prev => prev ? {
      ...prev,
      search: { query, results: [], truncated: false, loading: true }
    } : prev);

    try {
      const result = await gitAdapter.searchLog(branchRef, query, 500);
      setSelectedItem(prev => {
        if (!prev || !prev.search || prev.search.query !== query)
          return prev;
        return {
          ...prev,
          search: { query, results: result.commits, truncated: result.truncated, loading: false }
        };
      });
    } catch (error) {
      console.error('Error searching commits:', error);
      setErrorWithDialog(`Search failed: ${(error as Error).message}`);
      setSelectedItem(prev => prev ? { ...prev, search: undefined } : prev);
    }
  }, [gitAdapter, selectedItem, setErrorWithDialog]);

  const handleClearSearch = useCallback(() => {
    setSelectedItem(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next.search;
      return next;
    });
  }, []);

  const handleDeleteRemoteBranch = useCallback(async (remoteName: string, branchName: string) => {
    const confirmed = await showConfirm(`Delete remote branch '${remoteName}/${branchName}'?`);
    if (!confirmed || !gitAdapter) 
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git push ${remoteName} --delete ${branchName}`);
      await gitAdapter.raw(['push', remoteName, '--delete', branchName]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error deleting remote branch:', error);
      setErrorWithDialog(`Failed to delete remote branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, showConfirm, loadRepoData, setErrorWithDialog]);

  const handleCheckoutRemoteBranch = useCallback(async (remoteName: string, branchName: string) => {
    if (!gitAdapter) 
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git checkout -b ${branchName} ${remoteName}/${branchName}`);
      await gitAdapter.raw(['checkout', '-b', branchName, `${remoteName}/${branchName}`]);
      await loadRepoData(true);
    } catch (error) {
      console.error('Error checking out remote branch:', error);
      setErrorWithDialog(`Failed to checkout remote branch: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, loadRepoData, setErrorWithDialog]);

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
          try {
            // fetch() throws now; without this the failure would surface as an
            // unhandled rejection and the dialog would simply never open.
            await gitAdapter.fetch(remoteName, ['--prune']);
          } catch (error) {
            console.error(`Error fetching ${remoteName} before tagging:`, error);
            setErrorWithDialog(`Fetch failed: ${(error as Error).message}`);
            break;
          }
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
  }, [gitAdapter, handleCheckoutRemoteBranch, showMergeBranchDialog, showCreateBranchFromCommitDialog, showCreateTagFromCommitDialog, handleDeleteRemoteBranch, setErrorWithDialog]);

  const handleCreateBranchFromCommit = useCallback(async (branchName: string, checkoutAfterCreate: boolean) => {
    const commit = pendingState.commitForDialog;
    hideCreateBranchFromCommitDialog();
    if (!commit || !gitAdapter) 
      return;

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
      setErrorWithDialog(`Branch creation failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCreateBranchFromCommitDialog, pendingState.commitForDialog, handleBranchSelect, loadRepoData, setErrorWithDialog]);

  const handleCreateTagFromCommit = useCallback(async (tagName: string, tagMessage: string) => {
    const commit = pendingState.commitForDialog;
    hideCreateTagFromCommitDialog();
    if (!commit || !gitAdapter) 
      return;

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
      setErrorWithDialog(`Tag creation failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCreateTagFromCommitDialog, pendingState.commitForDialog, clearBranchCache, loadRepoData, selectedItem, handleBranchSelect, setErrorWithDialog]);

  const handleAmendCommit = useCallback(async (newMessage: string) => {
    const commit = pendingState.commitForDialog;
    hideAmendCommitDialog();
    if (!commit || !gitAdapter) 
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git commit --amend -m "${newMessage.replace(/"/g, '\\"')}"`);
      await gitAdapter.raw(['commit', '--amend', '-m', newMessage]);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error amending commit:', error);
      setErrorWithDialog(`Failed to amend commit: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideAmendCommitDialog, pendingState.commitForDialog, clearBranchCache, loadRepoData, setErrorWithDialog]);

  const handleCommitDoubleClick = useCallback((commit: Commit) => {
    showCheckoutCommitDialog(commit.hash);
  }, [showCheckoutCommitDialog]);

  const handleCheckoutCommit = useCallback(async () => {
    const commitHash = pendingState.commitToCheckout;
    if (!gitAdapter || !commitHash) 
      return;

    hideCheckoutCommitDialog();
    try {
      setIsBusy(true);
      setBusyMessage(`git checkout ${commitHash}`);
      await gitAdapter.checkout(commitHash);
      clearBranchCache();
      await loadRepoData(true);
    } catch (error) {
      console.error('Error checking out commit:', error);
      setErrorWithDialog(`Failed to checkout commit: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCheckoutCommitDialog, pendingState.commitToCheckout, clearBranchCache, loadRepoData, setErrorWithDialog]);

  const handleOpenWorktree = useCallback((worktreePath: string) => {
    onOpenRepository?.(worktreePath);
  }, [onOpenRepository]);

  const handleAddWorktree = useCallback(() => {
    showCreateWorktreeDialog();
  }, [showCreateWorktreeDialog]);

  const handleCreateWorktree = useCallback(async (params: CreateWorktreeParams) => {
    hideCreateWorktreeDialog();
    if (!gitAdapter)
      return;

    try {
      setIsBusy(true);
      setBusyMessage(`git worktree add ${params.worktreePath}`);
      await gitAdapter.addWorktree(params.worktreePath, params.ref, {
        newBranch: params.newBranch,
        startPoint: params.startPoint,
        force: params.force,
      });
      // A new branch may have been created and the worktree list changed.
      await Promise.all([loadRepoData(true), refreshWorktrees()]);
      // Open the freshly created worktree as its own tab.
      onOpenRepository?.(params.worktreePath);
    } catch (error) {
      console.error('Error creating worktree:', error);
      setErrorWithDialog(`Failed to create worktree: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, hideCreateWorktreeDialog, loadRepoData, refreshWorktrees, onOpenRepository, setErrorWithDialog]);

  const handleWorktreeAction = useCallback(async (action: string, worktree: WorktreeInfo) => {
    if (!gitAdapter)
      return;

    switch (action) {
      case 'open':
        onOpenRepository?.(worktree.path);
        break;
      case 'reveal':
        ipcRenderer.invoke('show-item-in-folder', worktree.path);
        break;
      case 'copy-path':
        navigator.clipboard.writeText(worktree.path);
        break;
      case 'lock':
        try {
          setIsBusy(true);
          setBusyMessage(`git worktree lock ${worktree.path}`);
          await gitAdapter.lockWorktree(worktree.path);
          await refreshWorktrees();
        } catch (error) {
          setErrorWithDialog(`Failed to lock worktree: ${(error as Error).message}`);
        } finally {
          setIsBusy(false);
          setBusyMessage('');
        }
        break;
      case 'unlock':
        try {
          setIsBusy(true);
          setBusyMessage(`git worktree unlock ${worktree.path}`);
          await gitAdapter.unlockWorktree(worktree.path);
          await refreshWorktrees();
        } catch (error) {
          setErrorWithDialog(`Failed to unlock worktree: ${(error as Error).message}`);
        } finally {
          setIsBusy(false);
          setBusyMessage('');
        }
        break;
      case 'prune':
        try {
          setIsBusy(true);
          setBusyMessage('git worktree prune');
          await gitAdapter.pruneWorktrees();
          await refreshWorktrees();
        } catch (error) {
          setErrorWithDialog(`Failed to prune worktrees: ${(error as Error).message}`);
        } finally {
          setIsBusy(false);
          setBusyMessage('');
        }
        break;
      case 'move': {
        const result = await ipcRenderer.invoke('show-open-dialog', {
          properties: ['openDirectory', 'createDirectory'],
          title: 'Move Worktree To (parent folder)',
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0)
          return;
        const parent = result.filePaths[0].replace(/[\\/]+$/, '');
        const sep = parent.includes('\\') ? '\\' : '/';
        const base = worktree.path.split(/[\\/]/).filter(Boolean).pop() || 'worktree';
        const newPath = `${parent}${sep}${base}`;
        try {
          setIsBusy(true);
          setBusyMessage(`git worktree move ${worktree.path} ${newPath}`);
          await gitAdapter.moveWorktree(worktree.path, newPath);
          await refreshWorktrees();
        } catch (error) {
          setErrorWithDialog(`Failed to move worktree: ${(error as Error).message}`);
        } finally {
          setIsBusy(false);
          setBusyMessage('');
        }
        break;
      }
      case 'remove': {
        const confirmed = await showConfirm(
          `Remove the worktree at:\n${worktree.path}\n\nThe branch and its commits are kept; only this working directory is removed.`,
          'Remove Worktree'
        );
        if (!confirmed)
          return;
        try {
          setIsBusy(true);
          setBusyMessage(`git worktree remove ${worktree.path}`);
          await gitAdapter.removeWorktree(worktree.path, false);
          await refreshWorktrees();
        } catch (error) {
          // A worktree with uncommitted changes or a lock can't be removed without --force.
          const forceConfirmed = await showConfirm(
            `Could not remove the worktree:\n${(error as Error).message}\n\nForce removal? Uncommitted changes in that worktree will be lost.`,
            'Force Remove Worktree'
          );
          if (forceConfirmed) {
            try {
              setBusyMessage(`git worktree remove --force ${worktree.path}`);
              await gitAdapter.removeWorktree(worktree.path, true);
              await refreshWorktrees();
            } catch (forceError) {
              setErrorWithDialog(`Failed to remove worktree: ${(forceError as Error).message}`);
            }
          }
        } finally {
          setIsBusy(false);
          setBusyMessage('');
        }
        break;
      }
    }
  }, [gitAdapter, onOpenRepository, refreshWorktrees, showConfirm, setErrorWithDialog]);

  /**
   * Gather the commits an interactive rebase would replay and open the editor for
   * them. A rebase rewrites the checked-out branch, so this only makes sense for a
   * commit on it, with nothing uncommitted in the way.
   */
  const startInteractiveRebase = useCallback(async (commit: Commit) => {
    if (!gitAdapter)
      return;

    const viewedBranch = selectedItem?.type === 'branch' ? selectedItem.branchName : null;
    if (!viewedBranch || viewedBranch !== currentBranch) {
      showAlert(
        `An interactive rebase rewrites the branch you have checked out. Check out ${viewedBranch || 'this branch'} first, then rebase from a commit on it.`,
        'Interactive Rebase'
      );
      return;
    }

    try {
      setIsBusy(true);
      setBusyMessage('git log');

      const status = await gitAdapter.status();
      if (status.files.length > 0) {
        showAlert(
          'git rebase needs a clean working directory. Commit or stash your changes first.',
          'Interactive Rebase'
        );
        return;
      }

      // The clicked commit is replayed too, so the rebase starts from its parent.
      // `rev-list --parents` prints the commit followed by its parents, so a root
      // commit - which has none - leaves base null, the `--root` case.
      const parents = await gitAdapter.raw(['rev-list', '--parents', '-n', '1', commit.hash]);
      const fields = parents.trim().split(/\s+/);
      const base: string | null = fields.length >= 2 ? fields[1] : null;

      const range = await gitAdapter.getCommitRange(base, 'HEAD');
      if (range.length === 0) {
        showAlert('There are no commits to rebase from here.', 'Interactive Rebase');
        return;
      }

      // getCommitRange is newest first; a rebase todo list runs oldest first.
      setInteractiveRebase({
        base,
        commits: [...range].reverse(),
        ontoLabel: base === null ? 'the root commit' : base.slice(0, 8)
      });
    } catch (error) {
      setErrorWithDialog(`Failed to prepare the rebase: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, selectedItem, currentBranch, showAlert, setErrorWithDialog]);

  const runInteractiveRebase = useCallback(async (entries: RebaseTodoEntry[]) => {
    if (!gitAdapter || !interactiveRebase)
      return;

    try {
      setIsBusy(true);
      setBusyMessage('git rebase -i');
      await gitAdapter.rebaseInteractive(interactiveRebase.base, entries);
      clearBranchCache();
      await loadRepoData(true);

      // The rebase rewrote the commits the branch view is showing, so reload it.
      if (selectedItem?.type === 'branch' && selectedItem.branchName)
        await handleBranchSelect(selectedItem.branchName);

      // A rebase that stopped for a conflict or an edit step is reported by the
      // banner, which loadRepoData refreshes; say so plainly as well.
      const stopped = await gitAdapter.getRebaseStatus();
      if (stopped) {
        showAlert(
          stopped.conflictedFiles.length > 0
            ? `The rebase stopped on ${stopped.currentCommitSubject || 'a commit'} with conflicts in ${stopped.conflictedFiles.join(', ')}. Resolve them, then continue the rebase.`
            : `The rebase stopped on ${stopped.currentCommitSubject || 'a commit'} so it can be edited. Make your changes, then continue the rebase.`,
          'Interactive Rebase'
        );
      }
    } catch (error) {
      setErrorWithDialog(`Rebase failed: ${(error as Error).message}`);
      throw error;
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  }, [gitAdapter, interactiveRebase, clearBranchCache, loadRepoData, selectedItem, handleBranchSelect, showAlert, setErrorWithDialog]);

  const handleCommitContextMenu = useCallback(async (action: string, commit: Commit, _currentBranch: string, tagName?: string) => {
    if (!gitAdapter) 
      return;

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
      case 'rebase-interactive':
        await startInteractiveRebase(commit);
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
        const patchContent = await gitAdapter.raw(['format-patch', '-1', commit.hash, '--stdout']);
        console.log('Generated patch content:', patchContent);
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
    if (activeSplitter.current === null) 
      return;

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
      {rebaseStatus && (
        <RebaseBanner
          status={rebaseStatus}
          busy={isBusy}
          onContinue={handleRebaseContinue}
          onAbort={handleRebaseAbort}
          onSkip={handleRebaseSkip}
        />
      )}
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
            title={errorTitle}
            onClose={() => { setError(null); setErrorTitle(undefined); hideErrorDialog(); }}
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
                onGitGC={handleGitGC}
                onPushTags={handlePushTags}
                onSyncTags={handleSyncTags}
                onCleanPackTemps={handleCleanPackTemps}
                remoteStatusError={remoteStatusError}
                onOriginChanged={async () => { if (gitAdapter) setOriginUrl(await gitAdapter.getOriginUrl()); }}
                onStashChanges={hasLocalChanges ? () => showStashDialog() : undefined}
                onDiscardChanges={hasLocalChanges ? handleDiscardAllChanges : undefined}
                onRefresh={() => loadRepoData(true)}
                onError={setErrorWithDialog}
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
                  onStashDoubleClick={handleStashDoubleClick}
                  selectedItem={selectedItem}
                  onMouseDown={handleMouseDown}
                  onBranchContextMenu={handleBranchContextMenu}
                  onStashContextMenu={handleStashContextMenu}
                  remotes={remotes}
                  onSelectRemoteBranch={handleRemoteBranchSelect}
                  onRemoteBranchAction={handleRemoteBranchContextMenu}
                  onRemoteAdded={() => loadRepoData(true)}
                  gitAdapter={gitAdapter}
                  lockedPatterns={getSetting('lockedBranchPatterns')}
                  worktrees={worktrees}
                  onOpenWorktree={handleOpenWorktree}
                  onAddWorktree={handleAddWorktree}
                  onWorktreeAction={handleWorktreeAction}
                  onAddBranch={() => showCreateBranchDialog()}
                  onStashAll={() => showStashDialog()}
                  canStash={hasLocalChanges}
                  originUrl={originUrl}
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
                onCommitDoubleClick={handleCommitDoubleClick}
                currentBranch={currentBranch}
                branchStatus={branchStatus}
                onError={setErrorWithDialog}
                onBusyChange={setIsBusy}
                onBusyMessageChange={setBusyMessage}
                onCommitCreated={() => clearBranchCache(currentBranch)}
                onStashCreated={refreshStashes}
                pageSize={getSetting('maxCommits') || 100}
                onLoadCommitPage={handleLoadCommitPage}
                onSearchCommits={handleSearchCommits}
                onClearCommitSearch={handleClearSearch}
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
      {interactiveRebase && (
        <InteractiveRebaseDialog
          commits={interactiveRebase.commits}
          ontoLabel={interactiveRebase.ontoLabel}
          onClose={() => setInteractiveRebase(null)}
          onRebase={runInteractiveRebase}
        />
      )}

      {dialogStates.showRebaseBranchDialog && (
        <RebaseBranchDialog
          onClose={hideRebaseBranchDialog}
          onRebase={handleRebaseBranchDialog}
          sourceBranch={pendingState.rebaseSourceBranch}
          targetBranch={pendingState.rebaseTargetBranch}
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
      {dialogStates.showCheckoutCommitDialog && (
        <ConfirmDialog
          title="Checkout Commit"
          message={`Are you sure you want to checkout commit "${pendingState.commitToCheckout?.substring(0, 7)}"? This will put you in a detached HEAD state.`}
          onConfirm={handleCheckoutCommit}
          onCancel={hideCheckoutCommitDialog}
        />
      )}
      {dialogStates.showCreateWorktreeDialog && (
        <CreateWorktreeDialog
          onClose={hideCreateWorktreeDialog}
          onCreate={handleCreateWorktree}
          branches={branches}
          currentBranch={currentBranch}
          repoPath={repoPath}
          prefillBranch={pendingState.worktreePrefillBranch}
        />
      )}
    </div>
  );
}

export default RepositoryView;
