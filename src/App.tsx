import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TabBar from './components/TabBar';
import RepositoryView from './components/RepositoryView';
import CloneDialog from './components/CloneDialog';
import InitRepositoryDialog from './components/InitRepositoryDialog';
import { SettingsDialog } from './components/SettingsDialog';
import UpdateNotification from './components/UpdateNotification';
import { useAlert } from './contexts/AlertContext';
import { useSettings } from './contexts/SettingsContext';
import { getRecentRepos, addRecentRepo, setRecentRepos } from './utils/recentRepos';
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

type TabStatus = { ahead: number; behind: number } | null;

function App(): React.ReactElement {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hasLoadedRecent, setHasLoadedRecent] = useState<boolean>(false);
  const [showCloneDialog, setShowCloneDialog] = useState<boolean>(false);
  const [initRepoPath, setInitRepoPath] = useState<string | null>(null);
  // Bumped per repo path to force the corresponding RepositoryView to reload from git.
  const [refreshSignal, setRefreshSignal] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [tabStatus, setTabStatus] = useState<Record<string, TabStatus>>({});

  // Mirror the latest tabs in a ref so async IPC handlers (e.g. an "open-repository"
  // path passed via "Open with ugit") append to the current tab set instead of a
  // possibly stale closure that would clobber already-restored tabs.
  const tabsRef = useRef<Tab[]>(tabs);
  tabsRef.current = tabs;
  // Ensures the one-time "renderer-ready" handshake is sent only once.
  const rendererReadySent = useRef<boolean>(false);

  const tabStatusHandlers = useMemo(() => {
    const handlers: Record<string, (status: TabStatus) => void> = {};
    tabs.forEach(tab => {
      handlers[tab.id] = (status: TabStatus) =>
        setTabStatus(prev => {
          const current = prev[tab.id];
          if (
            current === status ||
            (current &&
              status &&
              current.ahead === status.ahead &&
              current.behind === status.behind)
          ) {
            return prev;
          }
          return { ...prev, [tab.id]: status };
        });
    });
    return handlers;
  }, [tabs]);
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
      setInitRepoPath(repoPath);
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

    ipcRenderer.on('refresh-repository', handleRefresh);
    ipcRenderer.on('fetch-repository', handleFetch);
    ipcRenderer.on('pull-repository', handlePull);
    ipcRenderer.on('push-repository', handlePush);
    ipcRenderer.on('save-stash', handleSaveStash);

    return () => {
      ipcRenderer.removeListener('init-repository', handleInitRepo);
      ipcRenderer.removeListener('open-repository', handleOpenRepo);
      ipcRenderer.removeListener('show-clone-dialog', handleShowCloneDialog);
      ipcRenderer.removeListener('show-settings-dialog', handleShowSettingsDialog);
      ipcRenderer.removeListener('refresh-repository', handleRefresh);
      ipcRenderer.removeListener('fetch-repository', handleFetch);
      ipcRenderer.removeListener('pull-repository', handlePull);
      ipcRenderer.removeListener('push-repository', handlePush);
      ipcRenderer.removeListener('save-stash', handleSaveStash);
    };
  }, [tabs, activeTabId]);

  // Tell the main process our listeners are ready — but only after the saved tabs
  // have been restored (hasLoadedRecent). This guarantees any command-line repo
  // (from "Open with ugit") is appended to the restored tabs rather than racing
  // ahead of them and clobbering the session. Sent exactly once.
  useEffect(() => {
    if (hasLoadedRecent && !rendererReadySent.current) {
      rendererReadySent.current = true;
      ipcRenderer.send('renderer-ready');
    }
  }, [hasLoadedRecent]);

  const handleInit = async (remoteName: string, remoteUrl: string, branchName: string) => {
    if (!initRepoPath) {
      return;
    }
    try {
      const result: CloneResult = await ipcRenderer.invoke('init-repository', {
        repoPath: initRepoPath,
        remoteName,
        remoteUrl,
        branchName,
      });

      if (result.success && result.path) {
        const path = result.path;
        setInitRepoPath(null);
        openRepository(path);
        // Refresh the repo after initializing so the new branch/remote state is
        // shown immediately (also covers the case where the repo tab was already open).
        setRefreshSignal(prev => ({ ...prev, [path]: (prev[path] || 0) + 1 }));
      } else {
        showAlert(`Failed to initialize repository: ${result.error}`, 'Error');
      }
    } catch (error) {
      showAlert(`Failed to initialize repository: ${(error as Error).message}`, 'Error');
    }
  };

  const openRepository = useCallback((repoPath: string) => {
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

    // Read the current tabs from the ref rather than a captured closure so async
    // callers (command-line "open-repository") never overwrite restored tabs.
    const currentTabs = tabsRef.current;

    // Check if repository is already open
    const existingTab = currentTabs.find(tab => tab.path === repoPath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Create new tab with a collision-proof id (Date.now() alone collides when two
    // opens happen within the same millisecond, producing duplicate React keys).
    const newTab: Tab = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      path: repoPath,
      name: repoPath.split(/[\\/]/).pop() || repoPath
    };

    setTabs([...currentTabs, newTab]);
    setActiveTabId(newTab.id);

    // Add to recent repos and update menu
    const recent = addRecentRepo(repoPath);
    ipcRenderer.send('update-recent-repos', recent);
  }, [showAlert]);

  const closeTab = (tabId: string) => {
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);

    setTabStatus(prev => {
      if (!(tabId in prev))
        return prev;
      const next = { ...prev };
      delete next[tabId];
      return next;
    });

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
        tabStatus={tabStatus}
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
                <RepositoryView
                  repoPath={tab.path}
                  isActiveTab={tab.id === activeTabId}
                  onTabStatusChange={tabStatusHandlers[tab.id]}
                  refreshSignal={refreshSignal[tab.path] || 0}
                  onOpenRepository={openRepository}
                />
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
      {initRepoPath && (
        <InitRepositoryDialog
          repoPath={initRepoPath}
          onClose={() => setInitRepoPath(null)}
          onInit={handleInit}
        />
      )}
    </div>
  );
}

export default App;
