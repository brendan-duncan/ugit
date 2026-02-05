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
import './DiffViewer.css';
import 'diff2html/bundles/css/diff2html.min.css';

// Helper function to check if file is an image
function isImageFile(filePath: string): boolean {
  if (!filePath) return false;
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
}

function DiffViewer({ file, gitAdapter, isStaged, onRefresh }: DiffViewerProps): React.ReactElement {
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [diffHtml, setDiffHtml] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileType, setFileType] = useState<string>(''); // 'text' or 'image'
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [hoveredChunkIndex, setHoveredChunkIndex] = useState<number | null>(null);
  const [buttonPosition, setButtonPosition] = useState<{ top: number; left: number } | null>(null);

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
    const confirmed = window.confirm(
      `Are you sure you want to discard this chunk? This cannot be undone.`
    );

    if (!confirmed)
      return;

    try {
      // Create a temporary file with the chunk's diff
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `chunk-${Date.now()}.patch`);
      fs.writeFileSync(tempFile, chunk.fullDiff, 'utf8');

      // Apply reverse patch
      await gitAdapter.raw(['apply', '--reverse', '--unidiff-zero', tempFile]);

      // Clean up temp file
      fs.unlinkSync(tempFile);

      console.log(`Discarded chunk ${chunkIndex + 1}`);

      // Refresh the diff
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error discarding chunk:', error);
      alert(`Failed to discard chunk: ${error.message}`);
    }
  };

  const handleStashChunk = async (chunkIndex: number) => {
    if (chunkIndex < 0 || chunkIndex >= diffHunks.length)
      return;

    const chunk = diffHunks[chunkIndex];

    try {
      // Create a directory for chunk stashes if it doesn't exist
      const stashDir = path.join(gitAdapter.repoPath, '.ugit', 'chunk-stashes');
      if (!fs.existsSync(stashDir)) {
        fs.mkdirSync(stashDir, { recursive: true });

        // Add .ugit to .gitignore if not already present
        const gitignorePath = path.join(gitAdapter.repoPath, '.gitignore');
        let gitignoreContent = '';
        if (fs.existsSync(gitignorePath)) {
          gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        }
        if (!gitignoreContent.includes('.ugit')) {
          gitignoreContent += (gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : '') + '.ugit/\n';
          fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
          console.log('Added .ugit/ to .gitignore');
        }
      }

      // Create a patch file with timestamp and file info
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = path.basename(file.path);
      const patchFile = path.join(stashDir, `${timestamp}_${fileName}_chunk${chunkIndex + 1}.patch`);

      fs.writeFileSync(patchFile, chunk.fullDiff, 'utf8');
      console.log(`Stashed chunk to: ${patchFile}`);

      // Now discard the chunk by applying reverse patch
      const tempFile = path.join(os.tmpdir(), `chunk-discard-${Date.now()}.patch`);
      fs.writeFileSync(tempFile, chunk.fullDiff, 'utf8');

      await gitAdapter.raw(['apply', '--reverse', '--unidiff-zero', tempFile]);

      // Clean up temp file
      fs.unlinkSync(tempFile);

      alert(`Chunk stashed to: ${patchFile.replace(gitAdapter.repoPath, '.')}`);

      // Refresh the diff
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error stashing chunk:', error);
      alert(`Failed to stash chunk: ${error.message}`);
    }
  };

  useEffect(() => {
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

        // Check if file is an image
        if (isImageFile(file.path)) {
          setFileType('image');
          setFileContent(file.path);
          setLoading(false);
          return;
        }

        let diffResult: string;

        // If diff is already provided in the file object (for stashes), use it
        if (file.diff) {
          diffResult = file.diff;
        } else {
          // Otherwise fetch the diff from git
          diffResult = await gitAdapter.diff(file.path, isStaged);
        }

        setDiff(diffResult);

        // If diff is empty or indicates no changes, try to show file contents
        if (!diffResult || diffResult.trim() === '' || diffResult.startsWith('Error loading diff:')) {
          // Try to read the file contents for new files
          try {
            setFileType('text');
            const content = fs.readFileSync(file.path, 'utf8');
            setFileContent(content);
          } catch (contentError) {
            console.error('Error loading file content:', contentError);
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
              outputFormat: 'side-by-side',
              matching: 'lines',
              diffStyle: 'word',
              renderNothingWhenEmpty: false,
              colorScheme: Diff2HtmlTypes.ColorSchemeType.DARK
            });
            if (index > 0) {
              // Hide the file header for subsequent hunks to avoid repetition
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

    loadContent();
  }, [file, gitAdapter, isStaged]);

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
                  className="chunk-action-button chunk-stash-button"
                  onClick={() => handleStashChunk(hoveredChunkIndex)}
                  title="Stash this chunk"
                >
                  Stash
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
