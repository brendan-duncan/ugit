import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FileInfo } from './types';
import './FileList.css';

// Build tree structure from flat file list
function buildTree(files: Array<{ path: string }>) {
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

function getStatusIcon(status: string): string {
  switch (status) {
    case 'modified': return 'M';
    case 'created': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'conflict': return 'C';
    default: return '?';
  }
}

interface FileListProps {
  title: string;
  files: Array<FileInfo>;
  onDrop: (data: any, sourceList: string, targetList: string) => void;
  listType: 'staged' | 'unstaged';
  onSelectFile: (file: any, listType: string) => void;
  selectedFile: any;
  repoPath: string;
  onContextMenu: (action: string, items: any[], clickedItem: string, contextRepoPath: string, listType: string) => Promise<void>;
}

function FileList({ title, files, onDrop, listType, onSelectFile, selectedFile, repoPath, onContextMenu }: FileListProps) {
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<{ [key: string]: boolean }>({});
  const [selectedItems, setSelectedItems] = useState(new Set<string>());
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lastMouseButton = useRef<number>(0);
  const isDraggingEnabled = useRef<boolean>(false);
  const lastSelectedItem = useRef(null);

  // Build tree structure from files
  const tree = useMemo(() => buildTree(files), [files]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // Handle keyboard events for hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete key for discard
      if (e.key === 'Delete' && selectedItems.size > 0) {
        // Get selected items with their details
        const items = Array.from(selectedItems).map(path => {
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

        // Call discard action if context menu handler is available
        if (onContextMenu && items.length > 0) {
          onContextMenu('discard', items, Array.from(selectedItems)[0], repoPath, listType);
        }
      }
    };

    // Only add keyboard listener when component is focused
    const element = document.querySelector('.file-list');
    if (element) {
      element.addEventListener('keydown', handleKeyDown);
      return () => element.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedItems, files, onContextMenu, repoPath, listType]);

  const toggleFolder = (path: string) => {
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
  const getItemsBetween = (startPath: string, endPath: string) => {
    const startIndex = getAllItemsInOrder.indexOf(startPath);
    const endIndex = getAllItemsInOrder.indexOf(endPath);

    if (startIndex === -1 || endIndex === -1)
      return [];

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    return getAllItemsInOrder.slice(minIndex, maxIndex + 1);
  };

  // Handle item selection (files or folders)
  const handleItemClick = (e: React.MouseEvent, itemPath: string, isFolder: boolean) => {
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
  const handleContextMenuOpen = (e: React.MouseEvent, itemPath: string, isFolder: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    // If right-clicked item is not in selection, replace selection with it
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

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
      clickedItem: itemPath
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    lastMouseButton.current = e.button;

    // Only enable dragging for left-click
    if (e.button === 0) {
      isDraggingEnabled.current = true;
      e.currentTarget.setAttribute('draggable', 'true');
    } else {
      isDraggingEnabled.current = false;
      e.currentTarget.setAttribute('draggable', 'false');
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingEnabled.current = false;
    e.currentTarget.setAttribute('draggable', 'false');
  };

  const handleFileDragStart = (e: React.DragEvent<HTMLDivElement>, file) => {
    // Block drag if not enabled
    if (!isDraggingEnabled.current) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Add dragging class for visual feedback
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    
    // Check if this file is selected and there are multiple selected items
    if (selectedItems.has(file.path) && selectedItems.size > 1) {
      // Get all selected files
      const selectedFiles = Array.from(selectedItems)
        .filter(path => {
          // Only include files (not folders) from selection
          return files.find(f => f.path === path);
        })
        .map(path => files.find(f => f.path === path));
      
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'multiple-files',
        files: selectedFiles,
        sourceList: listType
      }));
    } else {
      // Single file drag
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'file',
        file,
        sourceList: listType
      }));
    }
  };

  const handleFolderDragStart = (e: React.DragEvent<HTMLDivElement>, folderPath: string) => {
    // Block drag if not enabled
    if (!isDraggingEnabled.current) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Add dragging class for visual feedback
    e.currentTarget.classList.add('dragging');
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    
    // Check if this folder is selected and there are multiple selected items
    if (selectedItems.has(folderPath) && selectedItems.size > 1) {
      // Get all selected items (files and folders)
      const selectedData = Array.from(selectedItems).map(path => {
        const file = files.find(f => f.path === path);
        if (file) {
          return { type: 'file', file };
        } else {
          // It's a folder
          const folderFiles = getAllFilesInFolder(path);
          return { type: 'folder', folderPath: path, files: folderFiles };
        }
      });
      
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'multiple-items',
        items: selectedData,
        sourceList: listType
      }));
    } else {
      // Single folder drag
      const folderFiles = getAllFilesInFolder(folderPath);
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'folder',
        folderPath,
        files: folderFiles,
        sourceList: listType
      }));
    }
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    // Remove dragging class when drag ends
    e.currentTarget.classList.remove('dragging');
  };

  const handleItemDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Allow drops over individual items - the panel will handle the actual drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Don't stopPropagation - let it bubble to the panel handler
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.sourceList !== listType && onDrop) {
        if (data.type === 'file') {
          // Single file drop
          onDrop(data.file, data.sourceList, listType);
        } else if (data.type === 'multiple-files') {
          // Multiple files drop - collect all file paths and call once
          onDrop({
            type: 'multiple-files',
            files: data.files,
            sourceList: data.sourceList,
            targetList: listType
          }, data.sourceList, listType);
        } else if (data.type === 'multiple-items') {
          // Multiple items (files and folders) drop - collect all items and call once
          onDrop({
            type: 'multiple-items',
            items: data.items,
            sourceList: data.sourceList,
            targetList: listType
          }, data.sourceList, listType);
        } else if (data.type === 'folder') {
          // Folder drop - pass all files
          onDrop(data, data.sourceList, listType);
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const renderTree = (node: any, path = '', depth = 0) => {
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
    node.files.sort((a: any, b: any) => a.path.localeCompare(b.path)).forEach((file: any, index: number) => {
      const isFileSelected = selectedItems.has(file.path);
      const fileName = file.path.split('/').pop();

      items.push(
        <div
          key={`file-${file.path}-${index}`}
          className={`file-item ${isFileSelected ? 'selected' : ''} ${file.status === 'conflict' ? 'conflict' : ''}`}
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
          <span className={`file-status ${file.status === 'conflict' ? 'conflict' : ''}`}>{getStatusIcon(file.status)}</span>
          <span className="file-path">{fileName}</span>
        </div>
      );
    });

    return items;
  };

  const handleMenuAction = (action: string) => {
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
          <div className="context-menu-item" onClick={() => handleMenuAction('open-in-vscode')}>
            Open in Visual Studio Code
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
            <span>Discard</span>
            <span className="context-menu-hotkey">Del</span>
          </div>
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => handleMenuAction('stash')}>
            Stash
          </div>
          <div className="context-menu-item" onClick={() => handleMenuAction('save-as-patch')}>
            Save as Patch
          </div>
          {listType === 'unstaged' && (
            <>
              <div className="context-menu-separator"></div>
              <div className="context-menu-submenu">
                <div className="context-menu-item context-menu-submenu-header">
                  Ignore
                  <span className="context-menu-submenu-arrow">▶</span>
                </div>
                <div className="context-menu-submenu-content">
                  {contextMenu.items.length === 1 && contextMenu.items[0].type === 'file' && (() => {
                    const fileName = contextMenu.clickedItem.split('/').pop();
                    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : '';
                    return (
                      <>
                        <div className="context-menu-item" onClick={() => handleMenuAction('ignore-file')}>
                          Ignore '{fileName}'
                        </div>
                        {fileExt && (
                          <div className="context-menu-item" onClick={() => handleMenuAction('ignore-extension')}>
                            Ignore All .{fileExt} Files
                          </div>
                        )}
                        <div className="context-menu-separator"></div>
                        <div className="context-menu-item" onClick={() => handleMenuAction('ignore-custom')}>
                          Custom Pattern...
                        </div>
                      </>
                    );
                  })()}
                  {contextMenu.items.length === 1 && contextMenu.items[0].type === 'folder' && (() => {
                    const folderName = contextMenu.clickedItem.split('/').pop();
                    return (
                      <>
                        <div className="context-menu-item" onClick={() => handleMenuAction('ignore-folder')}>
                          Ignore all files in {folderName}
                        </div>
                        <div className="context-menu-separator"></div>
                        <div className="context-menu-item" onClick={() => handleMenuAction('ignore-custom')}>
                          Custom Pattern...
                        </div>
                      </>
                    );
                  })()}
                  {contextMenu.items.length > 1 && (
                    <div className="context-menu-item" onClick={() => handleMenuAction('ignore-custom')}>
                      Custom Pattern...
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
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

export default FileList;
