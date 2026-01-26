import React from 'react';
import './StashList.css';

function StashList({ stashes, onSelectStash, selectedItem, collapsed, onToggleCollapse }) {
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
          {stashes.map((stash, index) => {
            const isSelected = selectedItem &&
                             selectedItem.type === 'stash' &&
                             selectedItem.index === index;
            // Strip "On <branch>: " prefix from message
            const displayMessage = stash.message.replace(/^On [^:]+:\s*/, '');
            return (
              <div
                key={index}
                className={`stash-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectStash && onSelectStash(stash, index)}
              >
                <span className="stash-item-icon">🗂️</span>
                <span className="stash-message">{displayMessage}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StashList;
