import React from 'react';
import './StashList.css';

function StashList({ stashes, onSelectStash, selectedItem }) {
  if (!stashes || stashes.length === 0) {
    return (
      <div className="stash-list">
        <h3>Stashes</h3>
        <div className="stash-list-empty">No stashes found</div>
      </div>
    );
  }

  return (
    <div className="stash-list">
      <h3>Stashes</h3>
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
              <div className="stash-message">{displayMessage}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StashList;
