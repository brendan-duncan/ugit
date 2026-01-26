import React, { useState } from 'react';
import './RepoInfo.css';
import { DropdownMenu, DropdownItem, DropdownSeparator } from './DropdownMenu';
const { exec } = require('child_process');
const { shell } = window.require('electron');

function RepoInfo({ gitAdapter, currentBranch, originUrl, modifiedCount, selectedItem, onSelectItem, usingCache }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
    // TODO: Implement edit origin dialog
    console.log('Edit origin - not implemented yet');
  };

  const handleDeleteOrigin = () => {
    // TODO: Implement delete origin dialog
    console.log('Delete origin - not implemented yet');
  };

  const handleAddNewRemote = () => {
    // TODO: Implement add remote dialog
    console.log('Add new remote - not implemented yet');
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
        </DropdownMenu>
      </div>
      <div className="repo-local">
        Local: <strong>{gitAdapter?.repoPath || 'Unknown'}</strong>
      </div>
      {originUrl ? (
          <div className="repo-origin">
            Origin: <strong>{originUrl}</strong>
          </div>
        ) : (
          <div className="repo-origin">
            Origin: <strong>none</strong>
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
    </div>
  );
}

export default RepoInfo;