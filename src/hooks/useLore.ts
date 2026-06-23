import { useState, useEffect, useRef, useCallback } from 'react';
import { LoreClient, resolveLoreBin, LoreStatus } from '../lore';
import { RunningCommand } from '../components/types';

interface UseLoreOptions {
  repoPath: string;
  onError?: (error: Error) => void;
}

interface UseLoreResult {
  client: LoreClient | null;
  status: LoreStatus | null;
  history: Array<{ number: number; message: string }>;
  isLoading: boolean;
  error: string | null;
  commandState: RunningCommand[];
  /** Reload status (with --scan) and history. */
  refresh: () => Promise<void>;
}

/**
 * Lore counterpart to useGitAdapter + useRepositoryData (minimal slice): creates a LoreClient
 * for the repo, wires the command-state callback for the busy UI, and loads status + history.
 */
export function useLore({ repoPath, onError }: UseLoreOptions): UseLoreResult {
  const [client, setClient] = useState<LoreClient | null>(null);
  const [status, setStatus] = useState<LoreStatus | null>(null);
  const [history, setHistory] = useState<Array<{ number: number; message: string }>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [commandState, setCommandState] = useState<RunningCommand[]>([]);
  const clientRef = useRef<LoreClient | null>(null);

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
      const [st, hist] = await Promise.all([
        c.status({ scan: true }),
        c.historyOneline(),
      ]);
      setStatus(st);
      setHistory(hist);
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

  return { client, status, history, isLoading, error, commandState, refresh: load };
}
