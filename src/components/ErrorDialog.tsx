import React, { useEffect } from 'react';
import './ErrorDialog.css';

interface ErrorDialogProps {
  error: string;
  onClose: () => void;
}

function ErrorDialog({ error, onClose }: ErrorDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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