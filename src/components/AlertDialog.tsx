import React from 'react';
import './Dialog.css';
import './AlertDialog.css';

interface AlertDialogProps {
  message: string;
  title?: string;
  onClose: () => void;
}

function AlertDialog({ message, title = 'Message', onClose }: AlertDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{title}</h3>
        </div>
        <div className="dialog-body">
          <div className="alert-dialog-message">{message}</div>
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

export default AlertDialog;
