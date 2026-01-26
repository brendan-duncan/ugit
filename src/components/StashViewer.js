import React, { useState, useEffect } from 'react';
import './StashViewer.css';
import DiffViewer from './DiffViewer';

function StashViewer({ stash, stashIndex, gitAdapter }) {
  const [stashInfo, setStashInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState(new Set());

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
        setStashInfo({
          stashRef: `stash@${stashIndex}`,
          stashIndex,
          info: { message: 'Error loading stash info' },
          files: [],
          fileDiffs: {},
          totalFiles: 0
        });
        setLoading(false);
      }
    };

    if (stash && gitAdapter) {
      loadStashInfo();
    }
  }, [stash, stashIndex, gitAdapter]);

  const toggleFileExpansion = (fileName) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
      }
      return newSet;
    });
  };

  if (!stash || loading) {
    return (
      <div className="stash-viewer">
        <div className="stash-message-section">
          <div className="stash-message-text">No stash selected</div>
        </div>
      </div>
    );
  }

  const isExpanded = (fileName) => expandedFiles.has(fileName);

  return (
    <div className="stash-viewer">
      <div className="stash-header">
        <span className="stash-title">{stashInfo?.stashRef || `stash@${stashIndex}`}</span>
        <span className="stash-badge">STASH</span>
      </div>
      <div className="stash-info-section">
        <div className="stash-info-message">
          <div className="stash-message-label">Message:</div>
          <div className="stash-message-text">{stash?.message || 'No message'}</div>
        </div>
        {stashInfo?.info?.author && (
          <div className="stash-info-author">
            <div className="stash-message-label">Author:</div>
            <div className="stash-message-text">{stashInfo.info.author}</div>
          </div>
        )}
        {stashInfo?.info?.date && (
          <div className="stash-info-date">
            <div className="stash-message-label">Date:</div>
            <div className="stash-message-text">{stashInfo.info.date}</div>
          </div>
        )}
        {stashInfo?.info?.hash && (
          <div className="stash-info-hash">
            <div className="stash-message-label">Commit:</div>
            <div className="stash-message-text">{stashInfo.info.hash}</div>
          </div>
        )}
        {stashInfo?.info?.merge && (
          <div className="stash-info-merge">
            <div className="stash-message-label">Merge:</div>
            <div className="stash-message-text">{stashInfo.info.merge}</div>
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
                
                {isExpanded(fileName) && stashInfo.fileDiffs[fileName] && (
                  <div className="stash-file-diff">
                    <DiffViewer
                      file={{
                        path: fileName,
                        status: 'MODIFIED',
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
