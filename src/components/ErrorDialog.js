import React from 'react';
import './ErrorDialog.css';

function ErrorDialog({ error, onClose }) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Error</h3>
        </div>
        <div className="dialog-body">
          <div className="error-message">{error}</div>
        </div>
        <div className="dialog-footer">
          <button className="dialog-button dialog-button-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorDialog;