import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { showInExplorer, openInEditor, openInConsole } from '../utils/osActions';
import { clipboard } from 'electron';
import { LoreTreeNode, LoreFileInfo, LoreFileHistoryEntry, LoreStash, LoreStashFile, StashInput } from '../lore';
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
  const [layerForm, setLayerForm] = useState({ path: '', repo: '', src: '/' });
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
  const [leftWidth, setLeftWidth] = useState<number>(28);
  const draggingSplitter = useRef(false);

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

  // Sidebar splitter drag.
  const onSplitterDown = () => { draggingSplitter.current = true; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingSplitter.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftWidth(Math.min(60, Math.max(15, pct)));
  };
  const onMouseUp = () => { draggingSplitter.current = false; };

  const runAction = useCallback(async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'Lore error');
    } finally {
      setWorking(false);
    }
  }, [refresh, showAlert]);

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
      items.push({ label: 'Lock', onClick: () => runAction(async () => { await client!.lockAcquire(targets); }) });
      items.push({ label: 'Unlock', onClick: () => runAction(async () => { await client!.lockRelease(targets); }) });
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
      items.push({ label: 'Ignore folder', onClick: () => doIgnore(path, true) });
    } else {
      items.push({ label: 'Lock', onClick: () => runAction(async () => { await client!.lockAcquire([path]); }) });
      items.push({ label: 'Unlock', onClick: () => runAction(async () => { await client!.lockRelease([path]); }) });
      items.push({ label: 'Ignore file', onClick: () => doIgnore(path, false) });
      if (ext) items.push({ label: `Ignore *.${ext}`, onClick: () => runAction(async () => { client!.addToIgnore(`*.${ext}`); }) });
      items.push({ label: 'Ignore custom pattern…', onClick: () => { const p = window.prompt('Ignore pattern (.loreignore):'); if (p && p.trim()) runAction(async () => { client!.addToIgnore(p.trim()); }); } });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, [client]);

  const doGc = () => runAction(async () => { await client!.gc(); showAlert('Garbage collection complete.', 'Repository GC'); });
  const doInstances = async () => { const out = await client!.instances(); showAlert(out.trim() || 'No registered instances.', 'Instances'); };
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
      { label: 'Run Garbage Collection', onClick: doGc },
      { label: 'List Instances…', onClick: doInstances },
      { label: 'Clean Working Directory…', onClick: doClean },
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
  const onBranchMenu = (e: React.MouseEvent, branch: string) => {
    e.preventDefault();
    const isCurrent = branch === status?.branch;
    const items: LoreMenuItem[] = [];
    if (!isCurrent) items.push(
      { label: 'Switch to Branch', onClick: () => doSwitchBranch(branch) },
      { label: `Merge into ${status?.branch}`, onClick: () => doMerge(branch) },
    );
    items.push({ label: 'Push', onClick: () => runAction(async () => { await client!.push(branch); }) });
    items.push({ separator: true });
    items.push({ label: 'Protect', onClick: () => runAction(async () => { await client!.branchProtect(branch); }) });
    items.push({ label: 'Unprotect', onClick: () => runAction(async () => { await client!.branchUnprotect(branch); }) });
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
    items.push({ separator: true });
    items.push({ label: 'Copy Signature', onClick: () => clipboard.writeText(rev.signature) });
    items.push({ label: 'Copy Info', onClick: () => clipboard.writeText(`revision ${rev.number}\n${rev.signature}\n${rev.message}`) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onSelectRevision = useCallback(async (rev: { signature: string }) => {
    setSelectedPath(null);
    setSelectedStash(null);
    setRevDetail(null);
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
      const media = mediaMime(node.path);
      if (media) {
        setMediaKind(media.kind);
        const b64 = client!.readWorkingFileBase64(node.path);
        setMediaNewUrl(b64 ? `data:${media.mime};base64,${b64}` : null);
      } else if (client!.isProbablyBinary(node.path)) {
        setFileBinary(true);
      } else {
        try { setFileContent(client!.readWorkingFile(node.path)); } catch { setFileContent(''); }
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
  }, [client]);

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
  });

  const doLock = (path: string) => runAction(async () => { await client!.lockAcquire([path]); });
  const doUnlock = (path: string) => runAction(async () => { await client!.lockRelease([path]); });

  const doLinkAdd = () => runAction(async () => {
    if (!linkForm.path.trim() || !linkForm.url.trim()) throw new Error('Link mount path and repository URL are required');
    await client!.linkAdd(linkForm.path.trim(), linkForm.url.trim(), linkForm.src.trim() || '/');
    setLinkForm({ path: '', url: '', src: '/' }); setShowAddLink(false);
  });
  const doLinkRemove = (linkPath: string) => runAction(async () => { await client!.linkRemove(linkPath); });
  const doLayerAdd = () => runAction(async () => {
    if (!layerForm.path.trim() || !layerForm.repo.trim()) throw new Error('Layer mount path and repository are required');
    await client!.layerAdd(layerForm.path.trim(), layerForm.repo.trim(), layerForm.src.trim() || '/');
    setLayerForm({ path: '', repo: '', src: '/' }); setShowAddLayer(false);
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
          <button className="lore-mini-btn" onClick={refresh}>Retry</button>
        </div>
      </div>
    );
  }

  const lastCommand = commandState.length > 0 ? commandState[commandState.length - 1].command : '';

  return (
    <div className="repository-view">
      {/* Toolbar (reuses git toolbar styling) */}
      <div className="toolbar">
        <button className="toolbar-button" onClick={refresh} disabled={busy}>
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
        <button className="toolbar-button" onClick={() => setShowNewBranch(true)} disabled={busy}>
          <span className="toolbar-button-icon">🌿</span>
          <span className="toolbar-button-label">Branch</span>
        </button>
        <button className="toolbar-button" onClick={doStashAll} disabled={busy} title="Stash all changes">
          <span className="toolbar-button-icon">📦</span>
          <span className="toolbar-button-label">Stash</span>
        </button>
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
        <button className="toolbar-button" onClick={onRepoMenu} title="Repository actions">
          <span className="toolbar-button-label">⋯</span>
        </button>
      </div>

      <div className="repo-content-horizontal" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        {isLoading && !status && <div className="loading">Loading Lore repository...</div>}

        {status && (
          <>
            {/* Sidebar: repo info + branches + locks */}
            <div className="repo-sidebar" style={{ width: `${leftWidth}%` }}>
              <div className="lore-info-card">
                <div className="lore-info-row">
                  <span className="lore-info-label">Lore branch</span>
                  <span className="lore-info-value">{status.branch}</span>
                </div>
                <div className="lore-info-row">
                  <span className="lore-info-label">revision</span>
                  <span className="lore-info-value">{status.local.number}</span>
                </div>
                <div className="lore-info-row">
                  <span className="lore-info-label">remote</span>
                  <span className={`lore-badge ${status.syncState}`}>{status.syncState}</span>
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
                <div className="lore-content-cols" style={{ flex: 1, minHeight: 0 }}>
                  <div className="lore-changes-col" style={{ width: '50%' }}>
                    <div className="lore-changes-group-header"><span>Repository tree</span></div>
                    <div className="lore-changes-scroll">
                      <LoreRepositoryTree
                        nodes={treeNodes}
                        lockOwners={lockOwners}
                        statusByPath={statusByPath}
                        selectedPath={treeFile?.path ?? null}
                        onSelect={onSelectTreeFile}
                        loadedDirs={loadedDirs}
                        onExpand={loadDir}
                        onContextMenu={onFileTreeContextMenu}
                        busy={busy}
                      />
                    </div>
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
              <div className="lore-content-cols" style={{ flex: 1, minHeight: 0 }}>
                <div className="lore-changes-col">
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
                    <button
                      className="lore-primary-btn"
                      onClick={doCommit}
                      disabled={busy || !status.staged.length || (!commitMessage.trim() && !status.merge?.inProgress)}
                    >
                      {status.merge?.inProgress ? 'Complete merge' : 'Commit'} {status.staged.length ? `(${status.staged.length})` : ''}
                    </button>
                  </div>
                </div>

                <div className="lore-detail-col">
                  <div className="lore-detail-header">
                    {selectedStash ? `Stash: ${selectedStash.message}`
                      : selectedPath ? `Diff: ${selectedPath}`
                      : revDetail ? `Revision ${revDetail.revision.number}`
                      : 'Diff'}
                    {selectedPath && revDetail && (
                      <button className="lore-mini-btn" style={{ marginLeft: 8 }} onClick={() => setSelectedPath(null)}>← revision</button>
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
