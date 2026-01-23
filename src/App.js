import React, { useState, useEffect, useCallback } from 'react';
import TabBar from './components/TabBar';
import RepositoryView from './components/RepositoryView';
import { getRecentRepos, addRecentRepo } from './utils/recentRepos';
import './App.css';

const { ipcRenderer } = window.require('electron');

function App() {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [hasLoadedRecent, setHasLoadedRecent] = useState(false);

  // Load recent repos and auto-open on startup
  useEffect(() => {
    if (!hasLoadedRecent) {
      const recent = getRecentRepos();

      // Send recent repos to main process for menu
      ipcRenderer.send('update-recent-repos', recent);

      // Auto-open last opened repos
      if (recent.length > 0) {
        recent.forEach((repoPath, index) => {
          const newTab = {
            id: Date.now() + index,
            path: repoPath,
            name: repoPath.split(/[\\/]/).pop() || repoPath
          };
          setTabs(prevTabs => [...prevTabs, newTab]);
        });
        // Set the first one as active
        setActiveTabId(Date.now());
      }

      setHasLoadedRecent(true);
    }
  }, [hasLoadedRecent]);

  // Listen for open-repository events from main process
  useEffect(() => {
    const handleOpenRepo = (event, repoPath) => {
      openRepository(repoPath);
    };

    ipcRenderer.on('open-repository', handleOpenRepo);

    return () => {
      ipcRenderer.removeListener('open-repository', handleOpenRepo);
    };
  }, [tabs]);

  const openRepository = (repoPath) => {
    // Check if repository is already open
    const existingTab = tabs.find(tab => tab.path === repoPath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Create new tab
    const newTab = {
      id: Date.now(),
      path: repoPath,
      name: repoPath.split(/[\\/]/).pop() || repoPath
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);

    // Add to recent repos and update menu
    const recent = addRecentRepo(repoPath);
    ipcRenderer.send('update-recent-repos', recent);
  };

  const closeTab = (tabId) => {
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);

    // If closing active tab, switch to another tab
    if (tabId === activeTabId) {
      if (newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  // Save open tabs to recent repos when tabs change
  useEffect(() => {
    if (hasLoadedRecent && tabs.length > 0) {
      // Update recent repos with current tabs (most recent first)
      const tabPaths = tabs.map(tab => tab.path).reverse();
      tabPaths.forEach(path => addRecentRepo(path));
      const recent = getRecentRepos();
      ipcRenderer.send('update-recent-repos', recent);
    }
  }, [tabs, hasLoadedRecent]);

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
      />
      <div className="content">
        {tabs.length === 0 ? (
          <div className="welcome">
            <h1>Welcome to ugit</h1>
            <p>Open a repository to get started (File → Open Repository...)</p>
          </div>
        ) : (
          <>
            {tabs.map(tab => (
              <div
                key={tab.id}
                style={{ display: tab.id === activeTabId ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}
              >
                <RepositoryView repoPath={tab.path} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
