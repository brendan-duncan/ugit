import React, { useState } from 'react';
import './RepoInfo.css';
import { DropdownMenu, DropdownItem, DropdownSeparator } from './DropdownMenu';
import EditOriginDialog from './EditOriginDialog';
const { exec } = require('child_process');
const { shell } = window.require('electron');

function RepoInfo({ gitAdapter, currentBranch, originUrl, modifiedCount, selectedItem, onSelectItem, usingCache, onResetToOrigin, onCleanWorkingDirectory, onOriginChanged }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showEditOriginDialog, setShowEditOriginDialog] = useState(false);
  const isSelected = selectedItem && selectedItem.type === 'local-changes';

  // Extract repository directory name from the full path
  const repoName = gitAdapter?.repoPath?.split(/[\\/]/).pop() || 'Repository';

  // Menu item handlers
  const handleOpenInFileExplorer = () => {
    const { shell } = window.require('electron');
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

  const handleCopyLocalPath = async () => {
    const { clipboard } = window.require('electron');
    await clipboard.writeText(gitAdapter?.repoPath || '');
  };

  const handleEditOrigin = () => {
    setShowEditOriginDialog(true);
  };

  const handleEditOriginDialog = async (newUrl) => {
    setShowEditOriginDialog(false);

    try {
      const git = gitAdapter;

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
    } catch (error) {
      console.error('Error editing origin:', error);
      alert(`Error editing origin: ${error.message}`);
    }
  };

  const handleDeleteOrigin = () => {
    // TODO: Implement delete origin dialog
    alert('Delete origin - not implemented yet');
  };

  const handleAddNewRemote = () => {
    // TODO: Implement add remote dialog
    alert('Add new remote - not implemented yet');
  };

  const handleOpenRemoteInBrowser = () => {
    if (originUrl) {
      const { shell } = window.require('electron');
      shell.openExternal(originUrl);
    }
  };

  const handleCopyRemoteAddress = async () => {
    const { clipboard } = window.require('electron');
    await clipboard.writeText(originUrl || '');
  };

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
          <DropdownItem onClick={handleCopyLocalPath}>
            📋 Copy Local Path
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={handleEditOrigin}>
            ✏️ Edit Origin...
          </DropdownItem>
          <DropdownItem onClick={handleDeleteOrigin}>
            🗑️ Delete Origin...
          </DropdownItem>
          <DropdownItem onClick={handleAddNewRemote}>
            ➕ Add New Remote
          </DropdownItem>
          <DropdownItem onClick={handleOpenRemoteInBrowser}>
            🌐 Open Remote in Browser
          </DropdownItem>
          <DropdownItem onClick={handleCopyRemoteAddress}>
            📋 Copy Remote Address
          </DropdownItem>
          <DropdownSeparator />
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
        >
          <span className="changes-icon">📝</span>
          Local Changes
          <span className="modified-count">({modifiedCount})</span>
          {usingCache && <span className="cache-indicator"></span>}
        </div>
      </div>

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
