import React from 'react';
import './PullDialog.css';

export default function RemoteBranchContextMenu({ 
  remoteName, 
  branchName, 
  fullName, 
  currentBranch, 
  isTracking,
  onCheckout, 
  onPull, 
  onMerge, 
  onNewBranch, 
  onNewTag, 
  onDelete, 
  onCopyName,
  onClose,
  position 
}) {
  const handleAction = (action) => {
    switch (action) {
      case 'checkout':
        if (onCheckout)
          onCheckout(fullName);
        break;
      case 'pull':
        if (onPull)
          onPull(fullName, currentBranch);
        break;
      case 'merge':
        if (onMerge && !isTracking)
          onMerge(fullName, currentBranch);
        break;
      case 'new-branch':
        if (onNewBranch)
          onNewBranch(fullName);
        break;
      case 'new-tag':
        if (onNewTag)
          onNewTag(fullName);
        break;
      case 'delete':
        if (onDelete)
          onDelete(fullName);
        break;
      case 'copy-name':
        if (onCopyName)
          onCopyName(fullName);
        break;
    }
    if (onClose)
      onClose();
  };

  // Format strings with substitutions
  const checkoutText = `Check out '${fullName}'`;
  const pullText = `Pull '${fullName}' into '${currentBranch}'`;
  const mergeText = `Merge '${fullName}' into '${currentBranch}'`;
  const deleteText = `Delete '${fullName}'...`;

  return (
    <div className="context-menu" style={{ left: position.x, top: position.y }}>
      <div className="context-menu-item" onClick={() => handleAction('checkout')}>
        {checkoutText}
      </div>
      <div className="context-menu-item" onClick={() => handleAction('pull')}>
        {pullText}
      </div>
      <div 
        className={`context-menu-item ${isTracking ? 'disabled' : ''}`}
        onClick={() => handleAction('merge')}
      >
        {mergeText}
      </div>
      <div className="context-menu-separator"></div>
      <div className="context-menu-item" onClick={() => handleAction('new-branch')}>
        New Branch...
      </div>
      <div className="context-menu-item" onClick={() => handleAction('new-tag')}>
        New Tag...
      </div>
      <div className="context-menu-separator"></div>
      <div className="context-menu-item" onClick={() => handleAction('delete')}>
        {deleteText}
      </div>
      <div className="context-menu-item" onClick={() => handleAction('copy-name')}>
        Copy Branch Name
      </div>
    </div>
  );
}