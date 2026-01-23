import React, { useState, useRef } from 'react';
import simpleGit from 'simple-git';
import FileList from './FileList';
import DiffViewer from './DiffViewer';
import './LocalChangesPanel.css';

function LocalChangesPanel({ unstagedFiles, stagedFiles, repoPath, onRefresh }) {
  const [topSectionHeight, setTopSectionHeight] = useState(85);
  const [fileListsHeight, setFileListsHeight] = useState(50);
  const [leftWidth, setLeftWidth] = useState(50);
  const [selectedFile, setSelectedFile] = useState(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const activeSplitter = useRef(null);

  const handleMouseDown = (splitterType) => {
    activeSplitter.current = splitterType;
  };

  const handleMouseUp = () => {
    activeSplitter.current = null;
  };

  const handleMouseMove = (e) => {
    if (activeSplitter.current === null) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();

    if (activeSplitter.current === 'vertical') {
      // Vertical splitter within file lists - between unstaged and staged
      const topSectionRect = container.querySelector('.local-changes-top-section').getBoundingClientRect();
      const relativeY = ((e.clientY - topSectionRect.top) / topSectionRect.height) * 100;
      if (relativeY >= 20 && relativeY <= 80) {
        setFileListsHeight(relativeY);
      }
    } else if (activeSplitter.current === 'horizontal-top') {
      // Horizontal splitter in top section - between file lists and diff viewer
      const topSectionRect = container.querySelector('.local-changes-top-section').getBoundingClientRect();
      const relativeX = ((e.clientX - topSectionRect.left) / topSectionRect.width) * 100;
      if (relativeX >= 30 && relativeX <= 70) {
        setLeftWidth(relativeX);
      }
    } else if (activeSplitter.current === 'horizontal-bottom') {
      // Horizontal splitter - between top section and commit panel
      const newHeight = ((e.clientY - rect.top) / rect.height) * 100;
      if (newHeight >= 40 && newHeight <= 85) {
        setTopSectionHeight(newHeight);
      }
    }
  };

  const handleFileDrop = async (file, sourceList, targetList) => {
    try {
      const git = simpleGit(repoPath);

      if (sourceList === 'unstaged' && targetList === 'staged') {
        // Stage the file
        await git.add(file.path);
        console.log(`Staged file: ${file.path}`);
      } else if (sourceList === 'staged' && targetList === 'unstaged') {
        // Unstage the file
        await git.reset(['HEAD', file.path]);
        console.log(`Unstaged file: ${file.path}`);
      }

      // Refresh the file lists
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error staging/unstaging file:', error);
    }
  };

  const handleSelectFile = (file, listType) => {
    setSelectedFile({ file, listType });
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0) {
      return;
    }

    try {
      const git = simpleGit(repoPath);

      // Construct commit message with optional description
      const fullMessage = commitDescription.trim()
        ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
        : commitMessage.trim();

      await git.commit(fullMessage);
      console.log('Commit successful');

      // Clear the commit fields
      setCommitMessage('');
      setCommitDescription('');

      // Refresh the file lists
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error committing:', error);
    }
  };

  return (
    <div
      className="local-changes-vertical-container"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top section: file lists on left, diff viewer on right */}
      <div className="local-changes-top-section" style={{ height: `${topSectionHeight}%` }}>
        <div className="local-changes-file-lists" style={{ width: `${leftWidth}%` }}>
          <div className="changes-split-panel" style={{ height: `${fileListsHeight}%` }}>
            <FileList
              title="Unstaged Files"
              files={unstagedFiles}
              listType="unstaged"
              onDrop={handleFileDrop}
              onSelectFile={handleSelectFile}
              selectedFile={selectedFile}
            />
          </div>
          <div
            className="changes-splitter-handle"
            onMouseDown={() => handleMouseDown('vertical')}
          >
            <div className="changes-splitter-line"></div>
          </div>
          <div className="changes-split-panel" style={{ height: `${100 - fileListsHeight}%` }}>
            <FileList
              title="Staged Files"
              files={stagedFiles}
              listType="staged"
              onDrop={handleFileDrop}
              onSelectFile={handleSelectFile}
              selectedFile={selectedFile}
            />
          </div>
        </div>
        {selectedFile && (
          <>
            <div
              className="changes-horizontal-splitter-handle"
              onMouseDown={() => handleMouseDown('horizontal-top')}
            >
              <div className="changes-horizontal-splitter-line"></div>
            </div>
            <div className="local-changes-diff-viewer" style={{ width: `${100 - leftWidth}%` }}>
              <DiffViewer
                file={selectedFile.file}
                repoPath={repoPath}
                isStaged={selectedFile.listType === 'staged'}
              />
            </div>
          </>
        )}
      </div>

      {/* Horizontal splitter between top section and commit panel */}
      <div
        className="changes-main-splitter-handle"
        onMouseDown={() => handleMouseDown('horizontal-bottom')}
      >
        <div className="changes-main-splitter-line"></div>
      </div>

      {/* Bottom section: commit panel spanning full width */}
      <div className="commit-panel-bottom" style={{ height: `${100 - topSectionHeight}%` }}>
        <div className="commit-panel-content">
          <input
            type="text"
            className="commit-message-input"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message"
          />
          <input
            type="text"
            className="commit-description-input"
            value={commitDescription}
            onChange={(e) => setCommitDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <button
            className="commit-button"
            onClick={handleCommit}
            disabled={stagedFiles.length === 0 || !commitMessage.trim()}
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}

export default LocalChangesPanel;
