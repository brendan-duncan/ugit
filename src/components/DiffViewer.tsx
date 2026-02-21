import React, { useState, useEffect } from 'react';
import { FileDiff } from './types';
import { GitAdapter } from '../git/GitAdapter';
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
import { useSettings } from '../hooks/useSettings';
import { useAlert } from '../contexts/AlertContext';
import { ipcRenderer } from 'electron';

// Helper function to check if file is an image
function isImageFile(filePath: string): boolean {
  if (!filePath)
    return false;
  const imageExtensions = /\.(png|jpg|jpeg|gif|bmp|svg|ico|webp|tiff|tif)$/i;
  return imageExtensions.test(filePath);
}

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

interface DiffHunk {
  fileHeader: string;
  header: string;
  content: string;
  fullDiff: string;
}

function splitDiffIntoHunks(diff: string): DiffHunk[] {
  const lines = diff.split('\n');
  const hunks: DiffHunk[] = [];
  
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
  let currentHunkStart = -1;
  
  for (let i = fileHeaderEndIndex; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      // If we were processing a previous hunk, save it
      if (currentHunkStart !== -1) {
        const hunkLines = lines.slice(currentHunkStart, i);
        hunks.push({
          fileHeader,
          header: hunkLines[0],
          content: hunkLines.slice(1).join('\n'),
          fullDiff: fileHeader + '\n' + hunkLines.join('\n')
        });
      }
      currentHunkStart = i;
    }
  }
  
  // Don't forget the last hunk
  if (currentHunkStart !== -1) {
    const hunkLines = lines.slice(currentHunkStart);
    hunks.push({
      fileHeader,
      header: hunkLines[0],
      content: hunkLines.slice(1).join('\n'),
      fullDiff: fileHeader + '\n' + hunkLines.join('\n')
    });
  }
  
  return hunks;
}

interface DiffViewerProps {
  file: FileDiff;
  gitAdapter: GitAdapter;
  isStaged: boolean;
  onRefresh?: () => Promise<void>;
  onError?: (error: string) => void;
}

function DiffViewer({ file, gitAdapter, isStaged, onRefresh, onError }: DiffViewerProps): React.ReactElement {
  const { showAlert, showConfirm } = useAlert();
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [diffHtml, setDiffHtml] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileType, setFileType] = useState<string>(''); // 'text' or 'image'
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [hoveredChunkIndex, setHoveredChunkIndex] = useState<number | null>(null);
  const [buttonPosition, setButtonPosition] = useState<{ top: number; left: number } | null>(null);
  const { getSetting } = useSettings();
  const [diffViewMode, setDiffViewMode] = useState<'side-by-side' | 'line-by-line'>(
    getSetting('diffViewMode') || 'line-by-line'
  );
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);

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
    if (chunkIndex < 0 || chunkIndex >= diffHunks.length)
      return;

    const chunk = diffHunks[chunkIndex];
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
    if (chunkIndex < 0 || chunkIndex >= diffHunks.length)
      return;

    const chunk = diffHunks[chunkIndex];

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

        if (file.status === 'modified' || file.status === 'deleted') {
          try {
            const originalContent = await gitAdapter.getFileContentAtRevision('HEAD', file.path);
            console.log('Original image content length:', originalContent?.length);
            if (originalContent && originalContent.length > 0) {
              const extension = file.path.split('.').pop()?.toLowerCase() || 'png';
              const mimeType = extension === 'svg' ? 'image/svg+xml' : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
              const base64 = Buffer.from(originalContent, 'binary').toString('base64');
              console.log('Base64 length:', base64.length);
              setOriginalImageSrc(`data:${mimeType};base64,${base64}`);
            }
          } catch (err) {
            console.error('Error loading original image:', err);
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
        const hunks = splitDiffIntoHunks(diffResult);
        setDiffHunks(hunks);

        let html = '<div class="diff2html-diff">';
        hunks.forEach((hunk, index) => {
          let hunkHtml = Diff2Html.html(hunk.fullDiff, {
            drawFileList: false,
            outputFormat: diffViewMode,
            matching: 'lines',
            diffStyle: 'word',
            renderNothingWhenEmpty: false,
            colorScheme: Diff2HtmlTypes.ColorSchemeType.DARK
          });
          if (index > 0) {
            hunkHtml = hunkHtml.replace('<div class="d2h-file-header">', `<div class="d2h-file-header" style="display: none;">`);
          }
          html += `<div class="diff-chunk-wrapper" data-chunk-index="${index}">${hunkHtml}</div>`;
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
  }, [file, gitAdapter, isStaged, diffViewMode]);

  if (!file) {
    return (
      <div className="diff-viewer">
        <div className="diff-empty">Select a file to view diff</div>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      <div className="diff-content">
        {loading ? (
          <div className="diff-loading">Loading...</div>
        ) : fileType === 'image' ? (
          <div className="diff-image-container">
            {originalImageSrc ? (
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
                </div>
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
            {hoveredChunkIndex !== null && buttonPosition && (
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
    </div>
  );
}

export default DiffViewer;
