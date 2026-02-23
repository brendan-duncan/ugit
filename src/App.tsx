import React, { useState, useEffect, useCallback } from 'react';
import TabBar from './components/TabBar';
import RepositoryView from './components/RepositoryView';
import CloneDialog from './components/CloneDialog';
import { SettingsDialog } from './components/SettingsDialog';
import UpdateNotification from './components/UpdateNotification';
import { useAlert } from './contexts/AlertContext';
import { getRecentRepos, addRecentRepo, setRecentRepos } from './utils/recentRepos';
import { useSettings } from './hooks/useSettings';
import { ipcRenderer } from 'electron';
import fs from 'fs';
import './App.css';

const ACTIVE_TAB_KEY = 'ugit-active-tab-path';

interface Tab {
  id: string;
  path: string;
  name: string;
}

interface CloneResult {
  success: boolean;
  path?: string;
  error?: string;
}

// Helper function to filter out invalid repository paths
function filterValidRepos(repoPaths: string[]): string[] {
  return repoPaths.filter(repoPath => {
    try {
      return fs.existsSync(repoPath);
    } catch (error) {
      console.warn(`Failed to check path ${repoPath}:`, error);
      return false;
    }
  });
}

function App(): React.ReactElement {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hasLoadedRecent, setHasLoadedRecent] = useState<boolean>(false);
  const [showCloneDialog, setShowCloneDialog] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const { showAlert } = useAlert();
  const { settings, getSetting } = useSettings();

  // Apply theme class based on setting
  useEffect(() => {
    const theme = settings?.theme || 'dark';
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [settings?.theme]);

  // Load recent repos and auto-open on startup
  useEffect(() => {
    if (!hasLoadedRecent) {
      const recent = getRecentRepos();

      // Filter out invalid paths and update recent repos list
      const validRecent = filterValidRepos(recent);
      if (validRecent.length !== recent.length) {
        // Update recent repos with only valid paths
        setRecentRepos(validRecent);
        ipcRenderer.send('update-recent-repos', validRecent);
      }

      // Auto-open last opened repos
      if (validRecent.length > 0) {
        const newTabs: Tab[] = [];
        let activeTabIdToSet: string | null = null;

        // Get saved active tab path
        const savedActiveTabPath = localStorage.getItem(ACTIVE_TAB_KEY);

        // Reverse recent repos to restore original tab order
        const orderedRepos = [...validRecent].reverse();

        orderedRepos.forEach((repoPath, index) => {
          const tabId = String(Date.now() + index);
          const newTab: Tab = {
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

  // Listen for events from main process
  useEffect(() => {
    const handleInitRepo = (event: any, repoPath: string) => {
      initRepository(repoPath);
    };

    const handleOpenRepo = (event: any, repoPath: string) => {
      openRepository(repoPath);
    };

    const handleShowCloneDialog = () => {
      setShowCloneDialog(true);
    };

    const handleShowSettingsDialog = () => {
      setShowSettings(true);
    };

    ipcRenderer.on('init-repository', handleInitRepo);
    ipcRenderer.on('open-repository', handleOpenRepo);
    ipcRenderer.on('show-clone-dialog', handleShowCloneDialog);
    ipcRenderer.on('show-settings-dialog', handleShowSettingsDialog);

    const handleFetch = () => {
      if (activeTabId !== null && tabs.length > 0) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab) {
          ipcRenderer.send('fetch-repo', activeTab.path);
        }
      }
    };

    const handlePull = () => {
      if (activeTabId !== null && tabs.length > 0) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab) {
          ipcRenderer.send('pull-repo', activeTab.path);
        }
      }
    };

    const handlePush = () => {
      if (activeTabId !== null && tabs.length > 0) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab) {
          ipcRenderer.send('push-repo', activeTab.path);
        }
      }
    };

    const handleSaveStash = () => {
      if (activeTabId !== null && tabs.length > 0) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab) {
          ipcRenderer.send('save-stash-repo', activeTab.path);
        }
      }
    };

    const handleRefresh = () => {
      // Refresh functionality would go here
    };

    ipcRenderer.on('open-repository', handleOpenRepo);
    ipcRenderer.on('show-clone-dialog', handleShowCloneDialog);
    ipcRenderer.on('refresh-repository', handleRefresh);
    ipcRenderer.on('fetch-repository', handleFetch);
    ipcRenderer.on('pull-repository', handlePull);
    ipcRenderer.on('push-repository', handlePush);
    ipcRenderer.on('save-stash', handleSaveStash);

    return () => {
      ipcRenderer.removeListener('init-repository', handleInitRepo);
      ipcRenderer.removeListener('open-repository', handleOpenRepo);
      ipcRenderer.removeListener('show-clone-dialog', handleShowCloneDialog);
      ipcRenderer.removeListener('refresh-repository', handleRefresh);
      ipcRenderer.removeListener('fetch-repository', handleFetch);
      ipcRenderer.removeListener('pull-repository', handlePull);
      ipcRenderer.removeListener('push-repository', handlePush);
      ipcRenderer.removeListener('save-stash', handleSaveStash);
    };
  }, [tabs, activeTabId]);

  const initRepository = async (repoPath?: string) => {
    try {
      const result: CloneResult = await ipcRenderer.invoke('init-repository', repoPath);

      if (result.success && result.path) {
        openRepository(result.path);
      } else {
        showAlert(`Failed to initialize repository: ${result.error}`, 'Error');
      }
    } catch (error) {
      showAlert(`Failed to initialize repository: ${(error as Error).message}`, 'Error');
    }
  };

  const openRepository = (repoPath: string) => {
    // Check if path exists before opening
    try {
      if (!fs.existsSync(repoPath)) {
        showAlert(`Repository path does not exist:\n${repoPath}`, 'Error');
        return;
      }
    } catch (error) {
      console.error(`Error checking repository path ${repoPath}:`, error);
      showAlert(`Error accessing repository path:\n${repoPath}`, 'Error');
      return;
    }

    // Check if repository is already open
    const existingTab = tabs.find(tab => tab.path === repoPath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Create new tab
    const newTab: Tab = {
      id: String(Date.now()),
      path: repoPath,
      name: repoPath.split(/[\\/]/).pop() || repoPath
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);

    // Add to recent repos and update menu
    const recent = addRecentRepo(repoPath);
    ipcRenderer.send('update-recent-repos', recent);
  };

  const closeTab = (tabId: string) => {
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

  const handleTabReorder = (newTabs: Tab[]) => {
    setTabs(newTabs);
  };

  const handleClone = async (repoUrl: string, parentFolder: string, repoName: string): Promise<void> => {
    try {
      const result: CloneResult = await ipcRenderer.invoke('clone-repository', repoUrl, parentFolder, repoName);

      if (result.success && result.path) {
        // Close dialog and open the cloned repository
        setShowCloneDialog(false);
        openRepository(result.path);
      } else {
        // Show error message
        showAlert(`Clone failed: ${result.error}`, 'Error');
      }
    } catch (error) {
      showAlert(`Clone failed: ${(error as Error).message}`, 'Error');
    }
  };

  // Save open tabs to recent repos when tabs change
  useEffect(() => {
    if (hasLoadedRecent) {
      if (tabs.length > 0) {
        // Set recent repos to exactly match current tabs (most recent first), filtering out invalid paths
        const tabPaths = tabs.map(tab => tab.path).reverse();
        const validPaths = filterValidRepos(tabPaths);
        const recent = setRecentRepos(validPaths);
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

  // Periodic check for invalid tab paths
  useEffect(() => {
    if (!hasLoadedRecent || tabs.length === 0)
      return;

    const checkTabValidity = () => {
      const invalidTabs = tabs.filter(tab => {
        try {
          return !fs.existsSync(tab.path);
        } catch (error) {
          console.warn(`Failed to check tab path ${tab.path}:`, error);
          return true; // Close tab if we can't verify it exists
        }
      });

      if (invalidTabs.length > 0) {
        const validTabs = tabs.filter(tab =>
          !invalidTabs.some(invalidTab => invalidTab.id === tab.id)
        );

        setTabs(validTabs);

        // If the active tab was invalid, clear the saved active tab
        const wasActiveTabInvalid = invalidTabs.some(tab => tab.id === activeTabId);
        if (wasActiveTabInvalid && validTabs.length > 0) {
          setActiveTabId(validTabs[validTabs.length - 1].id);
        } else if (wasActiveTabInvalid) {
          setActiveTabId(null);
          localStorage.removeItem(ACTIVE_TAB_KEY);
        }

        console.log(`Closed ${invalidTabs.length} invalid tab(s):`,
          invalidTabs.map(tab => tab.path));
      }
    };

    // Check immediately and then every 30 seconds
    checkTabValidity();
    const interval = setInterval(checkTabValidity, 30000);

    return () => clearInterval(interval);
  }, [tabs, activeTabId, hasLoadedRecent]);

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId || ''}
        onTabSelect={(tabId) => setActiveTabId(tabId)}
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
                <RepositoryView repoPath={tab.path} isActiveTab={tab.id === activeTabId} />
              </div>
            ))}
          </>
        )}
      </div>
      <UpdateNotification />
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
      {showCloneDialog && (
        <CloneDialog
          onClose={() => setShowCloneDialog(false)}
          onClone={handleClone}
        />
      )}
    </div>
  );
}

export default App;
