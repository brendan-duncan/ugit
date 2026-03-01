import { useState, useEffect, useRef, useCallback } from 'react';
import { ipcRenderer } from 'electron';
import GitFactory from '../git/GitFactory';
import { GitAdapter, Commit, StashInfo, FileStatus, GitStatus } from '../git/GitAdapter';
import cacheManager from '../utils/cacheManager';
import { RunningCommand, FileInfo, RemoteInfo } from '../components/types';

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
    if (!gitAdapter) return;

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
  const [loading, setLoading] = useState<boolean>(false);
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const branchCommitsCache = useRef(new Map<string, Commit[]>());

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
      Object.entries(cacheData.branchCommits).forEach(([branchName, commits]) => {
        branchCommitsCache.current.set(branchName, commits as Commit[]);
      });
    }
  }, [repoPath]);

  const updateBranchCache = useCallback((branchName: string, commits: Commit[]) => {
    branchCommitsCache.current.set(branchName, commits);
    const cacheData = cacheManager.loadCache(repoPath) || {};
    cacheData.branchCommits = {
      ...cacheData.branchCommits,
      [branchName]: commits
    };
    cacheManager.saveCache(repoPath, cacheData);
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

  const loadRepoData = useCallback(async (isRefresh = false) => {
    if (!gitAdapter || loading) return;

    if (isRefresh) {
      setLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const cachedData = cacheManager.loadCache(repoPath);
      if (cachedData && !isRefresh) {
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
        setLoading(false);
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
        remotesList = remotesOutput
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const match = line.match(/^([^\s]+)\s+([^\s]+)(?:\s+\(fetch\))?$/);
            return match ? { name: match[1], url: match[2] } : null;
          })
          .filter(Boolean) as RemoteInfo[];
        setRemotes(remotesList);
      } catch {
        setRemotes([]);
        remotesList = [];
      }

      const statusPromises = branchSummary.all.map(async (branchName) => {
        const { ahead, behind } = await gitAdapter.getAheadBehind(branchName, `origin/${branchName}`);
        if (ahead > 0 || behind > 0) {
          return { branchName, ahead, behind };
        }
        return null;
      });

      const statusResults = await Promise.all(statusPromises);
      const statusMap: { [branchName: string]: { ahead: number; behind: number } } = {};
      statusResults.forEach(result => {
        if (result) {
          statusMap[result.branchName] = { ahead: result.ahead, behind: result.behind };
        }
      });
      setBranchStatus(statusMap);

      const stashList = await gitAdapter.stashList();
      setStashes(stashList.all);

      const cacheData = {
        currentBranch: status.current,
        originUrl: url,
        unstagedFiles: unstaged,
        stagedFiles: staged,
        modifiedCount: allPaths.size,
        branches: branchSummary.all,
        remotes: remotesList,
        branchStatus: statusMap,
        stashes: stashList.all,
        branchCommits: Object.fromEntries(branchCommitsCache.current)
      };

      cacheManager.saveCache(repoPath, cacheData);

    } catch (err) {
      console.error('Error loading repo data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load repository data');
    } finally {
      setLoading(false);
    }
  }, [gitAdapter, loading, repoPath, getFileStatusType]);

  const refreshStashes = useCallback(async () => {
    if (!gitAdapter) return;
    const stashList = await gitAdapter.stashList();
    setStashes(stashList.all);
  }, [gitAdapter]);

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
    stashes,
    loading,
    usingCache,
    error,
    setError,
    branchCommitsCache,
    loadRepoData,
    refreshStashes,
    updateBranchCache,
    clearBranchCache,
    getFileStatusType
  };
}
