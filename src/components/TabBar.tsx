import React, { useState } from 'react';
import './TabBar.css';

interface Tab {
  id: string;
  name: string;
  path: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder?: (tabs: Tab[]) => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onTabSelect, onTabClose, onTabReorder }) => {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  if (tabs.length === 0) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tabId: string): void => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, tabId: string): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedTabId !== tabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleDragLeave = (): void => {
    setDragOverTabId(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropTabId: string): void => {
    e.preventDefault();

    if (draggedTabId && draggedTabId !== dropTabId && onTabReorder) {
      const draggedIndex = tabs.findIndex(tab => tab.id === draggedTabId);
      const dropIndex = tabs.findIndex(tab => tab.id === dropTabId);

      if (draggedIndex !== -1 && dropIndex !== -1) {
        const newTabs = [...tabs];
        const [draggedTab] = newTabs.splice(draggedIndex, 1);
        newTabs.splice(dropIndex, 0, draggedTab);
        onTabReorder(newTabs);
      }
    }

    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const handleDragEnd = (): void => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.id === draggedTabId ? 'dragging' : ''} ${tab.id === dragOverTabId ? 'drag-over' : ''}`}
          onClick={() => onTabSelect(tab.id)}
          draggable={true}
          onDragStart={(e) => handleDragStart(e, tab.id)}
          onDragOver={(e) => handleDragOver(e, tab.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, tab.id)}
          onDragEnd={handleDragEnd}
        >
          <span className="tab-name" title={tab.path}>{tab.name}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div className="version-info">v0.1.0</div>
    </div>
  );
};

export default TabBar;
