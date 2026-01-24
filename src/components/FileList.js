import React, { useState, useMemo, useRef, useEffect } from 'react';
import './FileList.css';

// Build tree structure from flat file list
function buildTree(files) {
  const root = { children: {}, files: [] };

  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;

    // Navigate/create folder structure
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.children[part]) {
        current.children[part] = { children: {}, files: [] };
      }
      current = current.children[part];
    }

    // Add file to the final folder
    current.files.push(file);
  });

  return root;
}

function FileList({
  title,
  files,
  onDrop,
  listType,
  onSelectFile,
  selectedFile,
  repoPath,
  onContextMenu
}) {
  const [dragOver, setDragOver] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const lastMouseButton = useRef(0);
  const isDraggingEnabled = useRef(false);
  const lastSelectedItem = useRef(null);

  console.log('FileList component rendered');

  // Build tree structure from files
  const tree = useMemo(() => buildTree(files), [files]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  // Get all files under a folder path (recursively)
  const getAllFilesInFolder = (folderPath) => {
    return files.filter(file => file.path.startsWith(folderPath + '/'));
  };

  // Get all items (files and folders) in display order
  const getAllItemsInOrder = useMemo(() => {
    const items = [];

    const traverse = (node, path = '') => {
      // Get folders first
      const folderNames = Object.keys(node.children).sort();
      folderNames.forEach(folderName => {
        const folderPath = path ? `${path}/${folderName}` : folderName;
        items.push(folderPath);

        // If folder is expanded, traverse its children
        if (expandedFolders[folderPath] !== false) {
          traverse(node.children[folderName], folderPath);
        }
      });

      // Then files
      node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach(file => {
        items.push(file.path);
      });
    };

    traverse(tree);
    return items;
  }, [tree, expandedFolders]);

  // Get items between two paths (inclusive)
  const getItemsBetween = (startPath, endPath) => {
    const startIndex = getAllItemsInOrder.indexOf(startPath);
    const endIndex = getAllItemsInOrder.indexOf(endPath);

    if (startIndex === -1 || endIndex === -1) return [];

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    return getAllItemsInOrder.slice(minIndex, maxIndex + 1);
  };

  // Handle item selection (files or folders)
  const handleItemClick = (e, itemPath, isFolder) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedItem.current) {
      // Shift-click: Select range
      const itemsInRange = getItemsBetween(lastSelectedItem.current, itemPath);

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Shift: Add range to selection
        setSelectedItems(prev => {
          const newSet = new Set(prev);
          itemsInRange.forEach(item => newSet.add(item));
          return newSet;
        });
      } else {
        // Shift only: Replace selection with range
        setSelectedItems(new Set(itemsInRange));
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl-click: Toggle selection
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(itemPath)) {
          newSet.delete(itemPath);
        } else {
          newSet.add(itemPath);
        }
        return newSet;
      });
      lastSelectedItem.current = itemPath;
    } else {
      // Normal click: Replace selection
      setSelectedItems(new Set([itemPath]));
      lastSelectedItem.current = itemPath;
    }

    // If it's a file, also call the onSelectFile handler for the diff viewer
    if (!isFolder && onSelectFile) {
      const file = files.find(f => f.path === itemPath);
      if (file) {
        onSelectFile(file, listType);
      }
    }
  };

  // Handle context menu
  const handleContextMenuOpen = (e, itemPath, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('Context menu opening for:', itemPath, 'at', e.clientX, e.clientY);

    // If the right-clicked item is not in the selection, replace selection with it
    const currentSelection = selectedItems.has(itemPath) ? selectedItems : new Set([itemPath]);
    if (!selectedItems.has(itemPath)) {
      setSelectedItems(currentSelection);
    }

    // Get all selected items with their details
    const items = Array.from(currentSelection).map(path => {
      // Check if it's a folder or file
      const file = files.find(f => f.path === path);
      if (file) {
        return { type: 'file', path, file };
      } else {
        // It's a folder
        const folderFiles = getAllFilesInFolder(path);
        return { type: 'folder', path, files: folderFiles };
      }
    });

    console.log('Setting context menu with items:', items);

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
      clickedItem: itemPath
    });
  };

  const handleMouseDown = (e) => {
    console.log('>>> MouseDown event - button:', e.button, 'target:', e.currentTarget.className);
    lastMouseButton.current = e.button;

    // Only enable dragging for left-click
    if (e.button === 0) {
      console.log('>>> Left-click detected, enabling drag');
      isDraggingEnabled.current = true;
      e.currentTarget.setAttribute('draggable', 'true');
    } else {
      console.log('>>> Non-left-click detected, disabling drag');
      isDraggingEnabled.current = false;
      e.currentTarget.setAttribute('draggable', 'false');
    }
  };

  const handleMouseUp = (e) => {
    console.log('>>> MouseUp event');
    isDraggingEnabled.current = false;
    e.currentTarget.setAttribute('draggable', 'false');
  };

  const handleFileDragStart = (e, file) => {
    console.log('>>> FileDragStart event - isDraggingEnabled:', isDraggingEnabled.current);
    // Block drag if not enabled
    if (!isDraggingEnabled.current) {
      console.log('>>> BLOCKING drag - not enabled');
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    console.log('>>> Allowing file drag');
    // Add dragging class for visual feedback
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'file',
      file,
      sourceList: listType
    }));
  };

  const handleFolderDragStart = (e, folderPath) => {
    console.log('>>> FolderDragStart event - isDraggingEnabled:', isDraggingEnabled.current);
    // Block drag if not enabled
    if (!isDraggingEnabled.current) {
      console.log('>>> BLOCKING drag - not enabled');
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    console.log('>>> Allowing folder drag');
    // Add dragging class for visual feedback
    e.currentTarget.classList.add('dragging');
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    const folderFiles = getAllFilesInFolder(folderPath);
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'folder',
      folderPath,
      files: folderFiles,
      sourceList: listType
    }));
  };

  const handleDragEnd = (e) => {
    // Remove dragging class when drag ends
    e.currentTarget.classList.remove('dragging');
  };

  const handleItemDragOver = (e) => {
    // Allow drops over individual items - the panel will handle the actual drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Don't stopPropagation - let it bubble to the panel handler
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.sourceList !== listType && onDrop) {
        if (data.type === 'file') {
          // Single file drop
          onDrop(data.file, data.sourceList, listType);
        } else if (data.type === 'folder') {
          // Folder drop - pass all files
          onDrop(data, data.sourceList, listType);
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const renderTree = (node, path = '', depth = 0) => {
    const items = [];

    // Render folders
    const folderNames = Object.keys(node.children).sort();
    folderNames.forEach(folderName => {
      const folderPath = path ? `${path}/${folderName}` : folderName;
      const isExpanded = expandedFolders[folderPath] !== false; // Default to expanded

      const isFolderSelected = selectedItems.has(folderPath);

      items.push(
        <div key={`folder-${folderPath}`} onDragOver={handleItemDragOver}>
          <div
            className={`folder-item ${isFolderSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${depth * 16}px` }}
            draggable={false}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onDragStart={(e) => handleFolderDragStart(e, folderPath)}
            onDragEnd={handleDragEnd}
            onDragOver={handleItemDragOver}
            onClick={(e) => {
              if (e.button === 0) {
                // Handle selection
                handleItemClick(e, folderPath, true);
                // Toggle folder if not using modifiers (including shift for range selection)
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  toggleFolder(folderPath);
                }
              }
            }}
            onContextMenu={(e) => handleContextMenuOpen(e, folderPath, true)}
          >
            <span className="folder-icon">{isExpanded ? '📂' : '📁'}</span>
            <span className="folder-name">{folderName}/</span>
          </div>
          {isExpanded && renderTree(node.children[folderName], folderPath, depth + 1)}
        </div>
      );
    });

    // Render files in current folder
    node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach((file, index) => {
      const isFileSelected = selectedItems.has(file.path);
      const fileName = file.path.split('/').pop();

      items.push(
        <div
          key={`file-${file.path}-${index}`}
          className={`file-item ${isFileSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 16}px` }}
          draggable={false}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onDragStart={(e) => handleFileDragStart(e, file)}
          onDragEnd={handleDragEnd}
          onDragOver={handleItemDragOver}
          onClick={(e) => handleItemClick(e, file.path, false)}
          onContextMenu={(e) => handleContextMenuOpen(e, file.path, false)}
        >
          <span className="file-status">{getStatusIcon(file.status)}</span>
          <span className="file-path">{fileName}</span>
        </div>
      );
    });

    return items;
  };

  const handleMenuAction = (action) => {
    if (onContextMenu && contextMenu) {
      onContextMenu(action, contextMenu.items, contextMenu.clickedItem, repoPath, listType);
    }
    setContextMenu(null);
  };

  return (
    <div className="file-list">
      <h4>{title} ({files.length})</h4>
      <div
        className={`file-list-content ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div className="file-list-empty">No files</div>
        ) : (
          <div onDragOver={handleItemDragOver}>
            {renderTree(tree)}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 1000
          }}
        >
          <div className="context-menu-item" onClick={() => handleMenuAction('show-in-explorer')}>
            Show in File Explorer
          </div>
          <div className="context-menu-separator"></div>
          {listType === 'unstaged' && (
            <div className="context-menu-item" onClick={() => handleMenuAction('stage')}>
              Stage
            </div>
          )}
          {listType === 'staged' && (
            <div className="context-menu-item" onClick={() => handleMenuAction('unstage')}>
              Unstage
            </div>
          )}
          <div className="context-menu-item" onClick={() => handleMenuAction('discard')}>
            Discard
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('stash')}>
            Stash
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('save-as-patch')}>
            Save as Patch
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('copy-path')}>
            Copy Path
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('copy-full-path')}>
            Copy Full Path
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusIcon(status) {
  switch (status) {
    case 'modified': return 'M';
    case 'created': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    default: return '?';
  }
}

export default FileList;
