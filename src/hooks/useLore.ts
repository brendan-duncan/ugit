import { useState, useEffect, useRef, useCallback } from 'react';
import { LoreClient, resolveLoreBin, LoreStatus, LoreBranches, LoreLock, LoreRevision, LoreLink, LoreLayer, LoreTreeNode, LoreStashStore, LoreStash } from '../lore';
import { RunningCommand } from '../components/types';

interface UseLoreOptions {
  repoPath: string;
  onError?: (error: Error) => void;
}

interface UseLoreResult {
  client: LoreClient | null;
  status: LoreStatus | null;
  history: LoreRevision[];
  branches: LoreBranches | null;
  locks: LoreLock[];
  links: LoreLink[];
  layers: LoreLayer[];
  /** Revisions unioned across all local branches, for the revision graph. */
  graph: LoreRevision[];
  /** The repository tree (sparse view), for the file browser. */
  tree: LoreTreeNode[];
  /** Client-side stash store (emulated; null until the client is ready). */
  stashStore: LoreStashStore | null;
  stashes: LoreStash[];
  /** Active sparse view filter (.lore/view), or null for a full checkout. */
  view: string | null;
  isLoading: boolean;
  error: string | null;
  commandState: RunningCommand[];
  /** Reload status (with --scan), history, branches, locks, links, layers. */
  refresh: () => Promise<void>;
}

/**
 * Lore counterpart to useGitAdapter + useRepositoryData (minimal slice): creates a LoreClient
 * for the repo, wires the command-state callback for the busy UI, and loads status + history.
 */
export function useLore({ repoPath, onError }: UseLoreOptions): UseLoreResult {
  const [client, setClient] = useState<LoreClient | null>(null);
  const [status, setStatus] = useState<LoreStatus | null>(null);
  const [history, setHistory] = useState<LoreRevision[]>([]);
  const [branches, setBranches] = useState<LoreBranches | null>(null);
  const [locks, setLocks] = useState<LoreLock[]>([]);
  const [links, setLinks] = useState<LoreLink[]>([]);
  const [layers, setLayers] = useState<LoreLayer[]>([]);
  const [graph, setGraph] = useState<LoreRevision[]>([]);
  const [tree, setTree] = useState<LoreTreeNode[]>([]);
  const [stashStore, setStashStore] = useState<LoreStashStore | null>(null);
  const [stashes, setStashes] = useState<LoreStash[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [commandState, setCommandState] = useState<RunningCommand[]>([]);
  const clientRef = useRef<LoreClient | null>(null);
  const stashStoreRef = useRef<LoreStashStore | null>(null);

  // Keep the latest onError in a ref so `load`/`refresh` can stay stable identities. Passing
  // an inline `onError` (new function each render) must NOT churn the load callback, or the
  // mount effect would re-fire every render and spin in an infinite reload loop.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Create the client once per repo path.
  useEffect(() => {
    const c = new LoreClient(repoPath, {
      bin: resolveLoreBin(),
      commandStateCallback: (isStarting, id, command, time) => {
        setCommandState(prev =>
          isStarting ? [...prev, { id, command, time }] : prev.filter(cmd => cmd.id !== id),
        );
      },
    });
    clientRef.current = c;
    const store = new LoreStashStore(c);
    stashStoreRef.current = store;
    setStashStore(store);
    setClient(c);
    return () => {
      c.commandStateCallback = null;
      clientRef.current = null;
    };
  }, [repoPath]);

  // Stable across renders (no reactive deps) so effects keyed on it don't loop.
  const load = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    try {
      setIsLoading(true);
      setError(null);
      const [st, hist, brs, lks, lnk, lyr, gr, tr, vw] = await Promise.all([
        c.status({ scan: true }),
        c.history(),
        c.branchList(),
        c.locks(),
        c.links(),
        c.layers(),
        c.graphRevisions(),
        c.tree(undefined, 1), // top level only; the tree view lazily loads deeper levels
        c.readView(),
      ]);
      setStatus(st);
      setHistory(hist);
      setBranches(brs);
      setLocks(lks);
      setLinks(lnk);
      setLayers(lyr);
      setGraph(gr);
      setTree(tr);
      setView(vw);
      if (stashStoreRef.current) setStashes(stashStoreRef.current.list());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Lore repository';
      setError(message);
      onErrorRef.current?.(new Error(message));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load once the client exists (fires only when `client` changes, not every render).
  useEffect(() => {
    if (client) load();
  }, [client, load]);

  return { client, status, history, branches, locks, links, layers, graph, tree, stashStore, stashes, view, isLoading, error, commandState, refresh: load };
}
