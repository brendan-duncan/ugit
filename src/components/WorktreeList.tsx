import React, { useState, useEffect } from 'react';
import { WorktreeInfo } from '../git/GitAdapter';
import './WorktreeList.css';

interface WorktreeListProps {
  worktrees: Array<WorktreeInfo>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Open a worktree's path as a tab (no-op for the worktree already open here).
  onOpenWorktree: (worktreePath: string) => void;
  // Open the Create Worktree dialog.
  onAddWorktree: () => void;
  // Handle context-menu actions: 'open' | 'reveal' | 'lock' | 'unlock' | 'move' | 'remove' | 'prune'.
  onWorktreeAction: (action: string, worktree: WorktreeInfo) => void;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

function WorktreeList({ worktrees, collapsed, onToggleCollapse, onOpenWorktree, onAddWorktree, onWorktreeAction }: WorktreeListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; worktree: WorktreeInfo } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, worktree: WorktreeInfo) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.top + rect.height, worktree });
  };

  const handleAction = (action: string) => {
    if (contextMenu) {
      onWorktreeAction(action, contextMenu.worktree);
    }
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div className="worktree-list">
      <div className="panel-header">
        <h3>Worktrees</h3>
        <div className="panel-header-buttons">
          <button className="add-button" onClick={onAddWorktree} title="Add Worktree">
            <span>+</span>
          </button>
          <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="worktree-list-content">
          {(!worktrees || worktrees.length === 0) ? (
            <div className="worktree-list-empty">No worktrees found</div>
          ) : (
            worktrees.map((wt) => {
              const label = wt.detached
                ? `(${wt.head.substring(0, 7)})`
                : (wt.branch || '(unknown)');
              return (
                <div
                  key={wt.path}
                  className={`worktree-item ${wt.isCurrent ? 'current' : ''} ${wt.prunable ? 'prunable' : ''}`}
                  title={wt.path}
                  onDoubleClick={() => { if (!wt.isCurrent) onOpenWorktree(wt.path); }}
                  onContextMenu={(e) => handleContextMenu(e, wt)}
                >
                  {wt.isCurrent && <span className="worktree-current-icon">●</span>}
                  {!wt.isCurrent && <span className="worktree-spacer"></span>}
                  <span className="worktree-icon">📁</span>
                  <span className="worktree-branch">{label}</span>
                  <span className="worktree-folder">{basename(wt.path)}</span>
                  {wt.isMain && <span className="worktree-badge" title="Main worktree">main</span>}
                  {wt.locked && <span className="worktree-lock-icon" title={wt.lockReason ? `Locked: ${wt.lockReason}` : 'Locked'}>🔒</span>}
                  {wt.prunable && <span className="worktree-prunable-icon" title="Directory is missing — prunable">⚠️</span>}
                </div>
              );
            })
          )}
        </div>
      )}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}
        >
          {!contextMenu.worktree.isCurrent && (
            <div className="context-menu-item" onClick={() => handleAction('open')}>
              Open in New Tab
            </div>
          )}
          <div className="context-menu-item" onClick={() => handleAction('reveal')}>
            Reveal in File Explorer
          </div>
          <div className="context-menu-separator"></div>
          {contextMenu.worktree.locked ? (
            <div className="context-menu-item" onClick={() => handleAction('unlock')}>
              Unlock
            </div>
          ) : (
            <div className="context-menu-item" onClick={() => handleAction('lock')}>
              Lock
            </div>
          )}
          {!contextMenu.worktree.isMain && (
            <div className="context-menu-item" onClick={() => handleAction('move')}>
              Move...
            </div>
          )}
          {contextMenu.worktree.prunable && (
            <div className="context-menu-item" onClick={() => handleAction('prune')}>
              Prune Missing Worktrees
            </div>
          )}
          {!contextMenu.worktree.isMain && (
            <>
              <div className="context-menu-separator"></div>
              <div className="context-menu-item" onClick={() => handleAction('remove')}>
                Remove...
              </div>
            </>
          )}
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleAction('copy-path')}>
            Copy Path
          </div>
        </div>
      )}
    </div>
  );
}

export default WorktreeList;
