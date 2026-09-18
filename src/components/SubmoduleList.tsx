import React, { useEffect, useState } from 'react';
import { SubmoduleInfo } from '../git/GitAdapter';
import './SubmoduleList.css';

interface SubmoduleListProps {
  submodules: Array<SubmoduleInfo>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Open a submodule's working directory as its own tab.
  onOpenSubmodule: (submodulePath: string) => void;
  // 'init' | 'update' | 'update-recursive' | 'sync' | 'reveal' | 'copy-path' |
  // 'update-all' | 'sync-all', with the submodule the action applies to.
  onSubmoduleAction: (action: string, submodule: SubmoduleInfo | null) => void;
}

function SubmoduleList({ submodules, collapsed, onToggleCollapse, onOpenSubmodule, onSubmoduleAction }: SubmoduleListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; submodule: SubmoduleInfo } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, submodule: SubmoduleInfo) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.top + rect.height, submodule });
  };

  const handleAction = (action: string) => {
    if (contextMenu)
      onSubmoduleAction(action, contextMenu.submodule);
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
    <div className="submodule-list">
      <div className="panel-header">
        <h3>Submodules</h3>
        <div className="panel-header-buttons">
          <button
            className="add-button"
            onClick={() => onSubmoduleAction('update-all', null)}
            title="Update all submodules to the recorded commits"
          >
            <span>⟳</span>
          </button>
          <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="submodule-list-content">
          {(!submodules || submodules.length === 0) ? (
            <div className="submodule-list-empty">No submodules</div>
          ) : (
            submodules.map((submodule) => (
              <div
                key={submodule.path}
                className={`submodule-item ${submodule.initialized ? '' : 'uninitialized'} ${submodule.modified ? 'modified' : ''}`}
                title={`${submodule.path}\n${submodule.url}${submodule.branch ? `\nbranch: ${submodule.branch}` : ''}`}
                onDoubleClick={() => { if (submodule.initialized) onOpenSubmodule(submodule.path); }}
                onContextMenu={(e) => handleContextMenu(e, submodule)}
              >
                <span className="submodule-icon">📦</span>
                <span className="submodule-path">{submodule.path}</span>
                {submodule.describe && <span className="submodule-describe">{submodule.describe}</span>}
                <span className="submodule-hash">{submodule.hash ? submodule.hash.slice(0, 7) : ''}</span>
                {!submodule.initialized && (
                  <span className="submodule-badge" title="Not initialized - nothing checked out yet">not init</span>
                )}
                {submodule.modified && (
                  <span className="submodule-badge modified-badge" title="Checked out at a different commit than the one recorded">
                    moved
                  </span>
                )}
                {submodule.conflicted && (
                  <span className="submodule-badge conflict-badge" title="Merge conflict in this submodule">conflict</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}
        >
          {contextMenu.submodule.initialized && (
            <div className="context-menu-item" onClick={() => handleAction('open')}>
              Open in New Tab
            </div>
          )}
          <div className="context-menu-item" onClick={() => handleAction('update')}>
            {contextMenu.submodule.initialized ? 'Update' : 'Initialize and Update'}
          </div>
          <div className="context-menu-item" onClick={() => handleAction('update-recursive')}>
            Update Recursively
          </div>
          <div className="context-menu-item" onClick={() => handleAction('sync')}>
            Sync URL from .gitmodules
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleAction('reveal')}>
            Show in File Explorer
          </div>
          <div className="context-menu-item" onClick={() => handleAction('copy-path')}>
            Copy Path
          </div>
        </div>
      )}
    </div>
  );
}

export default SubmoduleList;
