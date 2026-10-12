import { useState, useEffect, useRef, useCallback } from 'react';
import { ipcRenderer } from 'electron';
import GitFactory from '../git/GitFactory';
import { GitAdapter, Commit, StashInfo, FileStatus, GitStatus, WorktreeInfo } from '../git/GitAdapter';
import cacheManager from '../utils/cacheManager';
import { RunningCommand, FileInfo, RemoteInfo } from '../components/types';

export interface BranchCacheEntry {
  // Pages of commits keyed by page index. Each entry holds one page worth of commits
  // (pageSize from settings). Pages are added as the user navigates and persist until
  // the branch's cache is explicitly cleared (refresh, pull, merge, rebase, etc.).
  pages: { [page: number]: Commit[] };
  // Last viewed page; restored on cold open.
  currentPage: number;
  totalCount?: number;
}

interface UseGitOptions {
  repoPath: string;
  onError?: (error: Error) => void;
}

interface UseGitResult {
  gitAdapter: GitAdapter | null;
  isLoading: boolean;
  error: string | null;
  commandState: RunningCommand[];
  refresh: () => Promise<void>;
}

export function useGitAdapter({ repoPath, onError }: UseGitOptions): UseGitResult {
  const [gitAdapter, setGitAdapter] = useState<GitAdapter | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [commandState, setCommandState] = useState<RunningCommand[]>([]);
  const cacheInitialized = useRef(false);
  const runningCommandsRef = useRef<RunningCommand[]>([]);

  useEffect(() => {
    let adapter: GitAdapter | null = null;

    const initGit = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const backend = await ipcRenderer.invoke('get-git-backend');
        adapter = await GitFactory.createAdapter(repoPath, backend);

        if (adapter) {
          await adapter.open();

          adapter.commandStateCallback = (isStarting, id, command, time) => {
            setCommandState(prev => {
              const newState = isStarting
                ? [...prev, { id, command, time }]
                : prev.filter(cmd => cmd.id !== id);
              runningCommandsRef.current = newState;
              return newState;
            });
          };

          const userDataPath = await ipcRenderer.invoke('get-user-data-path');
          cacheManager.setCacheDir(userDataPath);
          cacheInitialized.current = true;

          setGitAdapter(adapter);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize git';
        setError(errorMessage);
        onError?.(new Error(errorMessage));
      } finally {
        setIsLoading(false);
      }
    };

    initGit();

    return () => {
      if (adapter) {
        adapter.commandStateCallback = null;
      }
    };
  }, [repoPath, onError]);

  const refresh = useCallback(async () => {
    if (!gitAdapter)
      return;

    try {
      const backend = await ipcRenderer.invoke('get-git-backend');
      const newAdapter = await GitFactory.createAdapter(repoPath, backend);

      if (newAdapter) {
        await newAdapter.open();
        newAdapter.commandStateCallback = gitAdapter.commandStateCallback;
        setGitAdapter(newAdapter);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh git';
      setError(errorMessage);
    }
  }, [gitAdapter, repoPath]);

  return {
    gitAdapter,
    isLoading,
    error,
    commandState,
    refresh
  };
}

export function useRepositoryData(repoPath: string, gitAdapter: GitAdapter | null) {
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [originUrl, setOriginUrl] = useState<string>('');
  const [unstagedFiles, setUnstagedFiles] = useState<FileInfo[]>([]);
  const [stagedFiles, setStagedFiles] = useState<FileInfo[]>([]);
  const [modifiedCount, setModifiedCount] = useState<number>(0);
  const [branches, setBranches] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [branchStatus, setBranchStatus] = useState<{ [branchName: string]: { ahead: number; behind: number } }>({});
  const [stashes, setStashes] = useState<StashInfo[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const branchCommitsCache = useRef(new Map<string, BranchCacheEntry>());
  // The load running now, and at most one queued behind it. A command that
  // finishes while a reload is running needs a reload that starts after it, or
  // the one in flight may have read the repository before the command changed it.
  const loadInFlight = useRef<Promise<void> | null>(null);
  const loadQueued = useRef<Promise<void> | null>(null);

  const getFileStatusType = useCallback((code: string): string => {
    switch (code) {
      case ' ': return 'unmodified';
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
  }, []);

  const loadBranchCommitsFromCache = useCallback(() => {
    const cacheData = cacheManager.loadCache(repoPath);
    if (cacheData && cacheData.branchCommits) {
      Object.entries(cacheData.branchCommits).forEach(([branchName, entry]) => {
        branchCommitsCache.current.set(branchName, entry as BranchCacheEntry);
      });
    }
  }, [repoPath]);

  const updateBranchCache = useCallback((branchName: string, entry: BranchCacheEntry) => {
    branchCommitsCache.current.set(branchName, entry);
    const cacheData = cacheManager.loadCache(repoPath) || {};
    cacheData.branchCommits = {
      ...cacheData.branchCommits,
      [branchName]: entry
    };
    cacheManager.saveCache(repoPath, cacheData);
  }, [repoPath]);

  /** Drop several branches' cached commits with one write of the cache file. */
  const dropBranchCaches = useCallback((branchNames: string[]) => {
    if (branchNames.length === 0)
      return;
    for (const name of branchNames)
      branchCommitsCache.current.delete(name);
    const cacheData = cacheManager.loadCache(repoPath) || {};
    if (cacheData.branchCommits) {
      for (const name of branchNames)
        delete cacheData.branchCommits[name];
      cacheManager.saveCache(repoPath, cacheData);
    }
  }, [repoPath]);

  const clearBranchCache = useCallback((branchName?: string) => {
    if (branchName) {
      branchCommitsCache.current.delete(branchName);
      const cacheData = cacheManager.loadCache(repoPath) || {};
      if (cacheData.branchCommits) {
        delete cacheData.branchCommits[branchName];
        cacheManager.saveCache(repoPath, cacheData);
      }
    } else {
      branchCommitsCache.current.clear();
      const cacheData = cacheManager.loadCache(repoPath) || {};
      delete cacheData.branchCommits;
      cacheManager.saveCache(repoPath, cacheData);
    }
  }, [repoPath]);

  const runLoad = useCallback(async (isRefresh: boolean, background: boolean) => {
    if (!gitAdapter)
      return;

    if (!background)
      setLoading(true);

    try {
      const cachedData = cacheManager.loadCache(repoPath);
      if (cachedData && !isRefresh) {
        setCurrentBranch(cachedData.currentBranch || '');
        setOriginUrl(cachedData.originUrl || '');
        setBranches(cachedData.branches || []);
        setRemotes(cachedData.remotes || []);
        setBranchStatus(cachedData.branchStatus || {});
        setStashes(cachedData.stashes || []);
        setWorktrees(cachedData.worktrees || []);
        setUsingCache(true);
        return;
      }

      setUsingCache(false);

      const status = await gitAdapter.status();
      setCurrentBranch(status.current || '');

      const url = await gitAdapter.getOriginUrl();
      setOriginUrl(url);

      const unstaged: FileInfo[] = [];
      const staged: FileInfo[] = [];

      status.files.forEach(file => {
        if (file.working_dir && file.working_dir !== ' ') {
          unstaged.push({
            path: file.path,
            status: getFileStatusType(file.working_dir)
          });
        } else if (file.index && file.index !== ' ' && file.index !== '?') {
          staged.push({
            path: file.path,
            status: getFileStatusType(file.index)
          });
        }
      });

      setUnstagedFiles(unstaged);
      setStagedFiles(staged);

      const allPaths = new Set([...unstaged.map(f => f.path), ...staged.map(f => f.path)]);
      setModifiedCount(allPaths.size);

      const branchSummary = await gitAdapter.branchLocal();
      setBranches(branchSummary.all);

      let remotesList: RemoteInfo[] = [];
      try {
        const remotesOutput = await gitAdapter.raw(['remote', '-v']);
        // Lines look like "origin\t<url> (fetch)". Partial clones append a filter
        // spec, e.g. "origin\t<url> (fetch) [blob:none]", so don't anchor the end.
        const seenRemotes = new Set<string>();
        remotesList = remotesOutput
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/);
            if (!match || seenRemotes.has(match[1])) {
              return null;
            }
            seenRemotes.add(match[1]);
            return { name: match[1], url: match[2] };
          })
          .filter(Boolean) as RemoteInfo[];
        setRemotes(remotesList);
      } catch {
        setRemotes([]);
        remotesList = [];
      }

      const statusMap = await gitAdapter.getAllAheadBehind();
      setBranchStatus(statusMap);

      const stashList = await gitAdapter.stashList();
      setStashes(stashList.all);

      let worktreeList: WorktreeInfo[] = [];
      try {
        worktreeList = await gitAdapter.listWorktrees();
        setWorktrees(worktreeList);
      } catch {
        setWorktrees([]);
        worktreeList = [];
      }

      const cacheData = {
        // Owned by the ref watcher in RepositoryView; carried over untouched.
        refsFingerprint: cacheManager.loadCache(repoPath)?.refsFingerprint,
        currentBranch: status.current,
        originUrl: url,
        branches: branchSummary.all,
        remotes: remotesList,
        branchStatus: statusMap,
        stashes: stashList.all,
        worktrees: worktreeList,
        branchCommits: Object.fromEntries(branchCommitsCache.current)
      };

      cacheManager.saveCache(repoPath, cacheData);

    } catch (err) {
      console.error('Error loading repo data:', err);
      if (!background)
        setError(err instanceof Error ? err.message : 'Failed to load repository data');
    } finally {
      if (!background)
        setLoading(false);
    }
  }, [gitAdapter, repoPath, getFileStatusType]);

  // `background` re-reads everything from git like a refresh, but leaves the view
  // on screen: `loading` swaps the whole repository view for a placeholder, which
  // only the Refresh button still asks for.
  const loadRepoData = useCallback((isRefresh = false, background = false): Promise<void> => {
    const start = () => {
      const run = runLoad(isRefresh, background).finally(() => {
        if (loadInFlight.current === run)
          loadInFlight.current = null;
      });
      loadInFlight.current = run;
      return run;
    };

    if (!loadInFlight.current)
      return start();
    // Callers queued while one is waiting share it: it starts after every one of them.
    if (!loadQueued.current) {
      loadQueued.current = loadInFlight.current.then(() => {
        loadQueued.current = null;
        return start();
      });
    }
    return loadQueued.current;
  }, [runLoad]);

  const refreshStashes = useCallback(async () => {
    if (!gitAdapter)
      return;
    const stashList = await gitAdapter.stashList();
    setStashes(stashList.all);
  }, [gitAdapter]);

  const refreshWorktrees = useCallback(async () => {
    if (!gitAdapter)
      return;
    try {
      const list = await gitAdapter.listWorktrees();
      setWorktrees(list);
      // Keep the on-disk cache in sync so a cold open shows the latest worktrees.
      const cacheData = cacheManager.loadCache(repoPath) || {};
      cacheData.worktrees = list;
      cacheManager.saveCache(repoPath, cacheData);
    } catch (err) {
      console.error('Error refreshing worktrees:', err);
    }
  }, [gitAdapter, repoPath]);

  useEffect(() => {
    if (gitAdapter) {
      loadBranchCommitsFromCache();
      loadRepoData(false);
    }
  }, [gitAdapter, loadBranchCommitsFromCache, loadRepoData]);

  return {
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
    setBranches,
    stashes,
    worktrees,
    loading,
    usingCache,
    error,
    setError,
    branchCommitsCache,
    loadRepoData,
    refreshStashes,
    refreshWorktrees,
    updateBranchCache,
    clearBranchCache,
    dropBranchCaches,
    getFileStatusType
  };
}
