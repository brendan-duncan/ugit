import React, { useState, useEffect } from 'react';
import { DropdownMenu, DropdownItem, DropdownSeparator, DropdownSubmenu } from './DropdownMenu';
import EditOriginDialog from './EditOriginDialog';
import GitAdapter from '../git/GitAdapter';
import { useAlert } from '../contexts/AlertContext';
import { exec } from 'child_process';
import { shell, clipboard, ipcRenderer } from 'electron';
import './RepoInfo.css';

interface SelectedItem {
  type: string;
  [key: string]: any;
}

interface RepoInfoProps {
  gitAdapter: GitAdapter | null;
  currentBranch: string;
  originUrl: string;
  modifiedCount: number;
  selectedItem: SelectedItem | null;
  onSelectItem: (item: SelectedItem) => void;
  usingCache: boolean;
  onResetToOrigin: () => void;
  onCleanWorkingDirectory: () => void;
  onGitGC: () => Promise<void>;
  onOriginChanged?: () => Promise<void>;
  onStashChanges?: () => void;
  onDiscardChanges?: () => void;
  onRefresh?: () => Promise<void>;
  onError?: (error: string) => void;
}

const RepoInfo: React.FC<RepoInfoProps> = ({ gitAdapter, currentBranch, originUrl, modifiedCount, selectedItem, onSelectItem, usingCache, onResetToOrigin, onCleanWorkingDirectory, onGitGC, onOriginChanged, onStashChanges, onDiscardChanges, onRefresh, onError }) => {
  const { showAlert, showConfirm } = useAlert();
  const [showEditOriginDialog, setShowEditOriginDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isLfsInitialized, setIsLfsInitialized] = useState(false);
  const isSelected = selectedItem && selectedItem.type === 'local-changes';

  // Extract repository directory name from the full path
  const repoName = gitAdapter?.repoPath?.split(/[\\/]/).pop() || 'Repository';

  // Check if LFS is initialized
  useEffect(() => {
    const checkLfsStatus = async () => {
      if (gitAdapter) {
        try {
          const initialized = await gitAdapter.isLfsInitialized();
          setIsLfsInitialized(initialized);
        } catch (error) {
          setIsLfsInitialized(false);
        }
      }
    };
    checkLfsStatus();
  }, [gitAdapter]);

  // Menu item handlers
  const handleOpenInFileExplorer = () => {
    shell.openPath(gitAdapter?.repoPath);
  };

  const handleOpenInConsole = () => {
    const platform = process.platform;
    const repoPath = gitAdapter?.repoPath;

    if (platform === 'win32') {
      //shell.openExternal(`start cmd /k "cd /d ${repoPath}`);
      exec(`start cmd /k "cd /d ${repoPath}"`);
    } else if (platform === 'darwin') {
      shell.openExternal(`osascript -e 'tell app "Terminal" to do script "cd \\"${repoPath}\\"" end tell'`);
    } else {
      shell.openExternal(`gnome-terminal --working-directory="${repoPath}"`);
    }
  };

  const handleOpenInVSCode = () => {
    const repoPath = gitAdapter?.repoPath;
    if (repoPath) {
      exec(`code "${repoPath}"`, (error) => {
        if (error) {
          console.error('Error opening VS Code:', error);
          if (onError) {
            onError('Failed to open Visual Studio Code. Make sure VS Code is installed and the "code" command is available in your PATH.');
          }
        }
      });
    }
  };

  const convertGitSshToHttps = (sshUrl: string): string => {
    return sshUrl
      .replace(/^git@/, 'https://')  // Swap git@ for https://
      .replace(/\.git$/, '')         // Remove trailing .git
      .replace(/(?<!https):/, '/');  // Replace colon ONLY if not preceded by 'https'
  };

  const handleOpenRemoteUrl = () => {
    if (originUrl) {
      const httpsUrl = convertGitSshToHttps(originUrl) + `/commits/${currentBranch}`;
      console.log('!!!! OPEN', httpsUrl);
      shell.openExternal(httpsUrl);
    }
  };

  const handleOpenPR = () => {
    if (originUrl) {
      const httpsUrl = convertGitSshToHttps(originUrl) + `/compare/${currentBranch}?expand=1`;
      shell.openExternal(httpsUrl);
    }
  };

  const handleOpenCompare = () => {
    if (originUrl) {
      const httpsUrl = convertGitSshToHttps(originUrl) + `/compare/${currentBranch}`;
      shell.openExternal(httpsUrl);
    }
  };

  const handleCopyLocalPath = () => {
    clipboard.writeText(gitAdapter?.repoPath || '');
  };

  const handleCopyRemoteURL = () => {
    clipboard.writeText(convertGitSshToHttps(originUrl || '') || '');
  };

  const handleEditOriginDialog = async (newUrl: string) => {
    setShowEditOriginDialog(false);

    try {
      const git = gitAdapter;
      if (!git)
        return;

      if (originUrl) {
        // Update existing origin
        await git.setRemoteUrl('origin', newUrl);
        console.log(`Updated origin URL from ${originUrl} to ${newUrl}`);
      } else {
        // Add new origin if none exists
        await git.addRemote('origin', newUrl);
        console.log(`Added new origin URL: ${newUrl}`);
      }

      // Notify parent component to refresh origin URL
      if (onOriginChanged) {
        await onOriginChanged();
      }
    } catch (error: any) {
      console.error('Error editing origin:', error);
      if (onError) {
        onError(`Error editing origin: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLocalChangesContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only show context menu if there are changes
    if (modifiedCount === 0) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: rect.left,
      y: rect.top + rect.height,
    });
  };

  const handleLfsInitialize = async () => {
    try {
      await gitAdapter?.lfsInstall();
      showAlert('Git LFS has been initialized successfully.');
      setIsLfsInitialized(true);
    } catch (error: any) {
      console.error('Error initializing Git LFS:', error);
      if (onError) {
        onError(`Failed to initialize Git LFS: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLfsTrackPattern = () => {
    const pattern = prompt('Enter file pattern to track (e.g., *.psd, *.bin):');
    if (pattern) {
      gitAdapter?.lfsTrack(pattern)
        .then(() => {
          showAlert(`Now tracking "${pattern}" with Git LFS.\n\nDon't forget to commit the updated .gitattributes file.`);
        })
        .catch((error: any) => {
          console.error('Error tracking pattern:', error);
          if (onError) {
            onError(`Failed to track pattern: ${error?.message || 'Unknown error'}`);
          }
        });
    }
  };

  const handleLfsStatus = async () => {
    try {
      const status = await gitAdapter?.lfsStatus();
      showAlert(`Git LFS Status:\n\n${status}`, 'Git LFS Status');
    } catch (error: any) {
      console.error('Error getting LFS status:', error);
      if (onError) {
        onError(`Failed to get LFS status: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLfsFetch = async () => {
    try {
      await gitAdapter?.lfsFetch();
      showAlert('Git LFS objects fetched successfully.');
    } catch (error: any) {
      console.error('Error fetching LFS objects:', error);
      if (onError) {
        onError(`Failed to fetch LFS objects: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLfsPull = async () => {
    try {
      await gitAdapter?.lfsPull();
      showAlert('Git LFS objects pulled successfully.');
    } catch (error: any) {
      console.error('Error pulling LFS objects:', error);
      if (onError) {
        onError(`Failed to pull LFS objects: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLfsPrune = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to prune old Git LFS objects?\n\nThis will delete local LFS files that are no longer referenced.'
    );
    if (confirmed) {
      try {
        await gitAdapter?.lfsPrune();
        showAlert('Git LFS objects pruned successfully.');
      } catch (error: any) {
        console.error('Error pruning LFS objects:', error);
        if (onError) {
          onError(`Failed to prune LFS objects: ${error?.message || 'Unknown error'}`);
        }
      }
    }
  };

  const handleLfsDeinitialize = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to deinitialize Git LFS?\n\nThis will remove LFS hooks from this repository.'
    );
    if (confirmed) {
      try {
        await gitAdapter?.lfsUninstall();
        showAlert('Git LFS has been deinitialized.');
        setIsLfsInitialized(false);
      } catch (error: any) {
        console.error('Error deinitializing Git LFS:', error);
        if (onError) {
          onError(`Failed to deinitialize Git LFS: ${error?.message || 'Unknown error'}`);
        }
      }
    }
  };

  const handleApplyPatch = async () => {
    try {
      // Open file dialog to select patch file
      const result = await ipcRenderer.invoke('show-open-dialog', {
        title: 'Select Patch File',
        properties: ['openFile'],
        filters: [
          { name: 'Patch Files', extensions: ['patch', 'diff'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const patchPath = result.filePaths[0];

      // Apply the patch
      if (gitAdapter) {
        await gitAdapter.raw(['apply', patchPath]);
        showAlert(`Patch applied successfully from:\n${patchPath}`);

        // Refresh repository data
        if (onRefresh) {
          await onRefresh();
        }
      }
    } catch (error: any) {
      console.error('Error applying patch:', error);
      if (onError) {
        onError(`Failed to apply patch: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleContextMenuAction = (action: string) => {
    switch (action) {
      case 'stash':
        if (onStashChanges) {
          onStashChanges();
        }
        break;
      case 'discard':
        if (onDiscardChanges) {
          onDiscardChanges();
        }
        break;
    }
    setContextMenu(null);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Close context menu when clicking outside
  React.useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div className="repo-info">
      <div className="repo-header">
        <div className="repo-name">{repoName}</div>
        <DropdownMenu trigger={<span className="menu-button">...</span>}>
          <DropdownItem onClick={handleOpenInFileExplorer}>
            📁 Open in File Explorer
          </DropdownItem>
          <DropdownItem onClick={handleOpenInConsole}>
            🖥️ Open in Console
          </DropdownItem>
          <DropdownItem onClick={handleOpenInVSCode}>
            💻 Open in Visual Studio Code
          </DropdownItem>
          <DropdownItem onClick={handleCopyLocalPath}>
            📋 Copy Local Path
          </DropdownItem>
          <DropdownItem onClick={handleCopyRemoteURL}>
            📋 Copy Remote URL
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={handleOpenRemoteUrl}>
            🌐 Open Remote URL
          </DropdownItem>
          <DropdownItem onClick={handleOpenPR}>
            🌐 Open PR
          </DropdownItem>
          <DropdownItem onClick={handleOpenCompare}>
            🌐 Open Branch Compare
          </DropdownItem>
          <DropdownSeparator />
          {!isLfsInitialized ? (
            <DropdownSubmenu label="Git LFS">
              <DropdownItem onClick={handleLfsInitialize}>
                Initialize Git LFS
              </DropdownItem>
            </DropdownSubmenu>
          ) : (
            <DropdownSubmenu label="Git LFS">
              <DropdownItem onClick={handleLfsTrackPattern}>
                Add Track Pattern...
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={handleLfsStatus}>
                Status (Locs)...
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={handleLfsFetch}>
                Fetch...
              </DropdownItem>
              <DropdownItem onClick={handleLfsPull}>
                Pull...
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={handleLfsPrune}>
                Prune
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={handleLfsDeinitialize}>
                Deinitialize Git LFS
              </DropdownItem>
            </DropdownSubmenu>
          )}
          <DropdownSeparator />
          <DropdownItem onClick={handleApplyPatch}>
            📄 Apply Patch...
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={onGitGC}>
            🗑 Git GC
          </DropdownItem>
          <DropdownItem onClick={onCleanWorkingDirectory}>
            🧹Clean Working Directory...
          </DropdownItem>
          <DropdownItem onClick={onResetToOrigin}>
            ❗Reset to origin...
          </DropdownItem>
        </DropdownMenu>
      </div>
      <div className="repo-local">
        Local: <strong>{gitAdapter?.repoPath || 'Unknown'}</strong>
      </div>
      {originUrl ? (
          <div className="repo-origin">
            Remote: <strong>{originUrl}</strong>
          </div>
        ) : (
          <div className="repo-origin">
            Remote: <strong>none</strong>
          </div>
        )}
      {currentBranch && (
          <div className="repo-branch">
            Branch: <strong>{currentBranch}</strong>
          </div>
        )}
      <div className="local-changes-section">
        <div
          className={`local-changes-item ${isSelected ? 'selected' : ''}`}
          onClick={() => onSelectItem({ type: 'local-changes' })}
          onContextMenu={handleLocalChangesContextMenu}
        >
          <span className="changes-icon">📝</span>
          Local Changes
          <span className="modified-count">({modifiedCount})</span>
          {usingCache && <span className="cache-indicator"></span>}
        </div>
      </div>

      {/* Local Changes Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000
          }}
        >
          <div className="context-menu-item" onClick={() => handleContextMenuAction('stash')}>
            Stash Changes
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('discard')}>
            Discard Changes
          </div>
        </div>
      )}

      {/* Edit Origin Dialog */}
      {showEditOriginDialog && (
        <EditOriginDialog
          onClose={() => setShowEditOriginDialog(false)}
          onEditOrigin={handleEditOriginDialog}
          currentOriginUrl={originUrl}
        />
      )}
    </div>
  );
}

export default RepoInfo;
