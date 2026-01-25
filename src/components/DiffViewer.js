import React, { useState, useEffect } from 'react';
import './DiffViewer.css';
import 'diff2html/bundles/css/diff2html.min.css';


const Diff2Html = window.require('diff2html');

function DiffViewer({ file, gitAdapter, isStaged }) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);
  const [diffHtml, setDiffHtml] = useState('');

  useEffect(() => {
    const loadDiff = async () => {
      if (!file || !gitAdapter) return;

      try {
        setLoading(true);
        
        let diffResult;
        
        // If diff is already provided in the file object (for stashes), use it
        if (file.diff) {
          diffResult = file.diff;
        } else {
          // Otherwise fetch the diff from git
          diffResult = await gitAdapter.diff(file.path, isStaged);
        }

        setDiff(diffResult);
        
        // Generate HTML using diff2html
        if (diffResult && diffResult.trim() && !diffResult.startsWith('Error loading diff:')) {
          const html = Diff2Html.html(diffResult, {
            drawFileList: false,
            matching: 'lines',
            outputFormat: 'line-by-line'
          });
          setDiffHtml(html);
        } else {
          setDiffHtml('');
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading diff:', error);
        setDiff('Error loading diff: ' + error.message);
        setLoading(false);
      }
    };

    loadDiff();
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
      <div className="diff-header">
        <span className="diff-filename">{file.path}</span>
        <span className="diff-status-badge">{file.status}</span>
      </div>
      <div className="diff-content">
        {loading ? (
          <div className="diff-loading">Loading diff...</div>
        ) : diffHtml ? (
          <div 
            className="diff2html-container"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        ) : (
          <div className="diff-empty">No changes to display</div>
        )}
      </div>
    </div>
  );
}

export default DiffViewer;
