import React, { useState, useEffect } from 'react';
import DiffViewer from './DiffViewer';
import { StashInfo, GitAdapter } from '../git/GitAdapter';
import './StashViewer.css';

interface StashViewerProps {
  stash: StashInfo | null;
  stashIndex: number;
  gitAdapter: GitAdapter;
}

function StashViewer({ stash, stashIndex, gitAdapter }: StashViewerProps): React.ReactElement {
  const [stashInfo, setStashInfo] = useState<StashInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedFiles, setExpandedFiles] = useState(new Set());
  const [loadedDiffs, setLoadedDiffs] = useState(new Set());

  useEffect(() => {
    const loadStashInfo = async () => {
      try {
        setLoading(true);
        // Get detailed stash info including files and diffs
        const stashData = await gitAdapter.getStashInfo(stashIndex);
        setStashInfo(stashData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading stash info:', error);
        setStashInfo(null);
        setLoading(false);
      }
    };

    if (stash && gitAdapter) {
      loadStashInfo();
    }
  }, [stash, stashIndex, gitAdapter]);

  const toggleFileExpansion = (fileName: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
      }
      if (!loadedDiffs.has(fileName)) {
        loadDiff(fileName);
      }
      return newSet;
    });
  };

  if (!stash || loading) {
    return (
      <div className="stash-viewer">
        <div className="stash-message-section">
          <div className="stash-message-text">Loading...</div>
        </div>
      </div>
    );
  }

  const isExpanded = (fileName: string) => expandedFiles.has(fileName);

  const loadDiff = async (fileName: string) => {
    try {
      const diff = await gitAdapter.getStashFileDiff(stashIndex, fileName);
      setStashInfo((prev) => {
        const newDiffs = prev.fileDiffs;
        newDiffs[fileName] = diff;
        return {...prev, fileDiffs: newDiffs };
      });
      setLoadedDiffs(prev => new Set(prev).add(fileName));
    } catch (error) {
      console.error(`Error loading diff for file ${fileName}:`, error);
    }
  };


  let title = (stash?.message || stashInfo?.stashRef || `stash@${stashIndex}`);
  title = title.substring(title.indexOf(':') + 1).trim();

  return (
    <div className="stash-viewer">
      <div className="stash-header">
        <span className="stash-title">{title}</span>
        <span className="stash-badge">STASH</span>
      </div>
      <div className="stash-info-section">
        <div className="stash-info-message">
          <span className="stash-message-label">Message: </span>
          <span className="stash-message-text">{stash?.message || 'No message'}</span>
        </div>
        {stashInfo?.author && (
          <div className="stash-info-author">
            <span className="stash-message-label">Author: </span>
            <span className="stash-message-text">{stashInfo.author}</span>
          </div>
        )}
        {stashInfo?.date && (
          <div className="stash-info-date">
            <span className="stash-message-label">Date: </span>
            <span className="stash-message-text">{stashInfo.date}</span>
          </div>
        )}
        {stashInfo?.hash && (
          <div className="stash-info-hash">
            <span className="stash-message-label">Commit: </span>
            <span className="stash-message-text">{stashInfo.hash}</span>
          </div>
        )}
        {stashInfo?.merge && (
          <div className="stash-info-merge">
            <span className="stash-message-label">Parents: </span>
            <span className="stash-message-text">{stashInfo.merge}</span>
          </div>
        )}
      </div>

      <div className="stash-files-section">
        <div className="stash-files-header">
          <div className="stash-files-label">
            Files ({stashInfo?.totalFiles || 0}):
          </div>
        </div>

        {stashInfo?.files && stashInfo.files.length > 0 ? (
          <div className="stash-files-list">
            {stashInfo.files.map((fileName, index) => (
              <div key={index} className="stash-file-item">
                <div
                  className="stash-file-header"
                  onClick={() => toggleFileExpansion(fileName)}
                >
                  <span className="stash-file-name">{fileName}</span>
                  <span className="stash-file-toggle">
                    {isExpanded(fileName) ? '▼' : '▶'}
                  </span>
                </div>

                {isExpanded(fileName) && !stashInfo.fileDiffs[fileName] && (
                  <div className="stash-file-diff">
                    <div className="stash-message-section">
                      <div className="stash-message-text">Loading...</div>
                    </div>
                  </div>
                )}

                {isExpanded(fileName) && stashInfo.fileDiffs[fileName] && (
                  <div className="stash-file-diff">
                    <DiffViewer
                      file={{
                        path: fileName,
                        status: 'modified',
                        diff: stashInfo.fileDiffs[fileName]
                      }}
                      gitAdapter={gitAdapter}
                      isStaged={false}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="stash-no-files">
            No files in this stash
          </div>
        )}
      </div>
    </div>
  );
}

export default StashViewer;
