import React, { useState, useEffect } from 'react';
import './DiffViewer.css';
import 'diff2html/bundles/css/diff2html.min.css';

const GitFactory = window.require('./src/git/GitFactory');
const { ipcRenderer } = window.require('electron');
const Diff2Html = window.require('diff2html');

function DiffViewer({ file, repoPath, isStaged }) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);
  const [diffHtml, setDiffHtml] = useState('');

  useEffect(() => {
    const loadDiff = async () => {
      if (!file || !repoPath) return;

      try {
        setLoading(true);
        const backend = await ipcRenderer.invoke('get-git-backend');
        const git = await GitFactory.createAdapter(repoPath, backend);

        const diffResult = await git.diff(file.path, isStaged);

        setDiff(diffResult);
        
        // Generate HTML using diff2html
        if (diffResult && diffResult.trim()) {
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
  }, [file, repoPath, isStaged]);

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
