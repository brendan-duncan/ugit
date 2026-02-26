import React, { useState, useEffect } from 'react';
import { FileDiff } from './types';
import { GitAdapter } from '../git/GitAdapter';
import { useSettings } from '../contexts/SettingsContext';
import { useAlert } from '../contexts/AlertContext';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { xml } from '@codemirror/lang-xml';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { cpp } from "@codemirror/lang-cpp";
import { csharp } from "@replit/codemirror-lang-csharp";
import { oneDark } from '@codemirror/theme-one-dark';
import * as Diff2Html from 'diff2html';
import * as Diff2HtmlTypes from 'diff2html/lib/types';
import fs from 'fs';
import os from 'os';
import path from 'path';
import 'diff2html/bundles/css/diff2html.min.css';
import './DiffViewer.css';

import { ipcRenderer } from 'electron';

// Helper function to check if file is an image
function isImageFile(filePath: string): boolean {
  if (!filePath)
    return false;
  const imageExtensions = /\.(png|jpg|jpeg|gif|bmp|svg|ico|webp|tiff|tif)$/i;
  return imageExtensions.test(filePath);
}

let _isLightMode = false; // Module-level variable to track light mode for Diff2Html

// Helper function to get CodeMirror language extension based on file extension
function getCodeMirrorLanguage(filePath: string): any[] {
  if (!filePath)
    return [];
  
  const extension = filePath.split('.').pop().toLowerCase();
  
  switch (extension) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mjs':
      return [javascript({ jsx: true, typescript: true })];
    case 'json':
      return [json()];
    case 'py':
      return [python()];
    case 'xml':
    case 'xhtml':
      return [xml()];
    case 'css':
      return [css()];
    case 'html':
    case 'htm':
      return [html({ matchClosingTags: true })];
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'cc':
    case 'cxx':
    case 'c++':
    case 'hh':
    case 'hxx':
      return [cpp()];
    case 'cs':
      return [csharp()];
    default:
      return [];
  }
}

interface DiffChunk {
  fileHeader: string;
  header: string;
  content: string;
  fullDiff: string;
}

function splitDiffIntoChunks(diff: string): DiffChunk[] {
  const lines = diff.split('\n');
  const hunks: DiffChunk[] = [];
  
  // Find the file header lines (---, +++, etc.)
  let fileHeaderEndIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      fileHeaderEndIndex = i;
      break;
    }
  }
  
  const fileHeader = lines.slice(0, fileHeaderEndIndex).join('\n');
  
  // Split by @@ markers
  let currentChunkStart = -1;
  
  for (let i = fileHeaderEndIndex; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      // If we were processing a previous chunk, save it
      if (currentChunkStart !== -1) {
        const chunkLines = lines.slice(currentChunkStart, i);
        hunks.push({
          fileHeader,
          header: chunkLines[0],
          content: chunkLines.slice(1).join('\n'),
          fullDiff: fileHeader + '\n' + chunkLines.join('\n')
        });
      }
      currentChunkStart = i;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunkStart !== -1) {
    const chunkLines = lines.slice(currentChunkStart);
    hunks.push({
      fileHeader,
      header: chunkLines[0],
      content: chunkLines.slice(1).join('\n'),
      fullDiff: fileHeader + '\n' + chunkLines.join('\n')
    });
  }
  
  return hunks;
}

interface DifferenceImageViewerProps {
  originalSrc: string;
  modifiedSrc: string;
}

function DifferenceImageViewer({ originalSrc, modifiedSrc }: DifferenceImageViewerProps): React.ReactElement {
  const [differenceSrc, setDifferenceSrc] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const computeDifference = async () => {
      const originalImg = new Image();
      const modifiedImg = new Image();

      originalImg.src = originalSrc;
      modifiedImg.src = modifiedSrc;

      await new Promise<void>((resolve) => {
        originalImg.onload = () => resolve();
      });

      const width = originalImg.width;
      const height = originalImg.height;

      setDimensions({ width, height });

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.drawImage(originalImg, 0, 0);
      const originalData = ctx.getImageData(0, 0, width, height);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(modifiedImg, 0, 0);
      const modifiedData = ctx.getImageData(0, 0, width, height);

      const diffData = ctx.createImageData(width, height);

      for (let i = 0; i < originalData.data.length; i += 4) {
        const r = Math.abs(originalData.data[i] - modifiedData.data[i]);
        const g = Math.abs(originalData.data[i + 1] - modifiedData.data[i + 1]);
        const b = Math.abs(originalData.data[i + 2] - modifiedData.data[i + 2]);
        const a = Math.max(originalData.data[i + 3], modifiedData.data[i + 3]);

        diffData.data[i] = r;
        diffData.data[i + 1] = g;
        diffData.data[i + 2] = b;
        diffData.data[i + 3] = a;
      }

      ctx.putImageData(diffData, 0, 0);
      setDifferenceSrc(canvas.toDataURL());
    };

    computeDifference();
  }, [originalSrc, modifiedSrc]);

  return (
    <div className="diff-image-difference-container">
      {differenceSrc ? (
        <img src={differenceSrc} alt="Difference" className="diff-image" />
      ) : (
        <div className="diff-loading">Computing difference...</div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

interface DiffViewerProps {
  file: FileDiff;
  gitAdapter: GitAdapter;
  isStaged: boolean;
  showChunkControls?: boolean;
  onRefresh?: () => Promise<void>;
  onError?: (error: string) => void;
}

function DiffViewer({ file, gitAdapter, isStaged, showChunkControls = true, onRefresh, onError }: DiffViewerProps): React.ReactElement {
  const { showAlert, showConfirm } = useAlert();
  const { settings, getSetting } = useSettings();
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [diffHtml, setDiffHtml] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileType, setFileType] = useState<string>(''); // 'text' or 'image'
  const [diffChunks, setDiffChunks] = useState<DiffChunk[]>([]);
  const [hoveredChunkIndex, setHoveredChunkIndex] = useState<number | null>(null);
  const [buttonPosition, setButtonPosition] = useState<{ top: number; left: number } | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<'side-by-side' | 'line-by-line'>(
    getSetting('diffViewMode') || 'line-by-line'
  );
  const [isLightMode, setIsLightMode] = useState<boolean>(getSetting('theme') === 'light');
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [modifiedImageSrc, setModifiedImageSrc] = useState<string | null>(null);
  const [imageDiffMode, setImageDiffMode] = useState<'side-by-side' | 'swipe' | 'difference'>('side-by-side');
  const [swipePosition, setSwipePosition] = useState<number>(50);
  const [conflictSources, setConflictSources] = useState<{ oursLabel: string; theirsLabel: string } | null>(null);
  const [selectedConflictVersion, setSelectedConflictVersion] = useState<'ours' | 'theirs' | null>(null);
  const [mergeToolDropdownOpen, setMergeToolDropdownOpen] = useState<boolean>(false);
  const [conflictResolving, setConflictResolving] = useState<boolean>(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState<boolean>(false);
  const [fileMenuOpen, setFileMenuOpen] = useState<boolean>(false);
  const mergeToolDropdownRef = React.useRef<HTMLDivElement>(null);
  const settingsDropdownRef = React.useRef<HTMLDivElement>(null);
  const fileMenuRef = React.useRef<HTMLDivElement>(null);

  // Apply theme class based on setting
  useEffect(() => {
    const theme = settings?.theme || 'dark';
    setIsLightMode(theme === 'light');
    _isLightMode = theme === 'light'; // Update module-level variable for Diff2Html
  }, [settings?.theme]);

  // Listen for diff view mode changes from menu
  useEffect(() => {
    const handleDiffViewModeChanged = (event: any, mode: 'side-by-side' | 'line-by-line') => {
      setDiffViewMode(mode);
    };

    ipcRenderer.on('diff-view-mode-changed', handleDiffViewModeChanged);

    return () => {
      ipcRenderer.removeListener('diff-view-mode-changed', handleDiffViewModeChanged);
    };
  }, []);

  // Add event listeners for chunk hover
  useEffect(() => {
    const handleChunkHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if hovering over the overlay buttons
      const overlayButtons = target.closest('.chunk-overlay-buttons') as HTMLElement;
      if (overlayButtons) {
        // Don't change anything - keep current hover state
        return;
      }

      const chunkWrapper = target.closest('.diff-chunk-wrapper') as HTMLElement;
      if (chunkWrapper) {
        const chunkIndex = parseInt(chunkWrapper.getAttribute('data-chunk-index') || '-1', 10);
        if (chunkIndex >= 0) {
          setHoveredChunkIndex(chunkIndex);

          // Calculate button position relative to the container
          const container = document.querySelector('.diff2html-container')?.parentElement;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const chunkRect = chunkWrapper.getBoundingClientRect();
            setButtonPosition({
              top: chunkRect.top - containerRect.top + 8,
              left: chunkRect.right - containerRect.left - 200
            });
          }
        }
      } else {
        setHoveredChunkIndex(null);
        setButtonPosition(null);
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const container = target.closest('.diff2html-container');
      const overlayButtons = target.closest('.chunk-overlay-buttons');

      // Only hide if not over container or buttons
      if (!container && !overlayButtons) {
        setHoveredChunkIndex(null);
        setButtonPosition(null);
      }
    };

    const container = document.querySelector('.diff2html-container');
    if (container) {
      container.addEventListener('mouseover', handleChunkHover);
      container.addEventListener('mousemove', handleChunkHover);
      document.addEventListener('mouseover', handleMouseLeave);
      return () => {
        container.removeEventListener('mouseover', handleChunkHover);
        container.removeEventListener('mousemove', handleChunkHover);
        document.removeEventListener('mouseover', handleMouseLeave);
      };
    }
  }, [diffHtml]);

  const handleDiscardChunk = async (chunkIndex: number) => {
    if (chunkIndex < 0 || chunkIndex >= diffChunks.length)
      return;

    const chunk = diffChunks[chunkIndex];
    const confirmed = await showConfirm(
      `Are you sure you want to discard this chunk? This cannot be undone.`
    );

    if (!confirmed)
      return;

    try {
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `chunk-${Date.now()}.patch`);
      fs.writeFileSync(tempFile, chunk.fullDiff, 'utf8');

      await gitAdapter.raw(['apply', '-R', '--unidiff-zero', tempFile]);

      fs.unlinkSync(tempFile);

      console.log(`Discarded chunk ${chunkIndex + 1}`);

      setTimeout(async () => {
        await loadContent();
        if (onRefresh) {
          await onRefresh();
        }
      }, 50);
    } catch (error: any) {
      console.error('Error discarding chunk:', error);
      if (onError) {
        onError(`Failed to discard chunk: ${error.message}`);
      }
    }
  };

  const handleStageChunk = async (chunkIndex: number) => {
    if (chunkIndex < 0 || chunkIndex >= diffChunks.length)
      return;

    const chunk = diffChunks[chunkIndex];

    try {
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `chunk-${Date.now()}.patch`);
      fs.writeFileSync(tempFile, chunk.fullDiff, 'utf8');

      await gitAdapter.raw(['apply', '--cached', tempFile]);

      fs.unlinkSync(tempFile);

      console.log(`Staged chunk ${chunkIndex + 1}`);

      await loadContent();

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error staging chunk:', error);
      if (onError) {
        onError(`Failed to stage chunk: ${error.message}`);
      }
    }
  };

  const handleStageFile = async () => {
    if (!file || !gitAdapter) return;
    setFileMenuOpen(false);
    try {
      await gitAdapter.add(file.path);
      console.log(`Staged file: ${file.path}`);
      if (onRefresh) await onRefresh();
      await loadContent();
    } catch (error: any) {
      console.error('Error staging file:', error);
      if (onError) onError(`Failed to stage file: ${error.message}`);
    }
  };

  const handleUnstageFile = async () => {
    if (!file || !gitAdapter) return;
    setFileMenuOpen(false);
    try {
      await gitAdapter.reset(['HEAD', '--', file.path]);
      console.log(`Unstaged file: ${file.path}`);
      if (onRefresh) await onRefresh();
      await loadContent();
    } catch (error: any) {
      console.error('Error unstaging file:', error);
      if (onError) onError(`Failed to unstage file: ${error.message}`);
    }
  };

  const handleDiscardFile = async () => {
    if (!file || !gitAdapter) return;
    const confirmed = await showConfirm(
      `Are you sure you want to discard all changes to '${file.path}'? This cannot be undone.`
    );
    if (!confirmed) return;
    setFileMenuOpen(false);
    try {
      if (isStaged) {
        await gitAdapter.raw(['checkout', 'HEAD', '--', file.path]);
      } else {
        await gitAdapter.raw(['checkout', '--', file.path]);
      }
      console.log(`Discarded changes to: ${file.path}`);
      if (onRefresh) {
        await onRefresh();
      }
      await loadContent();
    } catch (error: any) {
      console.error('Error discarding file:', error);
      if (onError) onError(`Failed to discard file: ${error.message}`);
    }
  };

  const handleResolveConflictWithVersion = async () => {
    if (!file || selectedConflictVersion === null || !gitAdapter)
      return;
    setConflictResolving(true);
    try {
      await gitAdapter.resolveConflictWithVersion(file.path, selectedConflictVersion);
      if (onRefresh) await onRefresh();
      await loadContent();
    } catch (error: any) {
      if (onError) onError(`Failed to resolve conflict: ${error.message}`);
    } finally {
      setConflictResolving(false);
    }
  };

  const handleRunMergetool = async (tool?: string) => {
    if (!file || !gitAdapter) return;
    setMergeToolDropdownOpen(false);
    setConflictResolving(true);
    try {
      await gitAdapter.runMergetool(file.path, tool);
      setTimeout(async () => {
        if (onRefresh) await onRefresh();
        await loadContent();
      }, 500);
    } catch (error: any) {
      if (onError) onError(`Failed to run merge tool: ${error.message}`);
    } finally {
      setConflictResolving(false);
    }
  };

  const loadContent = async () => {
    if (!file || !gitAdapter) {
      return;
    }

    try {
      setLoading(true);
      setDiff('');
      setDiffHtml('');
      setFileContent('');
      setFileType('');

      if (isImageFile(file.path)) {
        setFileType('image');
        setFileContent(file.path);
        setOriginalImageSrc(null);
        setModifiedImageSrc(null);

        if (file.status === 'modified' || file.status === 'deleted') {
          try {
            const originalContent = await gitAdapter.getFileContentAtRevision('HEAD', file.path);
            if (originalContent && originalContent.length > 0) {
              const extension = file.path.split('.').pop()?.toLowerCase() || 'png';
              const mimeType = extension === 'svg' ? 'image/svg+xml' : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
              const base64 = Buffer.from(originalContent, 'binary').toString('base64');
              setOriginalImageSrc(`data:${mimeType};base64,${base64}`);
            }
          } catch (err) {
            console.error('Error loading original image:', err);
          }

          try {
            const modifiedContent = await gitAdapter.readFileBinary(file.path);
            if (modifiedContent && modifiedContent.length > 0) {
              const extension = file.path.split('.').pop()?.toLowerCase() || 'png';
              const mimeType = extension === 'svg' ? 'image/svg+xml' : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
              const base64 = Buffer.from(modifiedContent, 'binary').toString('base64');
              setModifiedImageSrc(`data:${mimeType};base64,${base64}`);
            }
          } catch (err) {
            console.error('Error loading modified image:', err);
          }
        }

        setLoading(false);
        return;
      }

      let diffResult: string;

      if (file.diff) {
        diffResult = file.diff;
      } else {
        diffResult = await gitAdapter.diff(file.path, isStaged);
      }

      setDiff(diffResult);

      if (!diffResult || diffResult.trim() === '' || diffResult.startsWith('Error loading diff:')) {
        try {
          setFileType('text');
          const content = fs.readFileSync(path.join(gitAdapter.repoPath, file.path), 'utf8');
          setFileContent(content);
        } catch (contentError) {
          console.error(`Error loading ${file.path} content:`, contentError);
          setFileType('none');
          setFileContent(`Error loading '${file.path}' content: ${contentError.message}`);
        }
        setDiffHtml('');
      } else {
        const chunks = splitDiffIntoChunks(diffResult);
        setDiffChunks(chunks);

        const colorScheme = _isLightMode
          ? Diff2HtmlTypes.ColorSchemeType.LIGHT
          : Diff2HtmlTypes.ColorSchemeType.DARK;

        let html = '<div class="diff2html-diff">';
        chunks.forEach((chunk, index) => {
          let chunkHtml = Diff2Html.html(chunk.fullDiff, {
            drawFileList: false,
            outputFormat: diffViewMode,
            matching: 'lines',
            diffStyle: 'word',
            renderNothingWhenEmpty: false,
            colorScheme: colorScheme
          });
          if (index > 0) {
            chunkHtml = chunkHtml.replace('<div class="d2h-file-header">', `<div class="d2h-file-header" style="display: none;">`);
          }
          html += `<div class="diff-chunk-wrapper" data-chunk-index="${index}">${chunkHtml}</div>`;
        });
        html += '</div>';

        setDiffHtml(html);
        setFileType('diff');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading diff:', error);
      setFileType('none');
      setFileContent('Error loading diff: ' + error.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, [file, gitAdapter, isStaged, diffViewMode, isLightMode]);

  // Also reload when file status changes (e.g., after merge resolution)
  useEffect(() => {
    if (file) {
      loadContent();
    }
  }, [file?.status]);

  // Load conflict source labels when viewing a conflicted file
  useEffect(() => {
    if (file?.status === 'conflict' && gitAdapter) {
      gitAdapter.getConflictSources().then((sources) => {
        setConflictSources(sources || null);
        setSelectedConflictVersion(null);
      });
    } else {
      setConflictSources(null);
      setSelectedConflictVersion(null);
    }
  }, [file?.path, file?.status, gitAdapter]);

  // Close merge tool dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mergeToolDropdownRef.current && !mergeToolDropdownRef.current.contains(e.target as Node)) {
        setMergeToolDropdownOpen(false);
      }
    };
    if (mergeToolDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [mergeToolDropdownOpen]);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target as Node)) {
        setSettingsDropdownOpen(false);
      }
    };
    if (settingsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [settingsDropdownOpen]);

  // Close file menu dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    if (fileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [fileMenuOpen]);

  if (!file) {
    return (
      <div className="diff-viewer">
        <div className="diff-empty">Select a file to view diff</div>
      </div>
    );
  }

  const isConflicted = file.status === 'conflict';
  const showConflictControls = isConflicted && conflictSources;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'modified': return { text: 'Modified', color: '#4ec9b0' };
      case 'created': return { text: 'Created', color: '#ce9178' };
      case 'deleted': return { text: 'Deleted', color: '#f14c4c' };
      case 'renamed': return { text: 'Renamed', color: '#dcdcaa' };
      case 'conflict': return { text: 'Conflict', color: '#cca700' };
      default: return { text: status, color: '#cccccc' };
    }
  };

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        <div className="diff-viewer-header-path">
          <span className="diff-viewer-file-icon">📄</span>
          <span className="diff-viewer-file-path">{file.path}</span>
          {showChunkControls && (
            <div className="diff-viewer-file-menu" ref={fileMenuRef}>
              <button
                className="diff-viewer-file-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setFileMenuOpen(!fileMenuOpen);
                }}
                title="File actions"
              >
                ...
              </button>
              {fileMenuOpen && (
                <div className="diff-viewer-file-menu-dropdown">
                  {!isStaged ? (
                    <>
                      <button className="diff-viewer-file-menu-item" onClick={handleStageFile}>
                        Stage
                      </button>
                      <div className="diff-viewer-file-menu-separator" />
                      <button className="diff-viewer-file-menu-item" onClick={handleDiscardFile}>
                        Discard
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="diff-viewer-file-menu-item" onClick={handleUnstageFile}>
                        Unstage
                      </button>
                      <div className="diff-viewer-file-menu-separator" />
                      <button className="diff-viewer-file-menu-item" onClick={handleDiscardFile}>
                        Unstage and Discard
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="diff-viewer-header-right">
          <span 
            className="diff-viewer-status-badge" 
            style={{ backgroundColor: getStatusBadge(file.status).color }}
          >
            {getStatusBadge(file.status).text}
          </span>
          <div className="diff-viewer-settings" ref={settingsDropdownRef}>
            <button
              className="diff-viewer-settings-btn"
              onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
              title="Settings"
            >
              ⚙
            </button>
            {settingsDropdownOpen && (
              <div className="diff-viewer-settings-dropdown">
                <div className="diff-viewer-settings-section">
                  <div className="diff-viewer-settings-label">Diff View Mode</div>
                  <button
                    className={`diff-viewer-settings-option ${diffViewMode === 'line-by-line' ? 'active' : ''}`}
                    onClick={() => {
                      setDiffViewMode('line-by-line');
                      ipcRenderer.invoke('update-setting', 'diffViewMode', 'line-by-line');
                      setSettingsDropdownOpen(false);
                    }}
                  >
                    Line-by-Line
                  </button>
                  <button
                    className={`diff-viewer-settings-option ${diffViewMode === 'side-by-side' ? 'active' : ''}`}
                    onClick={() => {
                      setDiffViewMode('side-by-side');
                      ipcRenderer.invoke('update-setting', 'diffViewMode', 'side-by-side');
                      setSettingsDropdownOpen(false);
                    }}
                  >
                    Side-by-Side
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="diff-content">
        {showConflictControls && (
          <div className="diff-conflict-controls">
            <div className="diff-conflict-header">
              <span className="diff-conflict-warning-icon" title="Merge conflict">⚠</span>
              <span className="diff-conflict-title">Merge conflict</span>
            </div>
            <div className="diff-conflict-filename">
              <span className="diff-conflict-file-icon">📄</span>
              {file.path}
            </div>
            <div className="diff-conflict-file-row">
              <div
                className={`diff-conflict-source ${selectedConflictVersion === 'ours' ? 'selected' : ''}`}
                onClick={() => setSelectedConflictVersion('ours')}
              >
                <span className="diff-conflict-source-icon">⇄</span>
                <span className="diff-conflict-source-label">{conflictSources.oursLabel}</span>
                <span className="diff-conflict-source-badge">modified</span>
                <input
                  type="checkbox"
                  className="diff-conflict-source-checkbox"
                  checked={selectedConflictVersion === 'ours'}
                  onChange={() => setSelectedConflictVersion('ours')}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div
                className={`diff-conflict-source ${selectedConflictVersion === 'theirs' ? 'selected' : ''}`}
                onClick={() => setSelectedConflictVersion('theirs')}
              >
                <input
                  type="checkbox"
                  className="diff-conflict-source-checkbox"
                  checked={selectedConflictVersion === 'theirs'}
                  onChange={() => setSelectedConflictVersion('theirs')}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="diff-conflict-source-icon">⇄</span>
                <span className="diff-conflict-source-label">{conflictSources.theirsLabel}</span>
                <span className="diff-conflict-source-badge">modified</span>
              </div>
            </div>
            <div className="diff-conflict-actions">
              <button
                className="diff-conflict-merge-btn"
                onClick={handleResolveConflictWithVersion}
                disabled={selectedConflictVersion === null || conflictResolving}
                title="Use selected version and mark conflict resolved"
              >
                Merge
              </button>
              <div className="diff-conflict-mergetool-dropdown" ref={mergeToolDropdownRef}>
                <div
                  className="diff-conflict-mergetool-trigger"
                  title="Open in merge tool"
                >
                  <button
                    type="button"
                    disabled={conflictResolving} onClick={() => handleRunMergetool('vscode')}>
                      Merge in VS Code
                  </button> 
                  <button
                    className="diff-conflict-dropdown-arrow"
                    onClick={() => setMergeToolDropdownOpen((v) => !v)}
                    disabled={conflictResolving}
                    title="Open in merge tool"
                  >
                    ▼
                  </button>
                </div>
                {mergeToolDropdownOpen && (
                  <div className="diff-conflict-mergetool-menu">
                    <button type="button" onClick={() => handleRunMergetool('vscode')}>VS Code</button>
                    <button type="button" onClick={() => handleRunMergetool('visualstudio')}>Visual Studio</button>
                    <button type="button" onClick={() => handleRunMergetool('winmerge')}>WinMerge</button>
                    <button type="button" onClick={() => handleRunMergetool('cursor')}>Cursor</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {loading ? (
          <div className="diff-loading">Loading...</div>
        ) : fileType === 'image' ? (
          <div className="diff-image-container">
            {originalImageSrc && modifiedImageSrc ? (
              <>
                {imageDiffMode === 'side-by-side' && (
                  <>
                    <div className="diff-image-panel">
                      <div className="diff-image-label">Original (HEAD)</div>
                      <div className="diff-image-display">
                        <img
                          src={originalImageSrc}
                          alt={`Original ${file.path}`}
                          className="diff-image"
                        />
                      </div>
                    </div>
                    <div className="diff-image-panel">
                      <div className="diff-image-label">Modified (Working)</div>
                      <div className="diff-image-display">
                        <img
                          src={modifiedImageSrc}
                          alt={file.path}
                          className="diff-image"
                        />
                      </div>
                    </div>
                  </>
                )}
                {imageDiffMode === 'swipe' && (
                  <div
                    className="diff-image-swipe-container"
                    onMouseDown={(e) => {
                      const container = e.currentTarget;
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const rect = container.getBoundingClientRect();
                        const x = moveEvent.clientX - rect.left;
                        const percentage = (x / rect.width) * 100;
                        setSwipePosition(Math.max(0, Math.min(100, percentage)));
                      };
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  >
                    <div className="diff-image-swipe-modified">
                      <img src={modifiedImageSrc} alt={file.path} className="diff-image" />
                    </div>
                    <div
                      className="diff-image-swipe-original"
                      style={{ clipPath: `inset(0 ${100 - swipePosition}% 0 0)` }}
                    >
                      <img src={originalImageSrc} alt={`Original ${file.path}`} className="diff-image" />
                    </div>
                    <div
                      className="diff-image-swipe-bar"
                      style={{ left: `${swipePosition}%` }}
                    >
                      <div className="diff-image-swipe-handle" />
                    </div>
                  </div>
                )}
                {imageDiffMode === 'difference' && (
                  <DifferenceImageViewer
                    originalSrc={originalImageSrc}
                    modifiedSrc={modifiedImageSrc}
                  />
                )}
              </>
            ) : (
              <div className="diff-image-display">
                <img
                  src={`file://${gitAdapter.repoPath}/${file.path}`}
                  alt={file.path}
                  className="diff-image"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const nextElement = target.nextElementSibling as HTMLElement;
                    nextElement.style.display = 'block';
                  }}
                />
              </div>
            )}
          </div>
        ) : fileType === 'text' ? (
          <div className="diff-file-content">
            <div className="diff-file-content-display">
              <CodeMirror
                value={fileContent}
                height="100%"
                theme={oneDark}
                extensions={getCodeMirrorLanguage(file.path)}
                editable={false}
                readOnly={true}
              />
            </div>
          </div>
        ) : fileType === 'diff' && diffHtml ? (
          <div style={{ position: 'relative' }}>
            <div
              className="diff2html-container"
              dangerouslySetInnerHTML={{ __html: diffHtml }}
            />
            {showChunkControls &&hoveredChunkIndex !== null && buttonPosition && (
              <div
                className="chunk-overlay-buttons"
                style={{
                  position: 'absolute',
                  top: `${buttonPosition.top}px`,
                  left: `${buttonPosition.left}px`,
                  zIndex: 100
                }}
              >
                <button
                  className="chunk-action-button chunk-stage-button"
                  onClick={() => handleStageChunk(hoveredChunkIndex)}
                  title="Stage this chunk"
                >
                  Stage
                </button>
                <button
                  className="chunk-action-button chunk-discard-button"
                  onClick={() => handleDiscardChunk(hoveredChunkIndex)}
                  title="Discard this chunk"
                >
                  Discard
                </button>
              </div>
            )}
          </div>
        ) : fileContent ? (
          <div className="diff-file-content">
            <div className="diff-file-content-display">
              <CodeMirror
                value={fileContent}
                height="100%"
                theme={oneDark}
                extensions={getCodeMirrorLanguage(file.path)}
                editable={false}
                readOnly={true}
              />
            </div>
          </div>
        ) : (
          <div className="diff-empty">No changes to display</div>
        )}
      </div>
      {fileType === 'image' && originalImageSrc && modifiedImageSrc && (
        <div className="diff-image-mode-selector">
          <button
            className={`diff-image-mode-btn ${imageDiffMode === 'side-by-side' ? 'active' : ''}`}
            onClick={() => setImageDiffMode('side-by-side')}
          >
            Side-by-Side
          </button>
          <button
            className={`diff-image-mode-btn ${imageDiffMode === 'swipe' ? 'active' : ''}`}
            onClick={() => setImageDiffMode('swipe')}
          >
            Swipe
          </button>
          <button
            className={`diff-image-mode-btn ${imageDiffMode === 'difference' ? 'active' : ''}`}
            onClick={() => setImageDiffMode('difference')}
          >
            Difference
          </button>
        </div>
      )}
    </div>
  );
}

export default DiffViewer;
