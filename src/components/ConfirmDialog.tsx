import React from 'react';
import './Dialog.css';
import './AlertDialog.css';

interface ConfirmDialogProps {
  message: string;
  title?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, title = 'Confirm', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{title}</h3>
        </div>
        <div className="dialog-body">
          <div className="alert-dialog-message">{message}</div>
        </div>
        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="dialog-button dialog-button-primary" onClick={onConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
