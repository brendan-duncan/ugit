import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
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
  onDiscardAll?: () => Promise<void>;
  onStageAll?: () => Promise<void>;
}

// Flat row representation derived from the tree + expansion state. Replacing
// the recursive renderTree with a flat list lets us cap and/or virtualize
// rendering, which is what keeps the renderer responsive when a huge folder
// gets dumped into the working tree.
type Row =
  | { kind: 'folder'; path: string; depth: number; name: string; expanded: boolean }
  | { kind: 'file'; path: string; depth: number; file: FileInfo };

const RENDER_CAP = 500;
const ROW_HEIGHT = 32;

function FileList({ title, files, onDrop, listType, onSelectFile, selectedFile, repoPath, onContextMenu, onDiscardAll, onStageAll }: FileListProps) {
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<{ [key: string]: boolean }>({});
  const [selectedItems, setSelectedItems] = useState(new Set<string>());
  const [contextMenu, setContextMenu] = useState(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const [showAll, setShowAll] = useState<boolean>(false);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastMouseButton = useRef<number>(0);
  const isDraggingEnabled = useRef<boolean>(false);
  const lastSelectedItem = useRef(null);

  // Build tree structure from files
  const tree = useMemo(() => buildTree(files), [files]);

  // Flatten the tree honoring expandedFolders. This is the single source of
  // truth for both rendering (rowsToRender below) and range selection
  // (getItemsBetween).
  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    const walk = (node: any, parentPath: string, depth: number) => {
      const folderNames = Object.keys(node.children).sort();
      folderNames.forEach(folderName => {
        const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const expanded = expandedFolders[folderPath] !== false;
        result.push({ kind: 'folder', path: folderPath, depth, name: folderName, expanded });
        if (expanded)
          walk(node.children[folderName], folderPath, depth + 1);
      });
      node.files.sort((a: any, b: any) => a.path.localeCompare(b.path)).forEach((file: any) => {
        result.push({ kind: 'file', path: file.path, depth, file });
      });
    };
    walk(tree, '', 0);
    return result;
  }, [tree, expandedFolders]);

  const overCap = rows.length > RENDER_CAP;
  const virtualize = overCap && showAll;
  const cappedRows = overCap && !showAll ? rows.slice(0, RENDER_CAP) : rows;

  // Reset the user's "Show all" choice once the list shrinks back below the
  // cap (e.g. they added the folder to .gitignore). Harmless either way since
  // the non-virtualized path is used whenever we're at/under the cap.
  useEffect(() => {
    if (!overCap && showAll)
      setShowAll(false);
  }, [overCap, showAll]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (headerMenu) {
        const target = e.target as HTMLElement;
        if (!target.closest('.header-menu')) {
          setHeaderMenu(null);
        }
      }
    };

    if (contextMenu || headerMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu, headerMenu]);

  // Track the scrollable container's pixel height so react-window can size its
  // virtual viewport. Only matters when we're actually virtualizing.
  useEffect(() => {
    if (!virtualize) return;
    const el = contentRef.current;
    if (!el) return;
    const update = () => setContentHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualize]);

  // Get all files under a folder path (recursively)
  const getAllFilesInFolder = useCallback((folderPath: string) => {
    return files.filter(file => file.path.startsWith(folderPath + '/'));
  }, [files]);

  // Handle keyboard events for hotkeys
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+A: Select all items in this FileList
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      e.stopPropagation();

      // Select all files in this FileList
      const allPaths = files.map(f => f.path);
      setSelectedItems(new Set(allPaths));
      return;
    }

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
  }, [selectedItems, setSelectedItems, files, onContextMenu, repoPath, listType, getAllFilesInFolder]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  // Display-order list of every path (folders + files). Powers range-select.
  const getAllItemsInOrder = useMemo(() => rows.map(r => r.path), [rows]);

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

  // Render a single row (folder or file). Used by both the capped plain-div
  // path and the react-window virtualized path. `style` is supplied by
  // react-window for absolute positioning; pass-through otherwise.
  const renderRow = (row: Row, style?: React.CSSProperties) => {
    if (row.kind === 'folder') {
      const isFolderSelected = selectedItems.has(row.path);
      return (
        <div
          key={`folder-${row.path}`}
          className={`folder-item ${isFolderSelected ? 'selected' : ''}`}
          style={{ ...style, paddingLeft: `${row.depth * 16}px` }}
          draggable={false}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onDragStart={(e) => handleFolderDragStart(e, row.path)}
          onDragEnd={handleDragEnd}
          onDragOver={handleItemDragOver}
          onClick={(e) => {
            if (e.button === 0) {
              handleItemClick(e, row.path, true);
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                toggleFolder(row.path);
              }
            }
          }}
          onContextMenu={(e) => handleContextMenuOpen(e, row.path, true)}
        >
          <span className="folder-icon">{row.expanded ? '📂' : '📁'}</span>
          <span className="folder-name">{row.name}/</span>
        </div>
      );
    }

    const file = row.file;
    const isFileSelected = selectedItems.has(file.path);
    const fileName = file.path.split('/').pop();
    return (
      <div
        key={`file-${file.path}`}
        className={`file-item ${isFileSelected ? 'selected' : ''} ${file.status === 'conflict' ? 'conflict' : ''}`}
        style={{ ...style, paddingLeft: `${row.depth * 16}px` }}
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
  };

  const VirtualRow = ({ index, style }: ListChildComponentProps) => {
    const row = rows[index];
    if (!row) return null;
    return renderRow(row, style);
  };

  const handleMenuAction = (action: string) => {
    if (onContextMenu && contextMenu) {
      onContextMenu(action, contextMenu.items, contextMenu.clickedItem, repoPath, listType);
    }
    setContextMenu(null);
  };

  return (
    <div
      className="file-list"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={containerRef}
    >
      <div className="file-list-header">
        <h4>{title} ({files.length})</h4>
        {listType === 'unstaged' && (
          <button
            className="header-menu-button"
            onClick={(e) => {
              e.stopPropagation();
              setHeaderMenu({ x: e.clientX, y: e.clientY });
            }}
            title="More actions"
          >
            ...
          </button>
        )}
        {listType === 'staged' && (
          <button
            className="header-menu-button"
            onClick={(e) => {
              e.stopPropagation();
              setHeaderMenu({ x: e.clientX, y: e.clientY });
            }}
            title="More actions"
          >
            ...
          </button>
        )}
      </div>
      {headerMenu && (
        <div
          className="header-menu"
          style={{
            position: 'fixed',
            left: `${headerMenu.x}px`,
            top: `${headerMenu.y}px`,
            zIndex: 1000
          }}
        >
          {onStageAll && (
            <div
              className="context-menu-item"
              onClick={() => {
                onStageAll();
                setHeaderMenu(null);
              }}
            >
              {listType === 'unstaged' ? 'Stage All' : 'Unstage All'}
            </div>
          )}
          {listType === 'unstaged' && onDiscardAll && (
            <>
              <div className="context-menu-separator"></div>
              <div
                className="context-menu-item"
                onClick={() => {
                  onDiscardAll();
                  setHeaderMenu(null);
                }}
              >
                Discard All...
              </div>
            </>
          )}
        </div>
      )}
      <div
        ref={contentRef}
        className={`file-list-content ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div className="file-list-empty">No files</div>
        ) : virtualize ? (
          <FixedSizeList
            height={contentHeight || 1}
            width="100%"
            itemCount={rows.length}
            itemSize={ROW_HEIGHT}
          >
            {VirtualRow}
          </FixedSizeList>
        ) : (
          <div onDragOver={handleItemDragOver}>
            {cappedRows.map(row => renderRow(row))}
            {overCap && !showAll && (
              <div className="file-list-cap-banner">
                <span>
                  {(rows.length - RENDER_CAP).toLocaleString()} more items hidden.
                  If this is from copying a folder you didn't mean to track,
                  consider adding it to .gitignore.
                </span>
                <button
                  type="button"
                  className="file-list-cap-show-all"
                  onClick={() => setShowAll(true)}
                >
                  Show all
                </button>
              </div>
            )}
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
          <div className="context-menu-item" onClick={() => handleMenuAction('open-in-editor')}>
            Open in Editor
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
