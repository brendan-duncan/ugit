import React, { useState, useRef } from 'react';
import FileList from './FileList';
import DiffViewer from './DiffViewer';
import StashDialog from './StashDialog';
import PullCommitDialog from './PullCommitDialog';
import StashConflictDialog from './StashConflictDialog';
import { GitAdapter } from '../git/GitAdapter';
import { FileInfo } from './types';
import { ipcRenderer } from 'electron';
import path from 'path';
import './LocalChangesPanel.css';


interface LocalChangesPanelProps {
  unstagedFiles: Array<FileInfo>;
  stagedFiles: Array<FileInfo>;
  gitAdapter: GitAdapter;
  onRefresh: () => Promise<void>;
  currentBranch?: string;
  branchStatus?: Record<string, any>;
  onError?: (error: string) => void;
}

function LocalChangesPanel({ unstagedFiles, stagedFiles, gitAdapter, onRefresh, currentBranch, branchStatus, onError }: LocalChangesPanelProps) {
  const [fileListsHeight, setFileListsHeight] = useState<number>(50);
  const [leftWidth, setLeftWidth] = useState<number>(50);
  const [selectedFile, setSelectedFile] = useState(null);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [commitDescription, setCommitDescription] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [showStashDialog, setShowStashDialog] = useState<boolean>(false);
  const [showPullCommitDialog, setShowPullCommitDialog] = useState<boolean>(false);
  const [showStashConflictDialog, setShowStashConflictDialog] = useState<boolean>(false);
  const [pendingStashFiles, setPendingStashFiles] = useState<Array<string>>([]);
  const activeSplitter = useRef<string | null>(null);

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
    }
  };

  const handleSelectFile = (file: string, status: string) => {
    setSelectedFile({ file, status });
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0 || isBusy) {
      return;
    }

    // Check if current branch is behind remote
    let needsPull = false;
    if (currentBranch && branchStatus && branchStatus[currentBranch]) {
      const status = branchStatus[currentBranch];
      needsPull = status.behind && status.behind > 0;
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
        console.log('Stashing local changes before pull...');
        const stashMessage = `Auto-stash before pull at ${new Date().toISOString()}`;
        await git.stashPush(stashMessage);
        console.log('Stashed local changes successfully');

        try {
          console.log(`Pulling latest changes from origin/${currentBranch}...`);
          await git.pull('origin', currentBranch);
          console.log('Pull completed successfully');
          
          // Try to apply the stash
          try {
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

      await git.commit(fullMessage);
      console.log('Commit successful');

      // Clear the commit fields
      setCommitMessage('');
      setCommitDescription('');

      // Refresh of the file lists
      if (onRefresh) {
        await onRefresh();
      }

      // Trigger immediate branch status refresh after commit to update push count
      // Use setTimeout to ensure file status is updated first
      setTimeout(async () => {
        // Call a special refresh that only updates branch status
        const refreshEvent = new CustomEvent('refresh-branch-status', {
          detail: {}
        });
        window.dispatchEvent(refreshEvent);
      }, 100);
    } catch (error) {
      console.error('Error committing:', error);
    } finally {
      setIsBusy(false);
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

  const handleStash = async (message: string, stageNewFiles: boolean) => {
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

      await git.stashPush(message || 'Stashed changes', pendingStashFiles);
      console.log(`Stashed ${pendingStashFiles.length} files`);

      // Clear pending files and refresh
      setPendingStashFiles([]);
      if (onRefresh) await onRefresh();
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

        case 'stage':
          if (allFilePaths.length > 0) {
            await git.add(allFilePaths);
            console.log(`Staged ${allFilePaths.length} files`);
            if (onRefresh)
              await onRefresh();
          }
          break;

        case 'unstage':
          if (allFilePaths.length > 0) {
            await git.reset(allFilePaths);
            console.log(`Unstaged ${allFilePaths.length} files`);
            if (onRefresh)
              await onRefresh();
          }
          break;

        case 'discard':
          if (allFilePaths.length > 0) {
            const confirmed = window.confirm(
              `Are you sure you want to discard changes for ${allFilePaths.length} file(s)? This cannot be undone.`
            );
            if (confirmed) {
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

        default:
          console.warn(`Unknown context menu action: ${action}`);
      }
    } catch (error) {
      console.error(`Error handling context menu action '${action}':`, error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="local-changes-vertical-container"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Busy indicator overlay */}
      {isBusy && (
        <div className="busy-overlay">
          <div className="busy-spinner"></div>
          <div className="busy-message">Processing...</div>
        </div>
      )}

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
          />
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
    </div>
  );
}

export default LocalChangesPanel;
