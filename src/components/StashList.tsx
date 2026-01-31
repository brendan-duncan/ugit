import React, { useState } from 'react';
import { StashInfo } from '../git/GitAdapter';
import { SelectedItem } from './types';
import './StashList.css';

interface StashListProps {
  stashes: Array<StashInfo>;
  onSelectStash: (item: SelectedItem) => void;
  selectedItem: SelectedItem | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStashContextMenu: (action: string, stash: StashInfo, stashIndex: number) => void;
}

function StashList({ stashes, onSelectStash, selectedItem, collapsed, onToggleCollapse, onStashContextMenu }: StashListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stash: StashInfo; index: number } | null>(null);

  const handleStashContextMenu = (e: React.MouseEvent, stash: StashInfo, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: rect.left,
      y: rect.top + rect.height,
      stash,
      index
    });
  };

  const handleContextMenuAction = (action: string) => {
    if (onStashContextMenu && contextMenu) {
      onStashContextMenu(action, contextMenu.stash, contextMenu.index);
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
  if (!stashes || stashes.length === 0) {
    return (
      <div className="stash-list">
        <div className="panel-header">
          <h3>Stashes</h3>
          <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? '▶' : '▼'}
          </button>
        </div>
        {!collapsed && <div className="stash-list-empty">No stashes found</div>}
      </div>
    );
  }

  return (
    <div className="stash-list">
      <div className="panel-header">
        <h3>Stashes</h3>
        <button className="collapse-button" onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      {!collapsed && (
        <div className="stash-list-content">
          {stashes.map((stash: StashInfo, index: number) => {
            const isSelected = selectedItem &&
                             selectedItem.type === 'stash' &&
                             selectedItem.index === index;
            // Strip "On <branch>: " prefix from message
            const displayMessage = stash.message.replace(/^On [^:]+:\s*/, '');
            return (
              <div
                key={index}
                className={`stash-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectStash && onSelectStash({type: 'stash', index, stash})}
                onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => handleStashContextMenu(e, stash, index)}
              >
                <span className="stash-item-icon">🗂️</span>
                <span className="stash-message">{displayMessage}</span>
              </div>
            );
          })}
        </div>
      )}
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
          <div className="context-menu-item" onClick={() => handleContextMenuAction('apply')}>
            Apply '{contextMenu.stash.message.replace(/^On [^:]+:\s*/, '')}'...
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('rename')}>
            Rename '{contextMenu.stash.message.replace(/^On [^:]+:\s*/, '')}'...
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('delete')}>
            Delete '{contextMenu.stash.message.replace(/^On [^:]+:\s*/, '')}'...
          </div>
        </div>
      )}
    </div>
  );
}

export default StashList;
