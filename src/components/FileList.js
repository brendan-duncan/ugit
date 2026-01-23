import React, { useState } from 'react';
import './FileList.css';

function FileList({ title, files, onDrop, listType, onSelectFile, selectedFile }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = (e, file) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      file,
      sourceList: listType
    }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.sourceList !== listType && onDrop) {
        onDrop(data.file, data.sourceList, listType);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  return (
    <div className="file-list">
      <h4>{title} ({files.length})</h4>
      <div
        className={`file-list-content ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div className="file-list-empty">No files</div>
        ) : (
          files.map((file, index) => {
            const isSelected = selectedFile && selectedFile.path === file.path && selectedFile.listType === listType;
            return (
              <div
                key={index}
                className={`file-item ${isSelected ? 'selected' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, file)}
                onClick={() => onSelectFile && onSelectFile(file, listType)}
              >
                <span className="file-status">{getStatusIcon(file.status)}</span>
                <span className="file-path">{file.path}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function getStatusIcon(status) {
  switch (status) {
    case 'modified': return 'M';
    case 'created': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    default: return '?';
  }
}

export default FileList;
