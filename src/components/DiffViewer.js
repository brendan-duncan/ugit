import React, { useState, useEffect } from 'react';
import './DiffViewer.css';
import 'diff2html/bundles/css/diff2html.min.css';
const fs = require('fs');

const Diff2Html = window.require('diff2html');

// Helper function to check if file is an image
function isImageFile(filePath) {
  if (!filePath) return false;
  const imageExtensions = /\.(png|jpg|jpeg|gif|bmp|svg|ico|webp|tiff|tif)$/i;
  return imageExtensions.test(filePath);
}

function DiffViewer({ file, gitAdapter, isStaged }) {
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
            fileListToggle: false,
            fileListStartVisible: false,
            fileContentToggle: false,
            matching: 'lines',
            colorScheme: 'dark',
            outputFormat: 'side-by-side',
            synchronisedScroll: true,
            highlight: false,
            renderNothingWhenEmpty: false,
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
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'block';
                }}
              />
            </div>
          </div>
        ) : fileType === 'text' ? (
          <div className="diff-file-content">
            <div className="diff-file-content-display">
              <pre className="diff-file-content-text">{fileContent}</pre>
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
              <pre className="diff-file-content-text">{fileContent}</pre>
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
