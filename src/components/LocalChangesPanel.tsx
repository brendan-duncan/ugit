import React, { useState, useRef } from 'react';
import FileList from './FileList';
import DiffViewer from './DiffViewer';
import StashDialog from './StashDialog';
import { ipcRenderer } from 'electron';
import path from 'path';
import './LocalChangesPanel.css';

function LocalChangesPanel({ unstagedFiles, stagedFiles, gitAdapter, onRefresh }) {

  const [fileListsHeight, setFileListsHeight] = useState(50);
  const [leftWidth, setLeftWidth] = useState(50);
  const [selectedFile, setSelectedFile] = useState(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showStashDialog, setShowStashDialog] = useState(false);
  const [pendingStashFiles, setPendingStashFiles] = useState([]);
  const activeSplitter = useRef(null);

  const handleMouseDown = (splitterType) => {
    activeSplitter.current = splitterType;
  };

  const handleMouseUp = () => {
    activeSplitter.current = null;
  };

  const handleMouseMove = (e) => {
    if (activeSplitter.current === null) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();

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

  const handleFileDrop = async (item, sourceList, targetList) => {
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

  const handleSelectFile = (file, listType) => {
    setSelectedFile({ file, listType });
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0 || isBusy) {
      return;
    }

    try {
      setIsBusy(true);
      const git = gitAdapter;

      // Construct commit message with optional description
      const fullMessage = commitDescription.trim()
        ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
        : commitMessage.trim();

      await git.commit(fullMessage);
      console.log('Commit successful');

      // Clear the commit fields
      setCommitMessage('');
      setCommitDescription('');

      // Refresh the file lists
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

  const handleStash = async (message, stageNewFiles) => {
    setShowStashDialog(false);

    if (pendingStashFiles.length === 0) return;

    try {
      const git = gitAdapter;

      // If stageNewFiles is checked, stage new files first (optional for context menu stashing)
      if (stageNewFiles) {
        const statusPromises = pendingStashFiles.map(async (filePath) => {
          try {
            const status = await git.status([filePath]);
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

  const handleContextMenu = async (action, items, clickedItem, contextRepoPath, listType) => {
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
            if (onRefresh) await onRefresh();
          }
          break;

        case 'unstage':
          if (allFilePaths.length > 0) {
            await git.reset(allFilePaths);
            console.log(`Unstaged ${allFilePaths.length} files`);
            if (onRefresh) await onRefresh();
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
              if (onRefresh) await onRefresh();
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
              />
            </div>
          </>
        )}
      </div>



      {/* Bottom section: commit panel spanning full width */}
      <div className="commit-panel-bottom">
        <div className="commit-panel-content">
          <input
            type="text"
            className="commit-message-input"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message"
            disabled={isBusy}
          />
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
    </div>
  );
}

export default LocalChangesPanel;
