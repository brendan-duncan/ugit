import React, { useState, useEffect, useCallback } from 'react';
import TabBar from './components/TabBar';
import RepositoryView from './components/RepositoryView';
import { getRecentRepos, addRecentRepo, setRecentRepos } from './utils/recentRepos';
import './App.css';

const { ipcRenderer } = window.require('electron');

const ACTIVE_TAB_KEY = 'ugit-active-tab-path';

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
        const newTabs = [];
        let activeTabIdToSet = null;

        // Get saved active tab path
        const savedActiveTabPath = localStorage.getItem(ACTIVE_TAB_KEY);

        // Reverse recent repos to restore original tab order
        const orderedRepos = [...recent].reverse();
        
        orderedRepos.forEach((repoPath, index) => {
          const tabId = Date.now() + index;
          const newTab = {
            id: tabId,
            path: repoPath,
            name: repoPath.split(/[\\/]/).pop() || repoPath
          };
          newTabs.push(newTab);

          // If this matches the saved active tab, remember its ID
          if (repoPath === savedActiveTabPath) {
            activeTabIdToSet = tabId;
          }
        });

        setTabs(newTabs);

        // Set active tab to saved one, or first one if not found
        if (activeTabIdToSet !== null) {
          setActiveTabId(activeTabIdToSet);
        } else {
          setActiveTabId(newTabs[0].id);
        }
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
        // Clear saved active tab when no tabs remain
        localStorage.removeItem(ACTIVE_TAB_KEY);
      }
    }
  };

  const handleTabReorder = (newTabs) => {
    setTabs(newTabs);
  };

  // Save open tabs to recent repos when tabs change
  useEffect(() => {
    if (hasLoadedRecent) {
      if (tabs.length > 0) {
        // Set recent repos to exactly match current tabs (most recent first)
        const tabPaths = tabs.map(tab => tab.path).reverse();
        const recent = setRecentRepos(tabPaths);
        ipcRenderer.send('update-recent-repos', recent);
      } else {
        // No tabs open, clear recent repos
        const recent = setRecentRepos([]);
        ipcRenderer.send('update-recent-repos', recent);
      }
    }
  }, [tabs, hasLoadedRecent]);

  // Save active tab when it changes
  useEffect(() => {
    if (activeTabId !== null && tabs.length > 0) {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        localStorage.setItem(ACTIVE_TAB_KEY, activeTab.path);
      }
    }
  }, [activeTabId, tabs]);

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
        onTabReorder={handleTabReorder}
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
