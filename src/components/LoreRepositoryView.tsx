import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLore } from '../hooks/useLore';
import { useAlert } from '../contexts/AlertContext';
import { LoreFileChange } from '../lore';
import LoreDiffView from './LoreDiffView';
import LoreMergeResolver from './LoreMergeResolver';
import LoreRevisionGraph from './LoreRevisionGraph';
import LoreRepositoryTree from './LoreRepositoryTree';
import LoreChangeTree from './LoreChangeTree';
import LoreMediaView from './LoreMediaView';
import LoreContextMenu, { LoreMenuItem } from './LoreContextMenu';
import LoreStashDialog from './LoreStashDialog';
import LoreApplyStashDialog from './LoreApplyStashDialog';
import MetadataDialog from './MetadataDialog';
import DependenciesDialog from './DependenciesDialog';
import { showInExplorer, openInEditor, openInConsole } from '../utils/osActions';
import { clipboard } from 'electron';
import { LoreTreeNode, LoreFileInfo, LoreFileHistoryEntry, LoreStash, LoreStashFile, StashInput, LoreBisectStep, LoreMetadataEntry } from '../lore';
import './LoreRepositoryView.css';
import './Toolbar.css';

interface LoreRepositoryViewProps {
  repoPath: string;
  isActiveTab: boolean;
  onTabStatusChange?: (status: { ahead: number; behind: number } | null) => void;
  refreshSignal?: number;
}

const CODE_COLORS: Record<string, string> = {
  A: 'var(--success-color)',
  M: 'var(--accent-color)',
  D: 'var(--danger-color)',
};

// Intrinsic keys returned by `metadata get` that aren't user-editable attributes.
const BRANCH_SYSTEM_KEYS = new Set(['name', 'creator', 'created', 'protect']);
const REVISION_SYSTEM_KEYS = new Set(['Branch', 'Date', 'Revision', 'Signature', 'Merge', 'Parent', 'Author', 'Message']);
const REPO_SYSTEM_KEYS = new Set(['name', 'description', 'default-branch', 'default-branch-name', 'creator', 'created']);

function changeColor(code: string): string {
  return CODE_COLORS[code[0]?.toUpperCase()] || 'var(--text-secondary)';
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
};
function imageMime(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_MIME[ext] ?? null;
}
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4',
  aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg', weba: 'audio/webm',
};
function mediaMime(path: string): { kind: 'image' | 'audio'; mime: string } | null {
  const img = imageMime(path);
  if (img) return { kind: 'image', mime: img };
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_MIME[ext]) return { kind: 'audio', mime: AUDIO_MIME[ext] };
  return null;
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lore repository panel. Presents Lore's own model (numbered revisions, staged/unstaged split,
 * sync-to-remote state, branches, file locks) but reuses the git RepositoryView chrome
 * (toolbar, resizable sidebar, content viewer) so Lore tabs feel consistent with git tabs.
 */
function LoreRepositoryView({ repoPath, isActiveTab, onTabStatusChange, refreshSignal = 0 }: LoreRepositoryViewProps) {
  const { showAlert, showConfirm } = useAlert();
  const { client, status, history, branches, locks, links, layers, graph, tree, stashStore, stashes, view, isLoading, error, commandState, refresh } = useLore({
    repoPath,
    onError: (err) => showAlert(err.message, 'Lore error'),
  });

  const lockedPaths = new Set(locks.map(l => l.path));

  const [commitMessage, setCommitMessage] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [editingView, setEditingView] = useState(false);
  const [viewDraft, setViewDraft] = useState('');
  const [revDetail, setRevDetail] = useState<import('../lore').LoreRevisionDetail | null>(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkForm, setLinkForm] = useState({ path: '', url: '', src: '/' });
  const [showAddLayer, setShowAddLayer] = useState(false);
  const [layerForm, setLayerForm] = useState({ path: '', repo: '', src: '/', meta: '' });
  const [bisectStart, setBisectStart] = useState('');
  const [bisectEnd, setBisectEnd] = useState('');
  const [bisect, setBisect] = useState<LoreBisectStep | null>(null);
  const [branchDiff, setBranchDiff] = useState<{ source: string; target: string; sourceRevision?: string; targetRevision?: string; files: LoreFileChange[] } | null>(null);
  const [metaEditor, setMetaEditor] = useState<{
    title: string; subtitle?: string; entries: LoreMetadataEntry[]; readOnlyEntries: LoreMetadataEntry[];
    readOnly: boolean; onSave?: (pairs: [string, string][]) => Promise<void>;
  } | null>(null);
  const [depsPath, setDepsPath] = useState<string | null>(null);
  const [resolvingPath, setResolvingPath] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: LoreMenuItem[] } | null>(null);
  const [stashDialog, setStashDialog] = useState<{ files: StashInput[]; selectedOnly: boolean } | null>(null);
  const [applyStashTarget, setApplyStashTarget] = useState<LoreStash | null>(null);
  const [selectedStash, setSelectedStash] = useState<LoreStash | null>(null);
  const [stashFile, setStashFile] = useState<{ file: LoreStashFile; kind: 'image' | 'audio' | 'text' | 'binary'; content?: string; url?: string } | null>(null);
  // Default to the Lore-centric repository tree; Changes (commit flow) and Graph are toggles.
  const [viewMode, setViewMode] = useState<'changes' | 'files' | 'graph'>('files');
  const [treeFile, setTreeFile] = useState<LoreTreeNode | null>(null);
  const [fileInfo, setFileInfo] = useState<LoreFileInfo | null>(null);
  const [fileHist, setFileHist] = useState<LoreFileHistoryEntry[]>([]);
  const [fileBinary, setFileBinary] = useState<boolean>(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  // Media (image/audio) preview & diff for the selected file (used in both Files and Changes views).
  const [mediaKind, setMediaKind] = useState<'image' | 'audio' | null>(null);
  const [mediaNewUrl, setMediaNewUrl] = useState<string | null>(null);
  const [mediaOldUrl, setMediaOldUrl] = useState<string | null>(null);
  const [mediaLoadingOld, setMediaLoadingOld] = useState<boolean>(false);
  // Files view shows the file content by default; clicking a history revision shows its diff.
  const [historyDiff, setHistoryDiff] = useState<boolean>(false);
  const [treeNodes, setTreeNodes] = useState<LoreTreeNode[]>([]);
  const [loadedDirs, setLoadedDirs] = useState<Set<string>>(new Set());

  // Seed the lazy tree from the top-level load; reset expansion state on each refresh.
  useEffect(() => { setTreeNodes(tree); setLoadedDirs(new Set()); }, [tree]);

  const lockOwners = new Map(locks.map(l => [l.path, l.owner]));
  const statusByPath = new Map<string, string>();
  status?.unstaged.forEach(f => statusByPath.set(f.path, f.code));
  status?.staged.forEach(f => statusByPath.set(f.path, f.code));
  status?.conflicted.forEach(f => statusByPath.set(f.path, '!'));

  // File nodes that exist in the repo tree but aren't materialized on disk (sparse/bare clone).
  // Recomputed as the lazy tree grows; cheap synchronous fs.existsSync per file node.
  const unfetchedPaths = useMemo(() => {
    const s = new Set<string>();
    if (client) for (const n of treeNodes) if (!n.isDir && !client.isFetched(n.path)) s.add(n.path);
    return s;
  }, [client, treeNodes]);
  const [leftWidth, setLeftWidth] = useState<number>(28);
  const draggingSplitter = useRef(false);
  // Width (%) of the changes/tree column within the content viewer; the detail/diff column fills
  // the rest. Resizable via the splitter between them.
  const [contentLeftWidth, setContentLeftWidth] = useState<number>(48);
  const draggingContent = useRef(false);

  const busy = isLoading || working;
  const ahead = status ? Math.max(0, status.local.number - status.remote.number) : 0;
  const behind = status ? Math.max(0, status.remote.number - status.local.number) : 0;

  // Report ahead/behind to the tab indicator from the parsed sync state.
  const prevTabStatus = useRef<string>('');
  useEffect(() => {
    if (!onTabStatusChange) return;
    if (!status) { onTabStatusChange(null); return; }
    const key = `${ahead}/${behind}`;
    if (key !== prevTabStatus.current) {
      prevTabStatus.current = key;
      onTabStatusChange(ahead || behind ? { ahead, behind } : null);
    }
  }, [status, ahead, behind, onTabStatusChange]);

  // Reload when the parent bumps the refresh signal.
  const prevRefresh = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal !== prevRefresh.current) {
      prevRefresh.current = refreshSignal;
      refresh();
    }
  }, [refreshSignal, refresh]);

  // Sidebar splitter drag. preventDefault on mousedown stops the browser from starting a text
  // selection, and user-select:none on the body keeps a drag from selecting content underneath.
  const onSplitterDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingSplitter.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingSplitter.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftWidth(Math.min(60, Math.max(15, pct)));
  };
  const onMouseUp = () => {
    if (!draggingSplitter.current) return;
    draggingSplitter.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  // Splitter between the content column (changes/tree) and the detail/diff column.
  const onContentSplitterDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingContent.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };
  const onContentMouseMove = (e: React.MouseEvent) => {
    if (!draggingContent.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setContentLeftWidth(Math.min(80, Math.max(15, pct)));
  };
  const onContentMouseUp = () => {
    if (!draggingContent.current) return;
    draggingContent.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  // `scan` defaults true (safe): operations that touch the working tree need a fresh fs walk.
  // Pass `{ scan: false }` for actions that can't change file state (lock, push, metadata, …) to
  // skip the `status --scan` filesystem walk + dirty-flag persistence on the follow-up refresh.
  const runAction = useCallback(async (fn: () => Promise<void>, opts?: { scan?: boolean }) => {
    setWorking(true);
    try {
      await fn();
      await refresh(opts);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore error');
    } finally {
      setWorking(false);
    }
  }, [refresh, showAlert]);

  // Shared opts for non-working-tree-mutating actions (locks, push, metadata, protect, gc, …).
  const NO_SCAN = { scan: false } as const;

  const clearMedia = () => { setMediaKind(null); setMediaNewUrl(null); setMediaOldUrl(null); };

  const onSelectFilePath = useCallback(async (filePath: string) => {
    setRevDetail(null);
    setSelectedStash(null);
    setSelectedPath(filePath);
    setHistoryDiff(false);
    setDiffText('');
    clearMedia();
    const media = mediaMime(filePath);
    if (media) {
      // Working tree (new) vs the current committed revision (old) — an image/audio diff.
      setMediaKind(media.kind);
      const b64 = client!.readWorkingFileBase64(filePath);
      setMediaNewUrl(b64 ? `data:${media.mime};base64,${b64}` : null);
      if (status?.local.number) {
        setMediaLoadingOld(true);
        try {
          const oldB64 = await client!.readFileAtRevisionBase64(filePath, status.local.signature);
          setMediaOldUrl(oldB64 ? `data:${media.mime};base64,${oldB64}` : null);
        } finally { setMediaLoadingOld(false); }
      }
      return;
    }
    setDiffLoading(true);
    try {
      setDiffText(await client!.diffText([filePath]));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore diff error');
    } finally {
      setDiffLoading(false);
    }
  }, [client, showAlert, status]);
  const onSelectFile = useCallback((file: LoreFileChange) => onSelectFilePath(file.path), [onSelectFilePath]);

  const doIgnore = (p: string, isDir: boolean) => runAction(async () => { client!.addToIgnore(isDir ? `${p}/` : p); });
  const absPath = (rel: string) => `${repoPath.replace(/[\\/]+$/, '')}/${rel}`;

  // --- multi-selection (Ctrl/Cmd toggle, Shift range) over the changed-files lists ---
  const onRowClick = useCallback((e: React.MouseEvent, path: string, ordered: string[]) => {
    if (e.ctrlKey || e.metaKey) {
      setSelection(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });
      anchorRef.current = path;
    } else if (e.shiftKey && anchorRef.current) {
      const a = ordered.indexOf(anchorRef.current), b = ordered.indexOf(path);
      if (a >= 0 && b >= 0) { const lo = Math.min(a, b), hi = Math.max(a, b); setSelection(new Set(ordered.slice(lo, hi + 1))); }
    } else {
      setSelection(new Set([path]));
      anchorRef.current = path;
      onSelectFilePath(path);
    }
  }, [selection, onSelectFilePath]);

  const doDeleteMany = (paths: string[]) => runAction(async () => {
    const ok = await showConfirm(`Delete ${paths.length} file(s) from the working tree? This removes ${paths.length === 1 ? 'it' : 'them'} from disk.`, 'Delete file');
    if (!ok) return;
    paths.forEach(p => client!.deleteWorkingFile(p));
  });

  // Context menu for a changed-file (or its folder) row.
  const onChangeContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean, staged: boolean) => {
    e.preventDefault();
    if (!isDir && !selection.has(path)) { setSelection(new Set([path])); anchorRef.current = path; onSelectFilePath(path); }
    const targets = isDir ? [path] : ((selection.has(path) && selection.size > 1) ? Array.from(selection) : [path]);
    const ext = path.includes('.') ? path.split('.').pop() : '';
    const items: LoreMenuItem[] = [
      { label: 'Show in File Explorer', onClick: () => showInExplorer(absPath(path)) },
      { label: 'Open in Editor', onClick: () => openInEditor(absPath(path)) },
      { label: 'Copy Path', onClick: () => clipboard.writeText(path) },
      { label: 'Copy Full Path', onClick: () => clipboard.writeText(absPath(path)) },
      { separator: true },
    ];
    if (isDir) {
      items.push({ label: 'Ignore folder', onClick: () => doIgnore(path, true) });
    } else {
      const n = targets.length > 1 ? ` (${targets.length})` : '';
      items.push({ label: `${staged ? 'Unstage' : 'Stage'}${n}`, onClick: () => runAction(async () => { staged ? await client!.unstage(targets) : await client!.stage(targets); }) });
      items.push({ label: 'Lock', onClick: () => runAction(async () => { await client!.lockAcquire(targets); }, NO_SCAN) });
      items.push({ label: 'Unlock', onClick: () => runAction(async () => { await client!.lockRelease(targets); }, NO_SCAN) });
      if (!staged) items.push({ label: `Discard${n}`, onClick: () => runAction(async () => { await client!.discard(targets); }) });
      items.push({ label: `Stash${n}`, onClick: () => doStashSelected(targets) });
      items.push({ separator: true });
      items.push({ label: `Ignore file${n}`, onClick: () => runAction(async () => { targets.forEach(p => client!.addToIgnore(p)); }) });
      if (ext) items.push({ label: `Ignore *.${ext}`, onClick: () => runAction(async () => { client!.addToIgnore(`*.${ext}`); }) });
      items.push({ label: 'Ignore custom pattern…', onClick: () => { const p = window.prompt('Ignore pattern (.loreignore):'); if (p && p.trim()) runAction(async () => { client!.addToIgnore(p.trim()); }); } });
      if (!staged) items.push({ separator: true }, { label: `Delete${n}`, danger: true, onClick: () => doDeleteMany(targets) });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, [selection, onSelectFilePath, client]);

  // Context menu for a Files-tree row.
  const onFileTreeContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    const ext = path.includes('.') ? path.split('.').pop() : '';
    const items: LoreMenuItem[] = [
      { label: 'Show in File Explorer', onClick: () => showInExplorer(absPath(path)) },
      { label: 'Open in Editor', onClick: () => openInEditor(absPath(path)) },
      { label: 'Copy Path', onClick: () => clipboard.writeText(path) },
      { label: 'Copy Full Path', onClick: () => clipboard.writeText(absPath(path)) },
      { separator: true },
    ];
    if (isDir) {
      items.push({ label: 'Check out folder (fetch to disk)', onClick: () => doCheckout(path, true) });
      items.push({ separator: true });
      items.push({ label: 'Ignore folder', onClick: () => doIgnore(path, true) });
    } else {
      if (!client!.isFetched(path)) {
        items.push({ label: 'Check out (fetch to disk)', onClick: () => doCheckout(path, false) });
        items.push({ separator: true });
      }
      items.push({ label: 'Dependencies…', onClick: () => setDepsPath(path) });
      items.push({ label: 'File Metadata…', onClick: () => openFileMetadata(path) });
      items.push({ label: 'Lock', onClick: () => runAction(async () => { await client!.lockAcquire([path]); }, NO_SCAN) });
      items.push({ label: 'Unlock', onClick: () => runAction(async () => { await client!.lockRelease([path]); }, NO_SCAN) });
      items.push({ label: 'Ignore file', onClick: () => doIgnore(path, false) });
      if (ext) items.push({ label: `Ignore *.${ext}`, onClick: () => runAction(async () => { client!.addToIgnore(`*.${ext}`); }) });
      items.push({ label: 'Ignore custom pattern…', onClick: () => { const p = window.prompt('Ignore pattern (.loreignore):'); if (p && p.trim()) runAction(async () => { client!.addToIgnore(p.trim()); }); } });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, [client]);

  const doGc = () => runAction(async () => { await client!.gc(); showAlert('Garbage collection complete.', 'Repository GC'); }, NO_SCAN);
  const doInstances = async () => { const out = await client!.instances(); showAlert(out.trim() || 'No registered instances.', 'Instances'); };
  const doWatchEvents = async () => {
    const ans = window.prompt('Watch repository events for how many seconds?', '30');
    if (ans == null) return;
    const secs = Math.max(1, Math.min(600, parseInt(ans, 10) || 30));
    setWorking(true);
    try {
      const out = await client!.notificationSubscribe(secs);
      showAlert(out.trim() || `No events in ${secs}s.`, 'Repository events');
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore error');
    } finally { setWorking(false); }
  };
  const doResetToServer = () => runAction(async () => {
    const ok = await showConfirm('Reset to server: discard ALL local modifications and sync to the latest remote revision?', 'Reset to server');
    if (!ok) return;
    await client!.sync({ reset: true });
  });
  const doClean = () => runAction(async () => {
    const untracked = (status?.unstaged ?? []).filter(f => f.code.toUpperCase().startsWith('A') && !f.path.endsWith('/')).map(f => f.path);
    if (!untracked.length) { showAlert('No untracked files to clean.', 'Clean working directory'); return; }
    const ok = await showConfirm(`Delete ${untracked.length} untracked file(s) from the working tree?`, 'Clean working directory');
    if (!ok) return;
    untracked.forEach(p => client!.deleteWorkingFile(p));
  });

  // Repository "…" menu.
  const onRepoMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const url = client?.serverUrl();
    setMenu({ x: r.left, y: r.bottom + 2, items: [
      { label: 'Open in File Explorer', onClick: () => showInExplorer(repoPath) },
      { label: 'Open in Editor', onClick: () => openInEditor(repoPath) },
      { label: 'Open in Console', onClick: () => openInConsole(repoPath) },
      { label: 'Copy Local Path', onClick: () => clipboard.writeText(repoPath) },
      { label: 'Copy Server URL', disabled: !url, onClick: () => url && clipboard.writeText(url) },
      { separator: true },
      { label: 'Repository Metadata…', onClick: openRepositoryMetadata },
      { label: 'Find Revision…', onClick: doFindRevision },
      { label: 'Repository Info…', onClick: doRepositoryInfo },
      { label: 'Verify Repository', onClick: doVerify },
      { separator: true },
      { label: 'Run Garbage Collection', onClick: doGc },
      { label: 'List Instances…', onClick: doInstances },
      { label: 'Clean Working Directory…', onClick: doClean },
      { label: 'Watch Events…', onClick: doWatchEvents },
      { separator: true },
      { label: 'Reset to Server…', danger: true, onClick: doResetToServer },
    ] });
  };

  // --- stashes (client-side emulation) ---
  const changesToStash = (filter?: Set<string>): StashInput[] => {
    if (!status) return [];
    const pick = (list: typeof status.unstaged, staged: boolean) => list
      .filter(f => !f.path.endsWith('/') && (!filter || filter.has(f.path)))
      .map(f => ({ path: f.path, change: f.code, staged }));
    return [...pick(status.unstaged, false), ...pick(status.staged, true)];
  };
  const doStashAll = () => {
    const files = changesToStash();
    if (!files.length) { showAlert('No changes to stash.', 'Stash'); return; }
    setStashDialog({ files, selectedOnly: false });
  };
  const doStashSelected = (targets: string[]) => {
    const files = changesToStash(new Set(targets));
    if (!files.length) { showAlert('No stashable changes in the selection.', 'Stash'); return; }
    setStashDialog({ files, selectedOnly: true });
  };
  const createStash = async (message: string, description: string, keep: boolean) => {
    if (!stashStore || !stashDialog) return;
    try {
      await stashStore.create({ message, description, branch: status?.branch ?? '', files: stashDialog.files, keep });
      await refresh();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Stash error');
    }
  };
  const applyStash = (id: string, pop: boolean) => runAction(async () => { await stashStore!.apply(id, pop); });
  const openApplyStash = (s: LoreStash) => setApplyStashTarget(s);
  const deleteStash = (s: LoreStash) => {
    showConfirm(`Delete stash "${s.message}"? This cannot be undone.`, 'Delete stash').then(ok => {
      if (!ok) return;
      runAction(async () => {
        stashStore!.remove(s.id);
        if (selectedStash?.id === s.id) { setSelectedStash(null); setStashFile(null); }
      });
    });
  };
  const renameStash = (s: LoreStash) => {
    const m = window.prompt('Stash description:', s.message);
    if (m === null) return;
    const d = window.prompt('Details (optional):', s.description) ?? s.description;
    runAction(async () => { stashStore!.rename(s.id, m.trim() || s.message, d); });
  };
  // Single click shows the stash's contents (does not apply it).
  const onSelectStash = (s: LoreStash) => {
    setSelectedStash(s);
    setStashFile(null);
    setSelectedPath(null);
    setRevDetail(null);
    setTreeFile(null);
  };
  const onSelectStashFile = (s: LoreStash, file: LoreStashFile) => {
    const media = mediaMime(file.path);
    const bytes = file.blob ? stashStore!.readBlobBytes(s.id, file.blob) : null;
    if (!bytes) { setStashFile({ file, kind: 'binary' }); return; }
    if (media) { setStashFile({ file, kind: media.kind, url: `data:${media.mime};base64,${bytes.toString('base64')}` }); return; }
    if (bytes.includes(0)) { setStashFile({ file, kind: 'binary' }); return; }
    setStashFile({ file, kind: 'text', content: bytes.toString('utf8') });
  };
  const onStashMenu = (e: React.MouseEvent, s: LoreStash) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: [
      { label: 'Show Contents', onClick: () => onSelectStash(s) },
      { label: 'Apply…', onClick: () => openApplyStash(s) },
      { label: 'Rename…', onClick: () => renameStash(s) },
      { separator: true },
      { label: 'Delete…', danger: true, onClick: () => deleteStash(s) },
    ] });
  };

  // Branch row context menu.
  // Diff another branch against the current one: show the changes `source` has that current lacks.
  const doBranchDiff = (source: string) => runAction(async () => {
    const target = status?.branch;
    if (!target) return;
    const r = await client!.branchDiff(target, source);
    setViewMode('changes');
    setSelectedPath(null); setRevDetail(null); setSelectedStash(null); setTreeFile(null);
    setBranchDiff({ source, target, sourceRevision: r.sourceRevision, targetRevision: r.targetRevision, files: r.files });
  }, NO_SCAN);

  const onSelectBranchDiffFile = useCallback(async (path: string) => {
    if (!branchDiff) return;
    setSelectedPath(path);
    setDiffLoading(true);
    try {
      setDiffText(await client!.diffText([path], branchDiff.targetRevision, branchDiff.sourceRevision));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore diff error');
    } finally {
      setDiffLoading(false);
    }
  }, [client, branchDiff, showAlert]);

  // Open a key/value metadata editor for a branch (intrinsic keys shown read-only).
  const openBranchMetadata = async (branch: string) => {
    try {
      const all = await client!.branchMetadataGet(branch);
      const editable = all.filter(e => !BRANCH_SYSTEM_KEYS.has(e.key));
      setMetaEditor({
        title: `Branch metadata — ${branch}`,
        subtitle: 'Key/value attributes stored on the branch. Intrinsic fields are shown read-only.',
        entries: editable,
        readOnlyEntries: all.filter(e => BRANCH_SYSTEM_KEYS.has(e.key)),
        readOnly: false,
        onSave: async (pairs) => {
          try {
            const newKeys = new Set(pairs.map(([k]) => k));
            const removed = editable.map(e => e.key).filter(k => !newKeys.has(k));
            await client!.branchMetadataSet(branch, pairs);
            if (removed.length) await client!.branchMetadataClear(branch, removed);
            await refresh(NO_SCAN);
          } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
        },
      });
    } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
  };

  // Edit metadata on the staged revision (only the staged, not-yet-committed revision is editable).
  const openStagedRevisionMetadata = async () => {
    try {
      const all = await client!.revisionMetadataGet();
      const editable = all.filter(e => !REVISION_SYSTEM_KEYS.has(e.key));
      setMetaEditor({
        title: 'Revision metadata (staged)',
        subtitle: 'Attributes attached to the revision you are about to commit.',
        entries: editable,
        readOnlyEntries: all.filter(e => REVISION_SYSTEM_KEYS.has(e.key)),
        readOnly: false,
        onSave: async (pairs) => {
          try {
            await client!.revisionMetadataClear(); // revisions support only clear-all, so reset then re-set
            await client!.revisionMetadataSet(pairs);
            await refresh(NO_SCAN);
          } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
        },
      });
    } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
  };

  // View (read-only) the metadata stored on a committed revision.
  const viewRevisionMetadata = async (signature: string, number: number) => {
    try {
      const all = await client!.revisionMetadataGet(signature);
      setMetaEditor({
        title: `Revision ${number} metadata`,
        entries: all.filter(e => !REVISION_SYSTEM_KEYS.has(e.key)),
        readOnlyEntries: all.filter(e => REVISION_SYSTEM_KEYS.has(e.key)),
        readOnly: true,
      });
    } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
  };

  // Edit repository-level metadata (intrinsic keys shown read-only).
  const openRepositoryMetadata = async () => {
    try {
      const all = await client!.repositoryMetadataGet();
      const editable = all.filter(e => !REPO_SYSTEM_KEYS.has(e.key));
      setMetaEditor({
        title: 'Repository metadata',
        subtitle: 'Key/value attributes stored on the repository.',
        entries: editable,
        readOnlyEntries: all.filter(e => REPO_SYSTEM_KEYS.has(e.key)),
        readOnly: false,
        onSave: async (pairs) => {
          try {
            const newKeys = new Set(pairs.map(([k]) => k));
            const removed = editable.map(e => e.key).filter(k => !newKeys.has(k));
            await client!.repositoryMetadataSet(pairs);
            if (removed.length) await client!.repositoryMetadataClear(removed);
            await refresh(NO_SCAN);
          } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
        },
      });
    } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
  };

  // File metadata: editable only when the file is staged (set/clear act on the staged file);
  // otherwise show it read-only at the current revision.
  const openFileMetadata = async (filePath: string) => {
    try {
      const staged = !!status?.staged.some(f => f.path === filePath);
      const all = await client!.fileMetadataGet(filePath);
      setMetaEditor({
        title: `File metadata — ${filePath}`,
        subtitle: staged
          ? 'Attributes on this staged file.'
          : 'Read-only — Lore only lets you set file metadata while the file is staged.',
        entries: all,
        readOnlyEntries: [],
        readOnly: !staged,
        onSave: staged ? async (pairs) => {
          try {
            await client!.fileMetadataClear(filePath); // files support only clear-all, so reset then re-set
            await client!.fileMetadataSet(filePath, pairs);
            await refresh(NO_SCAN);
          } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
        } : undefined,
      });
    } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore metadata error'); }
  };

  const doVerify = () => runAction(async () => {
    const out = await client!.verify();
    showAlert(out.trim() || 'Repository state verified.', 'Verify repository');
  }, NO_SCAN);
  const doRepositoryInfo = async () => {
    try { showAlert((await client!.repositoryInfo()).trim() || 'No info.', 'Repository info'); }
    catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore error'); }
  };

  // Find a revision by number or metadata (key or key=value) and open its detail.
  const doFindRevision = async () => {
    const q = window.prompt('Find revision — enter a number, a metadata key, or key=value:');
    if (q == null || !q.trim()) return;
    const query = q.trim();
    try {
      let sigs: string[];
      if (/^\d+$/.test(query)) sigs = await client!.revisionFindByNumber(parseInt(query, 10));
      else { const [k, ...rest] = query.split('='); sigs = await client!.revisionFindByMetadata(k.trim(), rest.join('=').trim() || undefined); }
      if (!sigs.length) { showAlert(`No revision matched "${query}".`, 'Find revision'); return; }
      setViewMode('changes');
      await onSelectRevision({ signature: sigs[0] });
      if (sigs.length > 1) showAlert(`${sigs.length} revisions matched; showing the first.`, 'Find revision');
    } catch (err) { showAlert(err instanceof Error ? err.message : String(err), 'Lore error'); }
  };

  const onBranchMenu = (e: React.MouseEvent, branch: string) => {
    e.preventDefault();
    const isCurrent = branch === status?.branch;
    const items: LoreMenuItem[] = [];
    if (!isCurrent) items.push(
      { label: 'Switch to Branch', onClick: () => doSwitchBranch(branch) },
      { label: `Merge into ${status?.branch}`, onClick: () => doMerge(branch) },
      { label: `Diff against ${status?.branch}`, onClick: () => doBranchDiff(branch) },
    );
    items.push({ label: 'Push', onClick: () => runAction(async () => { await client!.push(branch); }, NO_SCAN) });
    items.push({ separator: true });
    items.push({ label: 'Edit Metadata…', onClick: () => openBranchMetadata(branch) });
    items.push({ label: 'Protect', onClick: () => runAction(async () => { await client!.branchProtect(branch); }, NO_SCAN) });
    items.push({ label: 'Unprotect', onClick: () => runAction(async () => { await client!.branchUnprotect(branch); }, NO_SCAN) });
    if (!isCurrent) items.push({ label: 'Archive', danger: true, onClick: () => runAction(async () => { await client!.branchArchive(branch); }) });
    items.push({ separator: true });
    items.push({ label: 'Copy Branch Name', onClick: () => clipboard.writeText(branch) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Revision (history / graph) context menu.
  const onRevisionMenu = (e: React.MouseEvent, rev: { signature: string; number: number; message: string }, isLatest: boolean) => {
    e.preventDefault();
    const items: LoreMenuItem[] = [
      { label: 'Sync to This Revision', onClick: () => runAction(async () => { await client!.sync({ revision: rev.signature }); }) },
      { label: 'Reset Branch to Here…', danger: true, onClick: () => runAction(async () => { const ok = await showConfirm(`Reset ${status?.branch} to revision ${rev.number}?`, 'Reset branch'); if (ok) await client!.branchReset(rev.signature); }) },
      { label: 'New Branch from Here…', onClick: () => { const name = window.prompt('New branch name:'); if (name && name.trim()) runAction(async () => { await client!.createBranch(name.trim()); await client!.branchReset(rev.signature, name.trim()); }); } },
      { separator: true },
      { label: 'Cherry-pick', onClick: () => doCherryPick(rev.signature) },
      { label: 'Revert', onClick: () => doRevert(rev.signature) },
    ];
    if (isLatest) items.push({ label: 'Amend Message…', onClick: () => { const m = window.prompt('New commit message:', rev.message); if (m && m.trim()) runAction(async () => { await client!.amend(m.trim()); }); } });
    items.push({ label: 'View Metadata…', onClick: () => viewRevisionMetadata(rev.signature, rev.number) });
    items.push({ separator: true });
    items.push({ label: 'Copy Signature', onClick: () => clipboard.writeText(rev.signature) });
    items.push({ label: 'Copy Info', onClick: () => clipboard.writeText(`revision ${rev.number}\n${rev.signature}\n${rev.message}`) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onSelectRevision = useCallback(async (rev: { signature: string }) => {
    setSelectedPath(null);
    setSelectedStash(null);
    setRevDetail(null);
    setBranchDiff(null);
    try {
      setRevDetail(await client!.revisionInfo(rev.signature));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore revision error');
    }
  }, [client, showAlert]);

  // Lazily fetch a directory's children and merge them into the tree.
  const loadDir = useCallback(async (dirPath: string) => {
    if (!client || loadedDirs.has(dirPath)) return;
    try {
      const children = await client.tree(dirPath, 2);
      setTreeNodes(prev => {
        const seen = new Set(prev.map(n => n.path));
        return [...prev, ...children.filter(n => !seen.has(n.path))];
      });
      setLoadedDirs(prev => new Set(prev).add(dirPath));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore tree error');
    }
  }, [client, loadedDirs, showAlert]);

  // Files view: show a FULL FILE VIEW (image preview / binary card / text content) plus the
  // asset's history. Each lookup is best-effort so an untracked (never-committed) file — which
  // has no `file history` — still opens cleanly instead of erroring.
  const onSelectTreeFile = useCallback(async (node: LoreTreeNode) => {
    setTreeFile(node);
    setSelectedPath(node.path);
    setRevDetail(null);
    setSelectedStash(null);
    setDiffText('');
    setFileInfo(null);
    setFileHist([]);
    setFileBinary(false);
    setFileContent(null);
    setHistoryDiff(false);
    clearMedia();
    setDiffLoading(true);
    try {
      // Un-fetched files (sparse/bare clone) aren't on disk — stream their content from the store
      // at the current head revision instead of reading the (absent) working file.
      const fetched = client!.isFetched(node.path);
      const headRev = status?.local.signature;
      const media = mediaMime(node.path);
      if (media) {
        setMediaKind(media.kind);
        const b64 = fetched
          ? client!.readWorkingFileBase64(node.path)
          : (headRev ? await client!.readFileAtRevisionBase64(node.path, headRev) : null);
        setMediaNewUrl(b64 ? `data:${media.mime};base64,${b64}` : null);
      } else if (client!.isProbablyBinary(node.path)) {
        setFileBinary(true);
      } else if (fetched) {
        try { setFileContent(client!.readWorkingFile(node.path)); } catch { setFileContent(''); }
      } else {
        const text = headRev ? await client!.readFileAtRevisionText(node.path, headRev) : null;
        setFileContent(text ?? '');
      }
      // Best-effort metadata; ignore failures (e.g. no history for an untracked file).
      const [info, hist] = await Promise.all([
        client!.fileInfo(node.path).catch(() => null),
        client!.fileHistory(node.path).catch(() => []),
      ]);
      setFileInfo(info);
      setFileHist(hist);
    } finally {
      setDiffLoading(false);
    }
  }, [client, status]);

  // Diff a file at a specific point in its history (revision vs the previous one).
  const onSelectFileHistory = useCallback(async (idx: number) => {
    if (!treeFile) return;
    const cur = fileHist[idx];
    const prev = fileHist[idx + 1];
    setSelectedPath(treeFile.path);
    setHistoryDiff(true);
    const media = mediaMime(treeFile.path);
    if (media) {
      // old (previous revision) vs new (this revision) — image/audio diff.
      setMediaKind(media.kind);
      setMediaNewUrl(null);
      setMediaOldUrl(null);
      setMediaLoadingOld(true);
      try {
        const [newB64, oldB64] = await Promise.all([
          client!.readFileAtRevisionBase64(treeFile.path, cur.signature),
          prev ? client!.readFileAtRevisionBase64(treeFile.path, prev.signature) : Promise.resolve(null),
        ]);
        setMediaNewUrl(newB64 ? `data:${media.mime};base64,${newB64}` : null);
        setMediaOldUrl(oldB64 ? `data:${media.mime};base64,${oldB64}` : null);
      } finally { setMediaLoadingOld(false); }
      return;
    }
    setDiffLoading(true);
    try {
      setDiffText(await client!.diffText([treeFile.path], prev?.signature, cur.signature));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore diff error');
    } finally {
      setDiffLoading(false);
    }
  }, [client, treeFile, fileHist, showAlert]);

  // Diff a file as it changed in the detailed revision (revision vs its parent).
  const onSelectRevFile = useCallback(async (path: string) => {
    if (!revDetail) return;
    setSelectedPath(path);
    setDiffText('');
    setDiffLoading(true);
    try {
      setDiffText(await client!.diffText([path], revDetail.revision.parent, revDetail.revision.signature));
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore diff error');
    } finally {
      setDiffLoading(false);
    }
  }, [client, revDetail, showAlert]);

  const doSync = () => runAction(async () => {
    const r = await client!.sync();
    showAlert(
      r.upToDate
        ? `Already up to date (revision ${r.toRevision?.number ?? '?'}).`
        : r.toRevision
          ? `Synced ${r.branch ?? ''} to revision ${r.toRevision.number}.`.trim()
          : (r.raw.trim() || 'Sync complete.'),
      'Lore sync',
    );
  });

  const doPush = () => runAction(async () => {
    const r = await client!.push();
    if (r.pushed.length) {
      const lines = r.pushed.map(p => `revision ${p.number} -> branch ${p.branch}`).join('\n');
      const summary = r.bytes ? `Pushed ${r.pushed.length} revision(s) (${r.bytes}):\n${lines}` : `Pushed:\n${lines}`;
      showAlert(summary, 'Lore push');
    } else {
      showAlert(r.raw.trim() || 'Nothing to push.', 'Lore push');
    }
  }, NO_SCAN);

  const doLock = (path: string) => runAction(async () => { await client!.lockAcquire([path]); }, NO_SCAN);
  const doUnlock = (path: string) => runAction(async () => { await client!.lockRelease([path]); }, NO_SCAN);

  // Bisect: a stateless step search. Start with a good (start) and bad (end) revision; each step
  // syncs the working tree to the midpoint and we re-invoke with the chosen narrower range.
  const startBisect = () => runAction(async () => {
    if (!bisectStart || !bisectEnd) throw new Error('Pick a good (start) and a bad (end) revision first.');
    setBisect(await client!.bisect(bisectStart, bisectEnd));
  });
  const answerBisect = (contains: boolean) => runAction(async () => {
    const next = contains ? bisect?.ifContains : bisect?.ifClean;
    if (!next) return;
    setBisect(await client!.bisect(next.start, next.end));
  });
  const resetBisect = () => { setBisect(null); setBisectStart(''); setBisectEnd(''); };

  const doLinkAdd = () => runAction(async () => {
    if (!linkForm.path.trim() || !linkForm.url.trim()) throw new Error('Link mount path and repository URL are required');
    await client!.linkAdd(linkForm.path.trim(), linkForm.url.trim(), linkForm.src.trim() || '/');
    setLinkForm({ path: '', url: '', src: '/' }); setShowAddLink(false);
  });
  const doLinkRemove = (linkPath: string) => runAction(async () => { await client!.linkRemove(linkPath); });
  const doLinkUpdate = (linkPath: string) => {
    const pin = window.prompt(`Re-pin link "${linkPath}" to (branch or revision; blank = latest on current branch):`, '');
    if (pin == null) return;
    runAction(async () => { await client!.linkUpdate(linkPath, pin.trim() || undefined); });
  };
  const doLayerAdd = () => runAction(async () => {
    if (!layerForm.path.trim() || !layerForm.repo.trim()) throw new Error('Layer mount path and repository are required');
    await client!.layerAdd(layerForm.path.trim(), layerForm.repo.trim(), layerForm.src.trim() || '/', layerForm.meta.trim() || undefined);
    setLayerForm({ path: '', repo: '', src: '/', meta: '' }); setShowAddLayer(false);
  });
  const doLayerRemove = (path: string, repo?: string) => runAction(async () => { await client!.layerRemove(path, repo); });

  const doSwitchBranch = (name: string) => { if (name !== status?.branch) runAction(async () => { await client!.switchBranch(name); }); };
  const doMerge = (branch: string) => runAction(async () => {
    const r = await client!.mergeStart(branch);
    showAlert(
      r.committed
        ? `Merged ${branch} (clean, auto-committed).`
        : `Merge of ${branch} stopped with ${r.conflicted.length} conflict(s): ${r.conflicted.join(', ')}.\nResolve them, then Commit to finish.`,
      'Lore merge',
    );
  });
  const op = status?.merge?.operation ?? 'merge';
  const doResolve = (path: string, side: 'mine' | 'theirs') => runAction(async () => { await client!.conflictResolve(op, [path], side); });
  const doMergeAbort = () => runAction(async () => { await client!.conflictAbort(op); });
  const doRevert = (sig: string) => runAction(async () => {
    const r = await client!.revert(sig);
    showAlert(r.committed ? 'Revert committed.' : `Revert stopped with ${r.conflicted.length} conflict(s) — resolve, then commit.`, 'Lore revert');
  });
  const doCherryPick = (sig: string) => runAction(async () => {
    const r = await client!.cherryPick(sig);
    showAlert(r.committed ? 'Cherry-pick committed.' : `Cherry-pick stopped with ${r.conflicted.length} conflict(s) — resolve, then commit.`, 'Lore cherry-pick');
  });
  const doCreateBranch = () => runAction(async () => {
    const name = newBranchName.trim();
    if (!name) throw new Error('Branch name is required');
    await client!.createBranch(name);
    await client!.switchBranch(name);
    setNewBranchName('');
    setShowNewBranch(false);
  });

  const startEditView = () => { setViewDraft(view ?? '**\n!path/**\n'); setEditingView(true); };
  const doSaveView = () => runAction(async () => {
    await client!.writeView(viewDraft);
    setEditingView(false);
  });

  // Check out (materialize) an un-fetched path from the Files view: add it to the sparse view and
  // sync. `sync --reset` is additive — it fetches the newly-included path without dropping anything
  // already on disk — so this is safe even when the current view is unknown/empty.
  const doCheckout = (p: string, isDir: boolean) => runAction(async () => {
    const include = isDir ? `!${p}/**` : `!${p}`;
    const lines = ((await client!.readView()) ?? '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.includes('**')) lines.unshift('**'); // exclude-all base, so the `!` re-includes mean something
    if (!lines.includes(include)) lines.push(include);
    await client!.writeView(lines.join('\n'));
    await client!.sync({ reset: true });
  });

  const stageAll = () => runAction(async () => { await client!.stage((status?.unstaged ?? []).map(f => f.path)); });
  const doCommit = () => runAction(async () => {
    const msg = commitMessage.trim()
      || (status?.merge?.inProgress ? `Merge ${status.merge.incoming?.slice(0, 8) ?? ''}`.trim() : '');
    if (!msg) throw new Error('Commit message is required');
    await client!.commit(msg);
    setCommitMessage('');
  });

  if (error && !status) {
    return (
      <div className="repository-view">
        <div className="loading" style={{ color: 'var(--danger-color)' }}>
          <h3>Lore error</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          <button className="lore-mini-btn" onClick={() => refresh()}>Retry</button>
        </div>
      </div>
    );
  }

  const lastCommand = commandState.length > 0 ? commandState[commandState.length - 1].command : '';
  const repoName = repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;
  const serverUrl = client ? client.serverUrl() : null;

  return (
    <div className="repository-view">
      {/* Toolbar (reuses git toolbar styling) */}
      <div className="toolbar">
        <button className="toolbar-button" onClick={() => refresh()} disabled={busy}>
          <span className={`toolbar-button-icon ${busy ? 'spinning' : ''}`}>↻</span>
          <span className="toolbar-button-label">Refresh</span>
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-button" onClick={doSync} disabled={busy}>
          <span className="toolbar-button-icon">⤓</span>
          <span className="toolbar-button-label">{behind > 0 ? `Sync (${behind})` : 'Sync'}</span>
        </button>
        <button className="toolbar-button" onClick={doPush} disabled={busy}>
          <span className="toolbar-button-icon">⬆</span>
          <span className="toolbar-button-label">{ahead > 0 ? `Push (${ahead})` : 'Push'}</span>
        </button>
        <div className="toolbar-separator" />
        <div className="lore-view-toggle" role="tablist" title="Switch view">
          <button className={`toolbar-button ${viewMode === 'changes' ? 'active' : ''}`} onClick={() => setViewMode('changes')}>
            <span className="toolbar-button-icon">✎</span>
            <span className="toolbar-button-label">Changes</span>
          </button>
          <button className={`toolbar-button ${viewMode === 'files' ? 'active' : ''}`} onClick={() => setViewMode('files')}>
            <span className="toolbar-button-icon">🗂</span>
            <span className="toolbar-button-label">Files</span>
          </button>
          <button className={`toolbar-button ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>
            <span className="toolbar-button-icon">🕸</span>
            <span className="toolbar-button-label">Graph</span>
          </button>
        </div>
        <div className="toolbar-separator" />
        {status && (
          <div className={`lore-sync-gauge ${status.syncState}`} title={`local revision ${status.local.number}, remote revision ${status.remote.number} (${status.syncState})`}>
            <span className="lore-sync-num">{status.local.number}</span>
            <span className="lore-sync-arrow">{ahead > 0 && behind > 0 ? '⇄' : ahead > 0 ? '↑' : behind > 0 ? '↓' : '='}</span>
            <span className="lore-sync-num">{status.remote.number}</span>
            <span className="lore-sync-state">{status.syncState}</span>
          </div>
        )}
        {commandState.length > 0 &&
          <div className="toolbar-status"><span className="toolbar-busy-spinner" title={lastCommand}>↻</span></div>}
      </div>

      <div className="repo-content-horizontal" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        {isLoading && !status && <div className="loading">Loading Lore repository...</div>}

        {status && (
          <>
            {/* Sidebar: repo info + branches + locks */}
            <div className="repo-sidebar" style={{ width: `${leftWidth}%` }}>
              <div className="lore-info-card">
                <div className="lore-info-card-header">
                  <span className="lore-repo-name" title={repoPath}>{repoName}</span>
                  <button className="lore-info-menu" onClick={onRepoMenu} title="Repository actions">⋯</button>
                </div>
                <div className="lore-info-line"><span className="lore-info-key">Local:</span> <span className="lore-info-local">{repoPath}</span></div>
                {serverUrl && <div className="lore-info-line"><span className="lore-info-key">Server:</span> <span className="lore-info-origin">{serverUrl}</span></div>}
                <div className="lore-info-line">
                  <span className="lore-info-key">Branch:</span> <span className="lore-info-branch">{status.branch}</span>
                  <span className={`lore-badge ${status.syncState}`} style={{ marginLeft: 6 }}>rev {status.local.number} · {status.syncState}</span>
                </div>
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Branches</span>
                  <button className="lore-mini-btn" disabled={busy} onClick={() => setShowNewBranch(true)}>+ New</button>
                </div>
                {showNewBranch && (
                  <div className="lore-row always-actions">
                    <input
                      autoFocus
                      className="lore-new-branch-input lore-row-name"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') doCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
                      placeholder="new branch name"
                    />
                    <span className="lore-row-actions">
                      <button className="lore-mini-btn" disabled={busy || !newBranchName.trim()} onClick={doCreateBranch}>Create</button>
                      <button className="lore-mini-btn" onClick={() => setShowNewBranch(false)}>Cancel</button>
                    </span>
                  </div>
                )}
                {(branches?.local ?? []).map(b => (
                  <div
                    key={b.name}
                    className={`lore-row ${b.name === status.branch ? 'current' : ''}`}
                    onClick={() => doSwitchBranch(b.name)}
                    onContextMenu={(e) => onBranchMenu(e, b.name)}
                    title={b.name === status.branch ? 'Current branch' : 'Switch to this branch'}
                  >
                    <span className="lore-row-name">{b.name}</span>
                    <button className="lore-row-menu" disabled={busy} title="Branch actions"
                      onClick={(e) => { e.stopPropagation(); onBranchMenu(e, b.name); }}>⋯</button>
                  </div>
                ))}
                {!branches?.local.length && <div className="lore-empty">no branches</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header"><span>Locks {locks.length ? `(${locks.length})` : ''}</span></div>
                {locks.length ? locks.map(l => (
                  <div key={l.path} className="lore-row always-actions">
                    <span title="Locked" style={{ color: 'var(--warning-color)' }}>🔒</span>
                    <span className="lore-row-name" title={`by ${l.owner}`}>{l.path}</span>
                    <span className="lore-lock-owner">{l.owner}</span>
                    <span className="lore-row-actions">
                      <button className="lore-mini-btn" disabled={busy} onClick={() => doUnlock(l.path)}>Release</button>
                    </span>
                  </div>
                )) : <div className="lore-empty">no locked files</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Stashes {stashes.length ? `(${stashes.length})` : ''}</span>
                  <button className="lore-mini-btn" disabled={busy} onClick={doStashAll}>Stash all</button>
                </div>
                {stashes.length ? stashes.map(s => (
                  <div key={s.id} className={`lore-row ${selectedStash?.id === s.id ? 'selected' : ''}`}
                    onClick={() => onSelectStash(s)} onDoubleClick={() => openApplyStash(s)}
                    onContextMenu={(e) => onStashMenu(e, s)} title={`${s.message}${s.description ? '\n\n' + s.description : ''}\n\n${s.files.length} file(s) on ${s.branch} · ${new Date(s.date).toLocaleString()}\n\nClick to view · double-click to apply`}>
                    <span>📦</span>
                    <span className="lore-row-name">{s.message}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{s.files.length}</span>
                    <button className="lore-row-menu" disabled={busy} title="Stash actions"
                      onClick={(e) => { e.stopPropagation(); onStashMenu(e, s); }}>⋯</button>
                  </div>
                )) : <div className="lore-empty">no stashes</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Sparse view</span>
                  {!editingView && <button className="lore-mini-btn" disabled={busy} onClick={startEditView}>Edit</button>}
                </div>
                {editingView ? (
                  <div style={{ padding: '4px 10px 8px' }}>
                    <textarea
                      className="lore-commit-input"
                      style={{ minHeight: 72, fontFamily: 'monospace' }}
                      value={viewDraft}
                      onChange={(e) => setViewDraft(e.target.value)}
                      placeholder={'**\n!src/**'}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0' }}>
                      gitignore-style: <code>**</code> excludes all, <code>!path/**</code> re-includes.
                      Applies to clone &amp; future syncs (not a live re-checkout).
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="lore-mini-btn" disabled={busy} onClick={doSaveView}>Save</button>
                      <button className="lore-mini-btn" onClick={() => setEditingView(false)}>Cancel</button>
                    </div>
                  </div>
                ) : view ? (
                  <pre style={{ margin: 0, padding: '4px 10px 8px', fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{view.trim()}</pre>
                ) : (
                  <div className="lore-empty">Full checkout (no view filter)</div>
                )}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Links {links.length ? `(${links.length})` : ''}</span>
                  {!showAddLink && <button className="lore-mini-btn" disabled={busy} onClick={() => setShowAddLink(true)}>+ Link</button>}
                </div>
                {showAddLink && (
                  <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input className="lore-new-branch-input" placeholder="mount path (e.g. vendor)" value={linkForm.path} onChange={(e) => setLinkForm({ ...linkForm, path: e.target.value })} />
                    <input className="lore-new-branch-input" placeholder="lore://host:port/repo" value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} />
                    <input className="lore-new-branch-input" placeholder="source path (default /)" value={linkForm.src} onChange={(e) => setLinkForm({ ...linkForm, src: e.target.value })} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="lore-mini-btn" disabled={busy} onClick={doLinkAdd}>Add</button>
                      <button className="lore-mini-btn" onClick={() => setShowAddLink(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                {links.map(l => (
                  <div key={l.id} className="lore-row always-actions" title={`${l.linkPath} ← ${l.sourcePath}${l.revision ? ` @ ${l.revision.slice(0, 8)}` : ''}`}>
                    <span className="lore-row-name">{l.linkPath} ← {l.sourcePath}</span>
                    <span className="lore-row-actions">
                      <button className="lore-mini-btn" disabled={busy} onClick={() => doLinkUpdate(l.linkPath)}>Re-pin…</button>
                      <button className="lore-mini-btn" disabled={busy} onClick={() => doLinkRemove(l.linkPath)}>Remove</button>
                    </span>
                  </div>
                ))}
                {!links.length && !showAddLink && <div className="lore-empty">no links</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Layers {layers.length ? `(${layers.length})` : ''}</span>
                  {!showAddLayer && <button className="lore-mini-btn" disabled={busy} onClick={() => setShowAddLayer(true)}>+ Layer</button>}
                </div>
                {showAddLayer && (
                  <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input className="lore-new-branch-input" placeholder="mount path (e.g. overlay)" value={layerForm.path} onChange={(e) => setLayerForm({ ...layerForm, path: e.target.value })} />
                    <input className="lore-new-branch-input" placeholder="repository id or name" value={layerForm.repo} onChange={(e) => setLayerForm({ ...layerForm, repo: e.target.value })} />
                    <input className="lore-new-branch-input" placeholder="source path (default /)" value={layerForm.src} onChange={(e) => setLayerForm({ ...layerForm, src: e.target.value })} />
                    <input className="lore-new-branch-input" placeholder="metadata key for matching (optional)" value={layerForm.meta} onChange={(e) => setLayerForm({ ...layerForm, meta: e.target.value })} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="lore-mini-btn" disabled={busy} onClick={doLayerAdd}>Add</button>
                      <button className="lore-mini-btn" onClick={() => setShowAddLayer(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                {layers.map((l, i) => (
                  <div key={`${l.repository}:${i}`} className="lore-row always-actions" title={`${l.paths} @ ${l.revision.slice(0, 8)}`}>
                    <span className="lore-row-name">{l.paths}</span>
                    <span className="lore-row-actions">
                      <button className="lore-mini-btn" disabled={busy} onClick={() => doLayerRemove(l.paths.split('->').pop()!.trim(), l.repository)}>Remove</button>
                    </span>
                  </div>
                ))}
                {!layers.length && !showAddLayer && <div className="lore-empty">no layers</div>}
              </div>

              <div className="lore-sidebar-section">
                <div className="lore-section-header">
                  <span>Bisect</span>
                  {bisect && <button className="lore-mini-btn" onClick={resetBisect}>Reset</button>}
                </div>
                {!bisect ? (
                  <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Good (last revision <em>without</em> the change):</span>
                    <select className="lore-new-branch-input" value={bisectStart} onChange={(e) => setBisectStart(e.target.value)}>
                      <option value="">select revision…</option>
                      {history.map(h => <option key={`s${h.signature}`} value={`@${h.number}`}>@{h.number} {h.message.split('\n')[0]}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Bad (first revision <em>with</em> the change):</span>
                    <select className="lore-new-branch-input" value={bisectEnd} onChange={(e) => setBisectEnd(e.target.value)}>
                      <option value="">select revision…</option>
                      {history.map(h => <option key={`e${h.signature}`} value={`@${h.number}`}>@{h.number} {h.message.split('\n')[0]}</option>)}
                    </select>
                    <button className="lore-mini-btn" disabled={busy || !bisectStart || !bisectEnd} onClick={startBisect}>Start bisect</button>
                  </div>
                ) : bisect.complete ? (
                  <div style={{ padding: '4px 10px 8px' }}>
                    <div style={{ fontSize: 12 }}>First revision with the change: <strong>{bisect.culprit ?? '?'}</strong></div>
                    <button className="lore-mini-btn" style={{ marginTop: 6 }} onClick={resetBisect}>Done</button>
                  </div>
                ) : (
                  <div style={{ padding: '4px 10px 8px' }}>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>
                      Testing <strong>@{bisect.midpoint?.number ?? '?'}</strong> — the working tree is synced to it.
                      Does this revision contain the change you're hunting?
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="lore-mini-btn" disabled={busy} onClick={() => answerBisect(true)}>Contains it (bad)</button>
                      <button className="lore-mini-btn" disabled={busy} onClick={() => answerBisect(false)}>Clean (good)</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="horizontal-splitter-handle" onMouseDown={onSplitterDown}>
              <div className="horizontal-splitter-line" />
            </div>

            {/* Content: changes + commit | diff + history */}
            <div className="repo-content-viewer" style={{ width: `${100 - leftWidth}%`, display: 'flex', flexDirection: 'column' }}>
              {status.merge?.inProgress && (
                <div className="lore-merge-banner">
                  <span>
                    {{ merge: 'Merging', revert: 'Reverting', 'cherry-pick': 'Cherry-picking' }[status.merge.operation]}
                    {status.merge.incoming ? <> — incoming <code>{status.merge.incoming.slice(0, 8)}</code></> : null}
                  </span>
                  <span>{status.conflicted.length > 0
                    ? `${status.conflicted.length} conflict(s) to resolve`
                    : 'conflicts resolved — Commit to finish'}</span>
                  <span style={{ flex: 1 }} />
                  <button className="lore-mini-btn" disabled={busy} onClick={doMergeAbort}>Abort {status.merge.operation}</button>
                </div>
              )}
              {viewMode === 'graph' ? (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div className="lore-detail-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Revision graph ({graph.length})</span>
                    <span style={{ flex: 1 }} />
                    <button className="lore-mini-btn" onClick={() => setViewMode('changes')}>Close</button>
                  </div>
                  <div style={{ height: 'calc(100% - 30px)' }}>
                    <LoreRevisionGraph
                      revisions={graph}
                      localHead={status.local.signature}
                      remoteHead={status.remote.signature}
                      selectedSignature={revDetail?.revision.signature}
                      onSelect={(rev) => { onSelectRevision(rev); }}
                      onContextMenu={(e, rev) => onRevisionMenu(e, rev, rev.signature === status.local.signature)}
                    />
                  </div>
                </div>
              ) : viewMode === 'files' ? (
                <div className="lore-content-cols" style={{ flex: 1, minHeight: 0 }}
                  onMouseMove={onContentMouseMove} onMouseUp={onContentMouseUp} onMouseLeave={onContentMouseUp}>
                  <div className="lore-changes-col" style={{ width: `${contentLeftWidth}%`, flexShrink: 0 }}>
                    <div className="lore-changes-group-header"><span>Repository tree</span></div>
                    <div className="lore-changes-scroll">
                      <LoreRepositoryTree
                        nodes={treeNodes}
                        lockOwners={lockOwners}
                        statusByPath={statusByPath}
                        unfetchedPaths={unfetchedPaths}
                        selectedPath={treeFile?.path ?? null}
                        onSelect={onSelectTreeFile}
                        loadedDirs={loadedDirs}
                        onExpand={loadDir}
                        onContextMenu={onFileTreeContextMenu}
                        busy={busy}
                      />
                    </div>
                  </div>
                  <div className="horizontal-splitter-handle" onMouseDown={onContentSplitterDown}>
                    <div className="horizontal-splitter-line" />
                  </div>
                  <div className="lore-detail-col">
                    <div className="lore-detail-header">{treeFile ? treeFile.path : 'File'}</div>
                    {treeFile && fileInfo && (
                      <div className="lore-file-meta">
                        size <code>{fileInfo.size}</code> · status <code>{fileInfo.status || '-'}</code>
                        {fileInfo.hash && <> · hash <code>{fileInfo.hash.slice(0, 12)}</code></>}
                        {lockOwners.has(treeFile.path) && <> · 🔒 <code>{lockOwners.get(treeFile.path)}</code></>}
                      </div>
                    )}
                    <div className="lore-diff-area">
                      {!treeFile ? <div className="lore-empty">Select a file to see its content and history.</div>
                        : diffLoading ? <div className="lore-empty">Loading…</div>
                        : historyDiff && mediaKind ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 4 }}>
                              <button className="lore-mini-btn" onClick={() => setHistoryDiff(false)}>← file</button>
                            </div>
                            <LoreMediaView kind={mediaKind} name={treeFile.name} newUrl={mediaNewUrl} oldUrl={mediaOldUrl} loadingOld={mediaLoadingOld} />
                          </>
                        ) : historyDiff ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 4 }}>
                              <button className="lore-mini-btn" onClick={() => setHistoryDiff(false)}>← file</button>
                            </div>
                            <LoreDiffView diff={diffText} />
                          </>
                        ) : mediaKind ? (
                          <LoreMediaView kind={mediaKind} name={treeFile.name} newUrl={mediaNewUrl} />
                        ) : fileBinary ? (
                          <div style={{ padding: 16 }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>Binary asset</div>
                            <div className="lore-file-meta" style={{ padding: 0, lineHeight: 1.8 }}>
                              <div>name: <code>{treeFile.name}</code></div>
                              <div>size: <code>{formatBytes(fileInfo?.size ?? treeFile.size)}</code></div>
                              {fileInfo?.type && <div>type: <code>{fileInfo.type}</code></div>}
                              {fileInfo?.hash && <div>hash: <code>{fileInfo.hash.slice(0, 16)}</code></div>}
                              <div>revisions: <code>{fileHist.length}</code>{fileHist[0] && <> · latest: <code>{fileHist[0].message}</code></>}</div>
                              {lockOwners.has(treeFile.path) && <div>🔒 locked by <code>{lockOwners.get(treeFile.path)}</code></div>}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 10 }}>
                              Content-defined chunking — no text diff. Use the history below to see when it changed.
                            </div>
                          </div>
                        ) : (
                          <pre className="lore-file-content">{fileContent ?? ''}</pre>
                        )}
                    </div>
                    <div className="lore-history-area">
                      <div className="lore-detail-header">File history{treeFile ? `: ${treeFile.name}` : ''}</div>
                      {fileHist.length ? fileHist.map((h, i) => (
                        <div key={`${h.signature}:${i}`} className="lore-history-row lore-row" onClick={() => onSelectFileHistory(i)} title="Diff this revision of the file">
                          <span className="lore-code" style={{ color: changeColor(h.change) }}>{h.change}</span>
                          <span className="lore-history-num">{h.number}</span>
                          <span className="lore-row-name">{h.message}</span>
                        </div>
                      )) : <div className="lore-empty">{treeFile ? 'no history' : 'select a file'}</div>}
                    </div>
                  </div>
                </div>
              ) : (
              <div className="lore-content-cols" style={{ flex: 1, minHeight: 0 }}
                onMouseMove={onContentMouseMove} onMouseUp={onContentMouseUp} onMouseLeave={onContentMouseUp}>
                <div className="lore-changes-col" style={{ width: `${contentLeftWidth}%`, flexShrink: 0 }}>
                  <div className="lore-changes-scroll">
                    {status.conflicted.length > 0 && (
                      <>
                        <div className="lore-changes-group-header conflict"><span>Conflicts ({status.conflicted.length})</span></div>
                        {status.conflicted.map(f => (
                          <div
                            key={`conflict:${f.path}`}
                            className={`lore-row ${selectedPath === f.path ? 'selected' : ''}`}
                            onClick={() => onSelectFile(f)}
                          >
                            <span className="lore-code" style={{ color: 'var(--danger-color)' }}>!</span>
                            <span className="lore-row-name" title={f.path}>{f.path}</span>
                            <span className="lore-row-actions">
                              <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); setResolvingPath(f.path); }} title="Open the 3-way resolver">Resolve…</button>
                              <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); doResolve(f.path, 'mine'); }} title="Resolve using my changes">Mine</button>
                              <button className="lore-mini-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); doResolve(f.path, 'theirs'); }} title="Resolve using their changes">Theirs</button>
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="lore-changes-group-header">
                      <span>Changes not staged</span>
                      <button className="lore-mini-btn" onClick={stageAll} disabled={busy || !status.unstaged.length}>Stage all</button>
                    </div>
                    <LoreChangeTree
                      changes={status.unstaged} busy={busy}
                      selection={selection} onRowClick={onRowClick}
                      onRowContextMenu={(e, path, isDir) => onChangeContextMenu(e, path, isDir, false)}
                      lockedPaths={lockedPaths}
                    />

                    <div className="lore-changes-group-header"><span>Staged for commit</span></div>
                    <LoreChangeTree
                      changes={status.staged} busy={busy}
                      selection={selection} onRowClick={onRowClick}
                      onRowContextMenu={(e, path, isDir) => onChangeContextMenu(e, path, isDir, true)}
                      lockedPaths={lockedPaths}
                    />
                  </div>
                  <div className="lore-commit-box">
                    <textarea
                      className="lore-commit-input"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message"
                    />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className="lore-primary-btn"
                        onClick={doCommit}
                        disabled={busy || !status.staged.length || (!commitMessage.trim() && !status.merge?.inProgress)}
                      >
                        {status.merge?.inProgress ? 'Complete merge' : 'Commit'} {status.staged.length ? `(${status.staged.length})` : ''}
                      </button>
                      <button className="lore-mini-btn" disabled={busy || !status.staged.length}
                        title="Edit key/value metadata on the staged revision" onClick={openStagedRevisionMetadata}>
                        Metadata…
                      </button>
                    </div>
                  </div>
                </div>

                <div className="horizontal-splitter-handle" onMouseDown={onContentSplitterDown}>
                  <div className="horizontal-splitter-line" />
                </div>

                <div className="lore-detail-col">
                  <div className="lore-detail-header">
                    {selectedStash ? `Stash: ${selectedStash.message}`
                      : selectedPath ? `Diff: ${selectedPath}`
                      : branchDiff ? `Branch diff: ${branchDiff.source} → ${branchDiff.target}`
                      : revDetail ? `Revision ${revDetail.revision.number}`
                      : 'Diff'}
                    {selectedPath && (revDetail || branchDiff) && (
                      <button className="lore-mini-btn" style={{ marginLeft: 8 }} onClick={() => setSelectedPath(null)}>← back</button>
                    )}
                    {branchDiff && !selectedPath && (
                      <button className="lore-mini-btn" style={{ marginLeft: 8 }} onClick={() => setBranchDiff(null)}>Close</button>
                    )}
                  </div>
                  <div className="lore-diff-area">
                    {selectedStash ? (
                      stashFile ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{stashFile.file.path}</span>
                            <button className="lore-mini-btn" onClick={() => setStashFile(null)}>← files</button>
                          </div>
                          {stashFile.kind === 'image' || stashFile.kind === 'audio'
                            ? <LoreMediaView kind={stashFile.kind} name={stashFile.file.path} newUrl={stashFile.url ?? null} />
                            : stashFile.kind === 'binary'
                              ? <div className="lore-empty">Binary file — no preview.</div>
                              : <pre className="lore-file-content">{stashFile.content ?? ''}</pre>}
                        </>
                      ) : (
                        <div style={{ padding: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedStash.message}</div>
                          {selectedStash.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: '4px 0' }}>{selectedStash.description}</div>}
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>on {selectedStash.branch} · {new Date(selectedStash.date).toLocaleString()}</div>
                          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
                            <button className="lore-mini-btn" disabled={busy} onClick={() => openApplyStash(selectedStash)}>Apply…</button>
                            <button className="lore-mini-btn" disabled={busy} onClick={() => deleteStash(selectedStash)}>Delete…</button>
                          </div>
                          <div className="lore-changes-group-header"><span>Files ({selectedStash.files.length})</span></div>
                          {selectedStash.files.map(f => (
                            <div key={f.path} className={`lore-row ${stashFile?.file.path === f.path ? 'selected' : ''}`} onClick={() => onSelectStashFile(selectedStash, f)} title={f.path}>
                              <span className="lore-code" style={{ color: changeColor(f.change) }}>{f.change}</span>
                              <span className="lore-row-name">{f.path}</span>
                              {f.staged && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>staged</span>}
                            </div>
                          ))}
                        </div>
                      )
                    ) : selectedPath && mediaKind ? (
                      <LoreMediaView kind={mediaKind} name={selectedPath.split('/').pop() || selectedPath} newUrl={mediaNewUrl} oldUrl={mediaOldUrl} loadingOld={mediaLoadingOld} />
                    ) : selectedPath ? (
                      diffLoading ? <div className="lore-empty">Loading diff…</div> : <LoreDiffView diff={diffText} />
                    ) : branchDiff ? (
                      <div style={{ padding: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                          Changes on <strong>{branchDiff.source}</strong> not in <strong>{branchDiff.target}</strong> (since their common ancestor).
                        </div>
                        <div className="lore-changes-group-header"><span>Changed files ({branchDiff.files.length})</span></div>
                        {branchDiff.files.length ? branchDiff.files.map(f => (
                          <div key={f.path} className="lore-row" onClick={() => onSelectBranchDiffFile(f.path)} title={f.path}>
                            <span className="lore-code" style={{ color: changeColor(f.code) }}>{f.code}</span>
                            <span className="lore-row-name">{f.path}</span>
                          </div>
                        )) : <div className="lore-empty">no differences</div>}
                      </div>
                    ) : revDetail ? (
                      <div style={{ padding: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                          <div>{revDetail.revision.message}</div>
                          <div style={{ fontFamily: 'monospace' }}>sig {revDetail.revision.signature.slice(0, 12)}</div>
                          {revDetail.revision.parent && <div style={{ fontFamily: 'monospace' }}>parent {revDetail.revision.parent.slice(0, 12)}</div>}
                          <div>{revDetail.revision.date}</div>
                        </div>
                        <div className="lore-changes-group-header"><span>Changed files ({revDetail.files.length})</span></div>
                        {revDetail.files.length ? revDetail.files.map(f => (
                          <div key={f.path} className="lore-row" onClick={() => onSelectRevFile(f.path)}>
                            <span className="lore-code" style={{ color: changeColor(f.code) }}>{f.code}</span>
                            <span className="lore-row-name" title={f.path}>{f.path}</span>
                          </div>
                        )) : <div className="lore-empty">no file changes</div>}
                      </div>
                    ) : (
                      <div className="lore-empty">Select a file to view its diff, or a revision below.</div>
                    )}
                  </div>
                  <div className="lore-history-area">
                    <div className="lore-detail-header">History</div>
                    {history.length ? history.map((h, idx) => (
                      <div
                        key={h.signature}
                        className={`lore-history-row lore-row ${revDetail?.revision.signature === h.signature ? 'selected' : ''}`}
                        onClick={() => onSelectRevision(h)}
                        onContextMenu={(e) => onRevisionMenu(e, h, idx === 0)}
                        title="Show revision detail"
                      >
                        <span className="lore-history-num">{h.number}</span>
                        <span className="lore-row-name">{h.message}</span>
                        <button className="lore-row-menu" disabled={busy} title="Revision actions"
                          onClick={(e) => { e.stopPropagation(); onRevisionMenu(e, h, idx === 0); }}>⋯</button>
                      </div>
                    )) : <div className="lore-empty">no revisions</div>}
                  </div>
                </div>
              </div>
              )}
            </div>
          </>
        )}
      </div>

      {menu && <LoreContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {stashDialog && (
        <LoreStashDialog
          fileCount={stashDialog.files.length}
          selectedOnly={stashDialog.selectedOnly}
          onClose={() => setStashDialog(null)}
          onCreate={createStash}
        />
      )}

      {applyStashTarget && (
        <LoreApplyStashDialog
          stash={applyStashTarget}
          onClose={() => setApplyStashTarget(null)}
          onApply={async (pop) => { await applyStash(applyStashTarget.id, pop); if (pop) { setSelectedStash(null); setStashFile(null); } }}
        />
      )}

      {metaEditor && (
        <MetadataDialog
          title={metaEditor.title}
          subtitle={metaEditor.subtitle}
          entries={metaEditor.entries}
          readOnlyEntries={metaEditor.readOnlyEntries}
          readOnly={metaEditor.readOnly}
          onClose={() => setMetaEditor(null)}
          onSave={metaEditor.onSave}
        />
      )}

      {depsPath && client && (
        <DependenciesDialog
          client={client}
          path={depsPath}
          onClose={() => setDepsPath(null)}
          onError={(message) => showAlert(message, 'Lore dependency error')}
        />
      )}

      {resolvingPath && client && (
        <LoreMergeResolver
          client={client}
          path={resolvingPath}
          operation={status?.merge?.operation ?? 'merge'}
          onClose={() => setResolvingPath(null)}
          onResolved={() => { setResolvingPath(null); refresh(); }}
        />
      )}
    </div>
  );
}

export default LoreRepositoryView;
