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
          return (
            <div
              key={index}
              className={`stash-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectStash && onSelectStash(stash, index)}
            >
              <div className="stash-index">stash@{index}</div>
              <div className="stash-message">{stash.message}</div>
              {stash.hash && (
                <div className="stash-hash">{stash.hash.substring(0, 7)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StashList;
