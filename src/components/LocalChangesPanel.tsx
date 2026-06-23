import React, { useState, useRef } from 'react';
import FileList from './FileList';
import DiffViewer from './DiffViewer';
import StashDialog from './StashDialog';
import PullCommitDialog from './PullCommitDialog';
import StashConflictDialog from './StashConflictDialog';
import LfsWarningDialog, { LargeFile } from './LfsWarningDialog';
import { GitAdapter } from '../git/GitAdapter';
import { FileInfo } from './types';
import { useAlert } from '../contexts/AlertContext';
import { useSettings } from '../contexts/SettingsContext';
import { isBranchLocked } from '../utils/settings';
import { matchesAnyLfsPattern, suggestLfsPattern } from '../utils/lfs';
import { ipcRenderer } from 'electron';
import path from 'path';
import './LocalChangesPanel.css';


interface LocalChangesPanelProps {
  unstagedFiles: Array<FileInfo>;
  stagedFiles: Array<FileInfo>;
  gitAdapter: GitAdapter;
  onRefresh: () => Promise<void>;
  onBranchStatusRefresh?: () => Promise<void>;
  currentBranch?: string;
  branchStatus?: Record<string, any>;
  onError?: (error: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onBusyMessageChange?: (message: string) => void;
  onCommitCreated?: () => void;
  onStashCreated?: () => Promise<void>;
}

function LocalChangesPanel({ unstagedFiles, stagedFiles, gitAdapter, onRefresh, onBranchStatusRefresh, currentBranch, branchStatus, onError, onBusyChange, onBusyMessageChange, onCommitCreated, onStashCreated }: LocalChangesPanelProps) {
  const { showAlert, showConfirm } = useAlert();
  const { getSetting } = useSettings();
  const [fileListsHeight, setFileListsHeight] = useState<number>(50);
  const [leftWidth, setLeftWidth] = useState<number>(50);
  const [selectedFile, setSelectedFile] = useState(null);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [commitDescription, setCommitDescription] = useState<string>('');
  const [showDescriptionEditor, setShowDescriptionEditor] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [showStashDialog, setShowStashDialog] = useState<boolean>(false);
  const [showPullCommitDialog, setShowPullCommitDialog] = useState<boolean>(false);
  const [showStashConflictDialog, setShowStashConflictDialog] = useState<boolean>(false);
  const [showLfsWarningDialog, setShowLfsWarningDialog] = useState<boolean>(false);
  const [lfsWarningFiles, setLfsWarningFiles] = useState<Array<LargeFile>>([]);
  const [pendingStashFiles, setPendingStashFiles] = useState<Array<string>>([]);
  const [lfsPatterns, setLfsPatterns] = useState<Array<string>>([]);
  const activeSplitter = useRef<string | null>(null);

  // Keep the set of LFS track patterns fresh so file rows can be badged and the
  // commit gate can tell what's already covered. Re-reading .gitattributes when
  // the file lists change is cheap (a single small file read).
  React.useEffect(() => {
    let cancelled = false;
    gitAdapter.getLfsTrackPatterns()
      .then(p => { if (!cancelled) setLfsPatterns(p); })
      .catch(() => { if (!cancelled) setLfsPatterns([]); });
    return () => { cancelled = true; };
  }, [gitAdapter, unstagedFiles, stagedFiles]);

  // Notify parent component when busy state changes
  React.useEffect(() => {
    if (onBusyChange) {
      onBusyChange(isBusy);
    }
  }, [isBusy, onBusyChange]);

  const handleMouseDown = (splitterType: string) => {
    activeSplitter.current = splitterType;
  };

  const handleMouseUp = () => {
    activeSplitter.current = null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeSplitter.current === null)
      return;

    const container = e.currentTarget;

    if (activeSplitter.current === 'vertical') {
      // Vertical splitter within file lists - between unstaged and staged
      const topSectionRect = container.querySelector('.local-changes-top-section').getBoundingClientRect();
      const relativeY = ((e.clientY - topSectionRect.top) / topSectionRect.height) * 100;
      if (relativeY >= 20 && relativeY <= 80) {
        setFileListsHeight(relativeY);
      }
    } else if (activeSplitter.current === 'horizontal-top') {
      // Horizontal splitter in top section - between file lists and diff viewer
      const topSectionRect = container.querySelector('.local-changes-top-section').getBoundingClientRect();
      const relativeX = ((e.clientX - topSectionRect.left) / topSectionRect.width) * 100;
      if (relativeX >= 30 && relativeX <= 70) {
        setLeftWidth(relativeX);
      }
      }
  };

  const handleFileDrop = async (item: any, sourceList: string, targetList: string) => {
    if (isBusy) {
      console.log('Operation in progress, please wait...');
      return;
    }

    // Clean up any lingering drag state
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));

    try {
      setIsBusy(true);
      const git = gitAdapter;

      // Collect all files that need to be processed
      const allFilePaths = [];

      if (item.type === 'multiple-files') {
        // Handle multiple files drop
        allFilePaths.push(...item.files.map(f => f.path));
        console.log(`${sourceList === 'unstaged' ? 'Staging' : 'Unstaging'} ${item.files.length} files`);
      } else if (item.type === 'multiple-items') {
        // Handle multiple items (files and folders) drop
        item.items.forEach(itemData => {
          if (itemData.type === 'file') {
            allFilePaths.push(itemData.file.path);
          } else if (itemData.type === 'folder') {
            allFilePaths.push(...itemData.files.map(f => f.path));
          }
        });
        console.log(`${sourceList === 'unstaged' ? 'Staging' : 'Unstaging'} ${item.items.length} items`);
      } else if (item.type === 'folder') {
        // Handle folder drop - collect all files in folder
        allFilePaths.push(...item.files.map(f => f.path));
        console.log(`${sourceList === 'unstaged' ? 'Staging' : 'Unstaging'} ${item.files.length} files in folder: ${item.folderPath}`);
      } else {
        // Handle single file drop
        allFilePaths.push(item.path);
        console.log(`${sourceList === 'unstaged' ? 'Staging' : 'Unstaging'} file: ${item.path}`);
      }

      // Set appropriate busy message
      if (sourceList === 'unstaged' && targetList === 'staged') {
        if (onBusyMessageChange) onBusyMessageChange(`git add ${allFilePaths.length > 1 ? `(${allFilePaths.length} files)` : allFilePaths[0]}`);
      } else if (sourceList === 'staged' && targetList === 'unstaged') {
        if (onBusyMessageChange) onBusyMessageChange(`git reset ${allFilePaths.length > 1 ? `(${allFilePaths.length} files)` : allFilePaths[0]}`);
      }

      // Process all files at once using consolidated add/reset methods
      if (sourceList === 'unstaged' && targetList === 'staged') {
        await git.add(allFilePaths);
      } else if (sourceList === 'staged' && targetList === 'unstaged') {
        await git.reset(allFilePaths);
      }

      console.log(`${sourceList === 'unstaged' ? 'Staged' : 'Unstaged'} ${allFilePaths.length} files`);

      // Refresh the file lists
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error staging/unstaging:', error);
    } finally {
      setIsBusy(false);
      if (onBusyMessageChange) onBusyMessageChange('');
    }
  };

  const handleSelectFile = (file: FileInfo, listType: string) => {
    setSelectedFile({ file, listType });
  };

  // Find staged files at/above the configured size that aren't already tracked
  // by Git LFS. Returns an empty list when the feature is disabled or on error,
  // so the commit is never blocked by a failed size check.
  const findUntrackedLargeFiles = async (): Promise<Array<LargeFile>> => {
    if (!getSetting('lfsWarnEnabled'))
      return [];
    const paths = stagedFiles.map(f => f.path);
    if (paths.length === 0)
      return [];

    const thresholdMB = getSetting('lfsWarnThresholdMB') || 100;
    const thresholdBytes = thresholdMB * 1024 * 1024;
    try {
      const [sizes, patterns] = await Promise.all([
        gitAdapter.getFileSizes(paths),
        gitAdapter.getLfsTrackPatterns()
      ]);
      return stagedFiles
        .filter(f => (sizes[f.path] || 0) >= thresholdBytes && !matchesAnyLfsPattern(f.path, patterns))
        .map(f => ({ path: f.path, size: sizes[f.path] || 0, suggestedPattern: suggestLfsPattern(f.path) }));
    } catch (err) {
      console.warn('LFS large-file check failed, allowing commit:', err);
      return [];
    }
  };

  // Translate a raw LFS command failure into actionable guidance.
  const describeLfsError = (error: any): string => {
    const msg = error?.message || String(error);
    if (/not a git command|lfs[^a-z].*not found|command not found|is not recognized/i.test(msg)) {
      return 'Git LFS does not appear to be installed on your system. Install it from https://git-lfs.com and try again.';
    }
    return `Failed to set up Git LFS: ${msg}`;
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0 || isBusy) {
      return;
    }

    // Reject commits on locked branches before doing any remote work.
    const lockedPatterns = getSetting('lockedBranchPatterns') || [];
    if (currentBranch && isBranchLocked(currentBranch, lockedPatterns)) {
      if (onError) {
        onError(`The current branch '${currentBranch}' matches a Locked Branch Pattern (from Preferences). You probably forgot to make a branch before doing the Commit.`);
      }
      return;
    }

    // Warn about large, un-tracked files before touching the remote, so the
    // user can move them into LFS before they ever land in a commit.
    const largeFiles = await findUntrackedLargeFiles();
    if (largeFiles.length > 0) {
      setLfsWarningFiles(largeFiles);
      setShowLfsWarningDialog(true);
      return;
    }

    await proceedWithRemoteCheck();
  };

  // Re-stage the flagged files into LFS, then continue the commit.
  const handleLfsTrackAndCommit = async () => {
    setShowLfsWarningDialog(false);
    const files = lfsWarningFiles;
    try {
      setIsBusy(true);
      const git = gitAdapter;

      // Ensure LFS is set up in this repo (idempotent if already installed).
      const initialized = await git.isLfsInitialized();
      if (!initialized) {
        if (onBusyMessageChange) onBusyMessageChange('git lfs install');
        await git.lfsInstall();
      }

      const patterns = Array.from(new Set(files.map(f => f.suggestedPattern)));
      for (const pattern of patterns) {
        if (onBusyMessageChange) onBusyMessageChange(`git lfs track "${pattern}"`);
        await git.lfsTrack(pattern);
      }

      // Re-stage the files plus .gitattributes so the LFS pointers (not the raw
      // blobs) are what gets committed.
      if (onBusyMessageChange) onBusyMessageChange('git add (LFS)');
      await git.add(['.gitattributes', ...files.map(f => f.path)]);
      if (onRefresh) await onRefresh();
    } catch (error: any) {
      console.error('Error setting up Git LFS:', error);
      if (onError) onError(describeLfsError(error));
      return;
    } finally {
      setIsBusy(false);
      if (onBusyMessageChange) onBusyMessageChange('');
    }

    await proceedWithRemoteCheck();
  };

  const handleLfsCommitAnyway = async () => {
    setShowLfsWarningDialog(false);
    await proceedWithRemoteCheck();
  };

  const proceedWithRemoteCheck = async () => {
    // Actively check the remote for new commits before committing, so we don't
    // create a divergent history that requires a merge. We fetch first because
    // the cached branchStatus may be stale.
    let needsPull = false;
    if (currentBranch) {
      try {
        setIsBusy(true);
        if (onBusyMessageChange) onBusyMessageChange('git fetch origin');
        await gitAdapter.fetch('origin');
        const { behind } = await gitAdapter.getAheadBehind(currentBranch, `origin/${currentBranch}`);
        needsPull = behind > 0;
        if (onBranchStatusRefresh) {
          await onBranchStatusRefresh();
        }
      } catch (err) {
        // No remote, offline, or no upstream tracking — fall back to cached status.
        console.warn('Pre-commit fetch failed, using cached branch status:', err);
        if (branchStatus && branchStatus[currentBranch]) {
          const status = branchStatus[currentBranch];
          needsPull = !!(status.behind && status.behind > 0);
        }
      } finally {
        setIsBusy(false);
        if (onBusyMessageChange) onBusyMessageChange('');
      }
    }

    if (needsPull) {
      setShowPullCommitDialog(true);
      return;
    }

    // If no pull needed, proceed with commit directly
    await performCommit();
  };

  const performCommit = async (doPullFirst = false) => {
    try {
      setIsBusy(true);
      const git = gitAdapter;

      // Pull first if requested
      if (doPullFirst && currentBranch) {
        // Stash local changes before pulling
        if (onBusyMessageChange) onBusyMessageChange(`git stash push`);
        console.log('Stashing local changes before pull...');
        const stashMessage = `Auto-stash before pull at ${new Date().toISOString()}`;
        await git.stashPush(stashMessage);
        console.log('Stashed local changes successfully');

        try {
          if (onBusyMessageChange) onBusyMessageChange(`git pull origin ${currentBranch}`);
          console.log(`Pulling latest changes from origin/${currentBranch}...`);
          await git.pull('origin', currentBranch);
          console.log('Pull completed successfully');

          // Try to apply the stash
          try {
            if (onBusyMessageChange) onBusyMessageChange(`git stash apply`);
            console.log('Applying stashed changes...');
            await git.stashApply();
            console.log('Stash applied successfully');

            // If apply succeeded, pop the stash to remove it
            try {
              await git.stashPop();
              console.log('Stash removed successfully after successful apply');
            } catch (popError) {
              console.warn('Failed to remove stash after successful apply:', popError);
              // Continue with commit since stash was applied
            }
          } catch (stashError) {
            console.error('Conflicts detected when applying stash:', stashError);

            // Show conflict dialog
            setShowStashConflictDialog(true);
            return;
          }
        } catch (pullError) {
          console.error('Pull failed, attempting to restore stash:', pullError);

          // Pull failed, try to restore stash
          try {
            await git.stashPop();
            console.log('Restored stashed changes after failed pull');
          } catch (restoreError) {
            console.error('Failed to restore stash after failed pull:', restoreError);
            // Just log the error, don't prevent the user from trying again
          }

          setIsBusy(false);
          if (onBusyMessageChange) onBusyMessageChange('');
          throw pullError;
        }

        // Refresh file status after pull (and possible stash apply)
        if (onRefresh) {
          await onRefresh();
        }
      }

      // Construct commit message with optional description
      const fullMessage = commitDescription.trim()
        ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
        : commitMessage.trim();

      if (onBusyMessageChange) onBusyMessageChange(`git commit -m "${commitMessage.trim()}"`);
      await git.commit(fullMessage);
      console.log('Commit successful');

      // Notify parent that a commit was created (clears branch cache)
      if (onCommitCreated) {
        onCommitCreated();
      }

      // Clear the commit fields
      setCommitMessage('');
      setCommitDescription('');

      // Refresh of the file lists
      if (onRefresh) {
        await onRefresh();
      }

      // Refresh branch status to update push button count
      if (onBranchStatusRefresh) {
        await onBranchStatusRefresh();
      }
    } catch (error) {
      console.error('Error committing:', error);
    } finally {
      setIsBusy(false);
      if (onBusyMessageChange) onBusyMessageChange('');
    }
  };

  const handlePullAndCommit = async () => {
    setShowPullCommitDialog(false);
    await performCommit(true);
  };

  const handleCommitOnly = async () => {
    setShowPullCommitDialog(false);
    await performCommit(false);
  };

  const handleStash = async (message: string, stageNewFiles: boolean, keepChanges: boolean) => {
    setShowStashDialog(false);

    if (pendingStashFiles.length === 0)
      return;

    try {
      const git = gitAdapter;

      // If stageNewFiles is checked, stage new files first (optional for context menu stashing)
      if (stageNewFiles) {
        const statusPromises = pendingStashFiles.map(async (filePath) => {
          try {
            const status = await git.status(filePath);
            return { filePath, isNew: status[0]?.status === 'created' };
          } catch {
            return { filePath, isNew: false };
          }
        });

        const fileStatuses = await Promise.all(statusPromises);
        const newFiles = fileStatuses.filter(f => f.isNew);

        if (newFiles.length > 0) {
          console.log(`Staging ${newFiles.length} new files before stash...`);
          await git.add(newFiles.map(f => f.filePath));
        }
      }

      await git.stashPush(message || 'Stashed changes', pendingStashFiles, keepChanges);
      console.log(`Stashed ${pendingStashFiles.length} files${keepChanges ? ' (kept in working directory)' : ''}`);

      // Clear pending files and refresh
      setPendingStashFiles([]);
      if (onRefresh) await onRefresh();
      if (onStashCreated) await onStashCreated();
    } catch (error) {
      console.error('Error stashing:', error);
      setPendingStashFiles([]);
    }
  };

  const handleContextMenu = async (action: string, items: any[], clickedItem: string, contextRepoPath: string, listType: string) => {
    if (isBusy) {
      console.log('Operation in progress, please wait...');
      return;
    }

    try {
      setIsBusy(true);

      // Get all file paths from selected items (including files within folders)
      const allFilePaths = [];
      items.forEach(item => {
        if (item.type === 'file') {
          allFilePaths.push(item.file.path);
        } else if (item.type === 'folder') {
          item.files.forEach(f => allFilePaths.push(f.path));
        }
      });

      const git = gitAdapter;

      switch (action) {
        case 'show-in-explorer':
          // Show the clicked item in file explorer
          const itemPath = path.join(gitAdapter.repoPath, clickedItem);
          await ipcRenderer.invoke('show-item-in-folder', itemPath);
          break;
        case 'open-in-editor':
          // Open the clicked item in external editor
          const editorPath = path.join(gitAdapter.repoPath, clickedItem);
          const editor = getSetting('externalEditor') || 'code';
          await ipcRenderer.invoke('open-in-editor', editorPath, editor);
          break;

        case 'stage':
          if (allFilePaths.length > 0) {
            if (onBusyMessageChange) onBusyMessageChange(`git add ${allFilePaths.length > 1 ? `(${allFilePaths.length} files)` : allFilePaths[0]}`);
            await git.add(allFilePaths);
            console.log(`Staged ${allFilePaths.length} files`);
            if (onRefresh)
              await onRefresh();
          }
          break;

        case 'unstage':
          if (allFilePaths.length > 0) {
            if (onBusyMessageChange) onBusyMessageChange(`git reset ${allFilePaths.length > 1 ? `(${allFilePaths.length} files)` : allFilePaths[0]}`);
            await git.reset(allFilePaths);
            console.log(`Unstaged ${allFilePaths.length} files`);
            if (onRefresh)
              await onRefresh();
          }
          break;

        case 'discard':
          if (allFilePaths.length > 0) {
            const confirmed = await showConfirm(
              `Are you sure you want to discard changes for ${allFilePaths.length} file(s)? This cannot be undone.`
            );
            if (confirmed) {
              if (onBusyMessageChange) onBusyMessageChange(`git checkout ${allFilePaths.length > 1 ? `(${allFilePaths.length} files)` : allFilePaths[0]}`);
              await git.discard(allFilePaths);
              console.log(`Discarded changes for ${allFilePaths.length} files`);
              if (onRefresh)
                await onRefresh();
            }
          }
          break;

        case 'stash':
          if (allFilePaths.length > 0) {
            setPendingStashFiles(allFilePaths);
            setShowStashDialog(true);
          }
          break;

        case 'save-as-patch':
          if (allFilePaths.length > 0) {
            // Use electron's save dialog
            const result = await ipcRenderer.invoke('show-save-dialog', {
              title: 'Save Patch As',
              defaultPath: path.join(gitAdapter.repoPath, 'changes.patch'),
              filters: [
                { name: 'Patch Files', extensions: ['patch'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePath) {
              const isStaged = listType === 'staged';
              await git.createPatch(allFilePaths, result.filePath, isStaged);
              console.log(`Saved patch to ${result.filePath}`);
            }
          }
          break;

        case 'copy-path':
          // Copy repo-relative path to clipboard
          navigator.clipboard.writeText(clickedItem);
          console.log(`Copied path: ${clickedItem}`);
          break;

        case 'copy-full-path':
          // Copy full absolute path to clipboard
          const fullPath = path.join(gitAdapter.repoPath, clickedItem);
          navigator.clipboard.writeText(fullPath);
          console.log(`Copied full path: ${fullPath}`);
          break;

        case 'ignore-file':
          // Ignore specific file
          await git.addToGitignore(clickedItem);
          console.log(`Added '${clickedItem}' to .gitignore`);
          if (onRefresh)
            await onRefresh();
          break;

        case 'ignore-extension':
          // Ignore all files with same extension
          const fileName = clickedItem.split('/').pop();
          const fileExt = fileName.includes('.') ? fileName.split('.').pop() : '';
          if (fileExt) {
            await git.addToGitignore(`*.${fileExt}`);
            console.log(`Added '*.${fileExt}' to .gitignore`);
            if (onRefresh)
              await onRefresh();
          }
          break;

        case 'ignore-folder':
          // Ignore all files in folder
          await git.addToGitignore(`${clickedItem}/`);
          console.log(`Added '${clickedItem}/' to .gitignore`);
          if (onRefresh)
            await onRefresh();
          break;

        case 'ignore-custom':
          // Show custom pattern dialog
          const pattern = window.prompt('Enter ignore pattern:');
          if (pattern && pattern.trim()) {
            await git.addToGitignore(pattern.trim());
            console.log(`Added '${pattern.trim()}' to .gitignore`);
            if (onRefresh)
              await onRefresh();
          }
          break;

        case 'lfs-track-file':
        case 'lfs-track-extension': {
          const fileName = clickedItem.split('/').pop() || clickedItem;
          let lfsPattern: string;
          if (action === 'lfs-track-extension') {
            const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
            if (!ext) {
              showAlert('This file has no extension to track. Use "Track Only" instead.');
              break;
            }
            lfsPattern = `*.${ext}`;
          } else {
            lfsPattern = clickedItem;
          }

          try {
            const initialized = await git.isLfsInitialized();
            if (!initialized) {
              if (onBusyMessageChange) onBusyMessageChange('git lfs install');
              await git.lfsInstall();
            }
            if (onBusyMessageChange) onBusyMessageChange(`git lfs track "${lfsPattern}"`);
            await git.lfsTrack(lfsPattern);

            // Re-stage .gitattributes always; re-stage the file itself only if it
            // was already staged, so its LFS pointer is what gets committed.
            const toStage = listType === 'staged' ? ['.gitattributes', clickedItem] : ['.gitattributes'];
            await git.add(toStage);
            showAlert(`Now tracking "${lfsPattern}" with Git LFS.`);
            if (onRefresh)
              await onRefresh();
          } catch (lfsError: any) {
            console.error('Error tracking file with Git LFS:', lfsError);
            showAlert(describeLfsError(lfsError), 'Git LFS');
          }
          break;
        }

        default:
          console.warn(`Unknown context menu action: ${action}`);
      }
    } catch (error) {
      console.error(`Error handling context menu action '${action}':`, error);
      showAlert(`Error: ${(error as Error).message}`, 'Error');
    } finally {
      setIsBusy(false);
      if (onBusyMessageChange) onBusyMessageChange('');
    }
  };

  return (
    <div
      className="local-changes-vertical-container"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top section: file lists on left, diff viewer on right */}
      <div className="local-changes-top-section" style={{ height: `calc(100% - 60px)` }}>
        <div className="local-changes-file-lists" style={{ width: `${leftWidth}%` }}>
          <div className="changes-split-panel" style={{ height: `${fileListsHeight}%` }}>
            <FileList
              title="Unstaged Files"
              files={unstagedFiles}
              listType="unstaged"
              onDrop={handleFileDrop}
              onSelectFile={handleSelectFile}
              selectedFile={selectedFile}
              repoPath={gitAdapter.repoPath}
              onContextMenu={handleContextMenu}
              lfsPatterns={lfsPatterns}
              onDiscardAll={async () => {
                const confirmed = await showConfirm(
                  `Are you sure you want to discard ${unstagedFiles.length} file(s)? This cannot be undone.`
                );
                if (confirmed) {
                  try {
                    setIsBusy(true);
                    if (onBusyMessageChange) onBusyMessageChange(`Discarding ${unstagedFiles.length} files...`);
                    const allPaths = unstagedFiles.map(f => f.path);
                    await gitAdapter.discard(allPaths);
                    console.log(`Discarded ${unstagedFiles.length} files`);
                    if (onRefresh) await onRefresh();
                  } catch (error) {
                    console.error('Error discarding files:', error);
                  } finally {
                    setIsBusy(false);
                    if (onBusyMessageChange) onBusyMessageChange('');
                  }
                }
              }}
              onStageAll={async () => {
                if (unstagedFiles.length === 0)
                  return;
                try {
                  setIsBusy(true);
                  if (onBusyMessageChange) onBusyMessageChange(`git add -A (${unstagedFiles.length} files)`);
                  // Stage everything in one `git add -A` rather than passing every
                  // path on the command line — staging thousands of files otherwise
                  // overflows the command-line length limit and hangs.
                  await gitAdapter.addAll();
                  console.log(`Staged ${unstagedFiles.length} files`);
                  if (onRefresh) await onRefresh();
                } catch (error) {
                  console.error('Error staging files:', error);
                } finally {
                  setIsBusy(false);
                  if (onBusyMessageChange) onBusyMessageChange('');
                }
              }}
            />
          </div>
          <div
            className="changes-splitter-handle"
            onMouseDown={() => handleMouseDown('vertical')}
          >
            <div className="changes-splitter-line"></div>
          </div>
          <div className="changes-split-panel" style={{ height: `${100 - fileListsHeight}%` }}>
            <FileList
              title="Staged Files"
              files={stagedFiles}
              listType="staged"
              onDrop={handleFileDrop}
              onSelectFile={handleSelectFile}
              selectedFile={selectedFile}
              repoPath={gitAdapter.repoPath}
              onContextMenu={handleContextMenu}
              lfsPatterns={lfsPatterns}
              onStageAll={async () => {
                if (stagedFiles.length === 0)
                  return;
                try {
                  setIsBusy(true);
                  if (onBusyMessageChange) onBusyMessageChange(`git reset (${stagedFiles.length} files)`);
                  // Unstage everything in one `git reset` rather than enumerating paths.
                  await gitAdapter.resetAll();
                  console.log(`Unstaged ${stagedFiles.length} files`);
                  if (onRefresh) await onRefresh();
                } catch (error) {
                  console.error('Error unstaging files:', error);
                } finally {
                  setIsBusy(false);
                  if (onBusyMessageChange) onBusyMessageChange('');
                }
              }}
            />
          </div>
        </div>
        {selectedFile && (
          <>
            <div
              className="changes-horizontal-splitter-handle"
              onMouseDown={() => handleMouseDown('horizontal-top')}
            >
              <div className="changes-horizontal-splitter-line"></div>
            </div>
            <div className="local-changes-diff-viewer" style={{ width: `${100 - leftWidth}%` }}>
              <DiffViewer
                file={selectedFile.file}
                gitAdapter={gitAdapter}
                isStaged={selectedFile.listType === 'staged'}
                onRefresh={onRefresh}
                onError={onError}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom section: commit panel spanning full width */}
      <div className="commit-panel-bottom">
        <div className="commit-panel-content">
          <div className="commit-message-input-wrapper">
            <input
              type="text"
              className="commit-message-input"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              disabled={isBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommit();
                }
              }}
            />
            <div className={`commit-message-counter ${commitMessage.length > 50 ? 'over-limit' : ''}`}>
              {50 - commitMessage.length}
            </div>
          </div>
          <input
            type="text"
            className="commit-description-input"
            value={commitDescription}
            onChange={(e) => setCommitDescription(e.target.value)}
            placeholder="Description (optional)"
            disabled={isBusy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCommit();
              }
            }}
          />
          <button
            className="commit-description-expand"
            onClick={() => setShowDescriptionEditor(true)}
            title="Open larger editor"
            disabled={isBusy}
          >
            ⤢
          </button>
          <button
            className="commit-button"
            onClick={handleCommit}
            disabled={stagedFiles.length === 0 || !commitMessage.trim() || isBusy}
          >
            Commit
          </button>
        </div>
      </div>

      {/* Stash Dialog */}
      {showStashDialog && (
        <StashDialog
          onClose={() => {
            setShowStashDialog(false);
            setPendingStashFiles([]);
          }}
          onStash={handleStash}
        />
      )}

      {/* Pull Commit Dialog */}
      {showPullCommitDialog && (
        <PullCommitDialog
          onClose={() => setShowPullCommitDialog(false)}
          onPullAndCommit={handlePullAndCommit}
          onCommitOnly={handleCommitOnly}
        />
      )}

      {/* Stash Conflict Dialog */}
      {showStashConflictDialog && (
        <StashConflictDialog
          onClose={() => setShowStashConflictDialog(false)}
        />
      )}

      {/* Large-file LFS Warning Dialog */}
      {showLfsWarningDialog && (
        <LfsWarningDialog
          files={lfsWarningFiles}
          thresholdMB={getSetting('lfsWarnThresholdMB') || 100}
          onClose={() => setShowLfsWarningDialog(false)}
          onTrackAndCommit={handleLfsTrackAndCommit}
          onCommitAnyway={handleLfsCommitAnyway}
        />
      )}

      {/* Description Editor Dialog */}
      {showDescriptionEditor && (
        <div className="dialog-overlay" onClick={() => setShowDescriptionEditor(false)}>
          <div className="dialog-content dialog-content-large" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Edit Commit Description</h3>
            </div>
            <div className="dialog-body">
              <textarea
                className="dialog-input description-editor-textarea"
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                autoFocus
                rows={10}
              />
            </div>
            <div className="dialog-footer">
              <button className="dialog-button dialog-button-primary" onClick={() => setShowDescriptionEditor(false)}>
                Done
              </button>
              <button className="dialog-button dialog-button-cancel" onClick={() => setShowDescriptionEditor(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LocalChangesPanel;
