import React, { useState, useEffect } from 'react';
import './CloneDialog.css';

const PARENT_FOLDER_KEY = 'ugit-clone-parent-folder';

function CloneDialog({ onClose, onClone }) {
  const [repoUrl, setRepoUrl] = useState('');
  const [parentFolder, setParentFolder] = useState('');
  const [repoName, setRepoName] = useState('');
  const [loading, setLoading] = useState(false);

// Load saved parent folder on mount
  useEffect(() => {
    const savedParentFolder = localStorage.getItem(PARENT_FOLDER_KEY);
    if (savedParentFolder) {
      setParentFolder(savedParentFolder);
    }
  }, []);

  // Auto-fill URL from clipboard on mount
  useEffect(() => {
    const tryReadClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        // Check if clipboard content looks like a git URL
        if (text && (text.startsWith('http') || text.startsWith('git@') || text.includes('://'))) {
          setRepoUrl(text);
          // Try to extract repo name from URL
          const urlParts = text.split('/');
          const lastPart = urlParts[urlParts.length - 1];
          if (lastPart.endsWith('.git')) {
            setRepoName(lastPart.replace('.git', ''));
          } else if (lastPart) {
            setRepoName(lastPart);
          }
        }
      } catch (error) {
        // Clipboard access failed, ignore
        console.log('Clipboard access not available:', error);
      }
    };
    tryReadClipboard();
  }, []);

  // Save parent folder when it changes
  useEffect(() => {
    if (parentFolder) {
      localStorage.setItem(PARENT_FOLDER_KEY, parentFolder);
    }
  }, [parentFolder]);

  // Update name field when URL changes
  useEffect(() => {
    // Extract repository name from URL
    const extractRepoName = (url) => {
      try {
        // Handle different URL formats
        let cleanUrl = url.trim();
        
        // Remove .git suffix if present
        if (cleanUrl.endsWith('.git')) {
          cleanUrl = cleanUrl.slice(0, -4);
        }
        
        // Split by / and get last part
        const parts = cleanUrl.split('/');
        const lastPart = parts[parts.length - 1];
        
        // Handle git@ URLs (remove domain part)
        if (url.startsWith('git@')) {
          const colonIndex = lastPart.indexOf(':');
          if (colonIndex !== -1) {
            return lastPart.substring(colonIndex + 1);
          }
        }
        
        return lastPart || '';
      } catch (error) {
        console.warn('Error extracting repo name from URL:', error);
        return '';
      }
    };
    
    if (repoUrl) {
      const extractedName = extractRepoName(repoUrl);
      // Always replace name field when URL field is edited
      setRepoName(extractedName);
    }
  }, [repoUrl]);

  // Handle Escape key for cancel
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBrowseFolder = async () => {
    const { ipcRenderer } = window.require('electron');
    try {
      const result = await ipcRenderer.invoke('show-open-dialog', {
        properties: ['openDirectory'],
        title: 'Select Parent Folder'
      });
      if (!result.canceled && result.filePaths.length > 0) {
        setParentFolder(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error browsing folder:', error);
    }
  };

  const handleClone = async () => {
    if (!repoUrl.trim() || !parentFolder.trim() || !repoName.trim()) {
      return;
    }

    setLoading(true);
    try {
      await onClone(repoUrl.trim(), parentFolder.trim(), repoName.trim());
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = repoUrl.trim() && parentFolder.trim() && repoName.trim();

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Clone</h3>
        </div>

        <div className="dialog-body">
          <div className="dialog-message">
            Clone remote repository into a local folder
          </div>

          <div className="dialog-field">
            <label htmlFor="repo-url">Repository Url:</label>
            <input
              id="repo-url"
              type="text"
              className="dialog-input"
              placeholder="Git Repository Url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>

          <div className="dialog-field">
            <label htmlFor="parent-folder">Parent Folder:</label>
            <div className="dialog-field-horizontal">
              <input
                id="parent-folder"
                type="text"
                className="dialog-input"
                placeholder="Select parent folder"
                value={parentFolder}
                onChange={(e) => setParentFolder(e.target.value)}
              />
              <button
                type="button"
                className="dialog-button dialog-button-browse"
                onClick={handleBrowseFolder}
              >
                Browse...
              </button>
            </div>
          </div>

          <div className="dialog-field">
            <label htmlFor="repo-name">Name:</label>
            <input
              id="repo-name"
              type="text"
              className="dialog-input"
              placeholder="Repository name"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button className="dialog-button dialog-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="dialog-button dialog-button-primary" 
            onClick={handleClone}
            disabled={!isFormValid || loading}
          >
            {loading ? 'Cloning...' : 'Clone'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CloneDialog;