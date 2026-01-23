import React from 'react';
import './ChangesList.css';

function ChangesList({ modifiedCount, selectedItem, onSelectItem }) {
  const isSelected = selectedItem && selectedItem.type === 'local-changes';

  return (
    <div className="changes-list">
      <h3>Changes</h3>
      <div
        className={`changes-item ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelectItem({ type: 'local-changes' })}
      >
        <span className="changes-icon">📝</span>
        <span className="changes-label">Local Changes ({modifiedCount})</span>
      </div>
    </div>
  );
}

export default ChangesList;
