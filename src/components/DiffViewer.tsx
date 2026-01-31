import React, { useState, useEffect } from 'react';
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
  if (!filePath) return [];
  
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

function DiffViewer({ file, gitAdapter, isStaged }: { file: any; gitAdapter: any; isStaged: boolean }) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);
  const [diffHtml, setDiffHtml] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileType, setFileType] = useState(''); // 'text' or 'image'

  useEffect(() => {
    const loadContent = async () => {
      if (!file || !gitAdapter)
        return;

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

        let diffResult;

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
          console.log('!!!! No diff available, attempting to load file contents.');
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
          // Generate HTML using diff2html
          const html = Diff2Html.html(diffResult, {
            drawFileList: false,
            outputFormat: 'side-by-side',
            matching: 'lines',
            diffStyle: 'word',
            renderNothingWhenEmpty: false,
            colorScheme: Diff2HtmlTypes.ColorSchemeType.DARK
          });
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
      {file.path && (
        <div className="diff-header">
          <span className="diff-filename">{file.path}</span>
          <span className="diff-status-badge">{file.status}</span>
        </div>
      )}
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
          <div
            className="diff2html-container"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        ) : fileContent ? (
          <div className="diff-file-content">
            <div className="diff-header">
              <span className="diff-filename">{file.path}</span>
              <span className="diff-status-badge">{file.status}</span>
            </div>
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
