import React from 'react';
import './DeleteStashDialog.css';

function DeleteStashDialog({ onClose, onDelete, stashMessage, stashIndex }) {
  const handleDelete = () => {
    onDelete(stashIndex);
  };

  // Strip "On <branch>: " prefix from message for cleaner display
  const displayMessage = stashMessage.replace(/^On [^:]+:\s*/, '');

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Delete Stash</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <div style={{ 
              fontSize: '0.9rem', 
              color: '#cccccc',
              marginBottom: '16px'
            }}>
              Delete stash from your repository
            </div>
          </div>
          
          <div className="dialog-field">
            <div style={{ 
              fontSize: '0.9rem', 
              color: '#cccccc',
              fontWeight: 'bold'
            }}>
              Stash: {displayMessage}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={handleDelete}>
            Delete
          </button>
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteStashDialog;