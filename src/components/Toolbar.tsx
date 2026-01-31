import React, { useState, useRef, useEffect } from 'react';
import { clipboard } from 'electron';
import './Toolbar.css';

interface RunningCommand {
  id: number;
  command: string;
  time: number;
}

interface BranchStatus {
  [branchName: string]: {
    ahead: number;
    behind: number;
  };
}

interface ToolbarProps {
  onRefresh: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onStash: () => void;
  refreshing: boolean;
  currentBranch: string;
  branchStatus: BranchStatus;
  onCreateBranch: () => void;
  runningCommands: RunningCommand[];
}

const Toolbar: React.FC<ToolbarProps> = ({ onRefresh, onFetch, onPull, onPush, onStash, refreshing, currentBranch, branchStatus, onCreateBranch, runningCommands }) => {
  const [showRepositoryMenu, setShowRepositoryMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowRepositoryMenu(false);
      }
    };

    if (showRepositoryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showRepositoryMenu]);

  // Get status for current branch
  const currentBranchStatus = branchStatus[currentBranch] || { ahead: 0, behind: 0 };
  
  // Create labels with counts
  const pullLabel = currentBranchStatus.behind > 0 ? `Pull (${currentBranchStatus.behind})` : 'Pull';
  const pushLabel = currentBranchStatus.ahead > 0 ? `Push (${currentBranchStatus.ahead})` : 'Push';

  const commandStatus = runningCommands.length > 0
    ? `${runningCommands.map(cmd => cmd.command).join('\n')}`
    : '';

  const onCopyCommands = async (): Promise<void> => {
    console.log('Copying commands to clipboard:', commandStatus);
    await clipboard.writeText(commandStatus);
  };

  return (
    <div className="toolbar">
      <button className="toolbar-button" onClick={onRefresh} disabled={!onRefresh || refreshing}>
        <span className={`toolbar-button-icon ${refreshing ? 'spinning' : ''}`}>↻</span>
        <span className="toolbar-button-label">Refresh</span>
      </button>
      <div className="toolbar-separator"></div>
      <button className="toolbar-button" onClick={onFetch} disabled={!onFetch}>
        <span className="toolbar-button-icon">⬇</span>
        <span className="toolbar-button-label">Fetch</span>
      </button>
      <button className="toolbar-button" onClick={onPull} disabled={!onPull}>
        <span className="toolbar-button-icon">⤓</span>
        <span className="toolbar-button-label">{pullLabel}</span>
      </button>
      <button className="toolbar-button" onClick={onPush} disabled={!onPush}>
        <span className="toolbar-button-icon">⬆</span>
        <span className="toolbar-button-label">{pushLabel}</span>
      </button>
      <div className="toolbar-separator"></div>
      <button className="toolbar-button" onClick={onStash} disabled={!onStash}>
        <span className="toolbar-button-icon">📦</span>
        <span className="toolbar-button-label">Stash</span>
      </button>
      <button className="toolbar-button" onClick={onCreateBranch} disabled={!currentBranch}>
        <span className="toolbar-button-icon">🌿</span>
        <span className="toolbar-button-label">Branch</span>
      </button>
      <div className="toolbar-separator"></div>
      {runningCommands.length > 0 &&
        <div className="toolbar-status"><span className="toolbar-busy-spinner" title={commandStatus} onClick={onCopyCommands}>↻</span></div>
      }
    </div>
  );
}

export default Toolbar;
