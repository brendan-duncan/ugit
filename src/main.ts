import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import cacheManager from './utils/cacheManager';
import { initializeSettings } from './utils/settings';
import { getSettingsManager } from './utils/settings';
import GitFactory from './git/GitFactory';
import path from 'path';
import fs from 'fs';
import { shell } from 'electron';
import { exec } from 'child_process';

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, let user choose
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

let mainWindow: Electron.BrowserWindow | null = null;
let recentRepos: string[] = [];
let windowStatePath: string;

// Parse command-line arguments for git backend selection
// Usage: npm start -- --git-backend=simple-git
let gitBackend: string = 'simple-git'; // default
const args = process.argv.slice(1);
for (const arg of args) {
  if (arg.startsWith('--git-backend=')) {
    gitBackend = arg.split('=')[1];
    console.log(`Using git backend: ${gitBackend}`);
  }
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

// Load window state from file
function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(windowStatePath)) {
      const data = fs.readFileSync(windowStatePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading window state:', error);
  }
  // Default window state
  return {
    width: 1200,
    height: 800,
    x: undefined,
    y: undefined,
    isMaximized: false
  };
}

// Save window state to file
function saveWindowState(): void {
  if (!mainWindow)
    return;

  try {
    const bounds = mainWindow.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized()
    };
    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving window state:', error);
  }
}

function createWindow(): void {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icon.png')
      : path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile('index.html');

  // Create menu
  createMenu();

  // Save window state on resize/move
  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      saveWindowState();
    }
  });

  mainWindow.on('move', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      saveWindowState();
    }
  });

  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu(): void {
  // Get current diff view mode
  const settingsManager = getSettingsManager();
  const currentDiffViewMode = settingsManager.getSetting('diffViewMode') || 'line-by-line';

  // Build recent repos submenu
  const recentSubmenu = recentRepos.length > 0
    ? recentRepos.map((repoPath) => ({
        label: repoPath,
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('open-repository', repoPath);
          }
        }
      }))
    : [{ label: 'No recent repositories', enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Clone...',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-clone-dialog');
            }
          }
        },
        {
          label: 'Open Repository...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openRepository();
          }
        },
        {
          label: 'Init New Repository...',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            initRepository();
          }
        },
        {
          label: 'Recent Repositories',
          submenu: recentSubmenu
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-settings-dialog');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Diff Viewer',
          submenu: [
            {
              label: 'Line-by-Line',
              type: 'checkbox',
              checked: currentDiffViewMode === 'line-by-line',
              click: () => {
                const settingsManager = getSettingsManager();
                settingsManager.updateSetting('diffViewMode', 'line-by-line');
                createMenu(); // Rebuild menu to update checkboxes
                if (mainWindow) {
                  mainWindow.webContents.send('diff-view-mode-changed', 'line-by-line');
                }
              }
            },
            {
              label: 'Side-by-Side',
              type: 'checkbox',
              checked: currentDiffViewMode === 'side-by-side',
              click: () => {
                const settingsManager = getSettingsManager();
                settingsManager.updateSetting('diffViewMode', 'side-by-side');
                createMenu(); // Rebuild menu to update checkboxes
                if (mainWindow) {
                  mainWindow.webContents.send('diff-view-mode-changed', 'side-by-side');
                }
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Clear All Caches',
          click: () => {
            cacheManager.clearAllCaches();
            if (mainWindow) {
              mainWindow.webContents.send('caches-cleared');
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('check-for-updates-manual');
            }
          }
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function initRepository(): Promise<void> {
  if (!mainWindow)
    return;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Init New Repository'
  }) as any;

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    const repoPath = result.filePaths[0];
    // Send the repository path to the renderer process
    mainWindow.webContents.send('init-repository', repoPath);
  }
}

async function openRepository(): Promise<void> {
  if (!mainWindow)
    return;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Repository'
  }) as any;

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    const repoPath = result.filePaths[0];
    // Send the repository path to the renderer process
    mainWindow.webContents.send('open-repository', repoPath);
  }
}

// Suppress cache access denied errors - must be set before app.whenReady()
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-accelerated-video-decode');
app.commandLine.appendSwitch('disable-gpu-video-decode');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-translate');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-virtualization');
app.commandLine.appendSwitch('disable-virtualized-windows');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

app.whenReady().then(() => {
  // Initialize cache manager with user data path
  cacheManager.setCacheDir(app.getPath('userData'));

  // Initialize settings manager
  initializeSettings(cacheManager);

  // Set window state file path
  windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

  createWindow();

  // Check for updates after window is created (only in production)
  if (!app.isPackaged) {
    console.log('Running in development mode, skipping update check');
  } else {
    // Wait a bit before checking for updates
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        console.error('Error checking for updates:', error);
      });
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Save window state before quitting
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveWindowState();
  }
});

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available. Current version:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', { version: info.version });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', { message: err.message });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download progress: ${progressObj.percent.toFixed(2)}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', { version: info.version });
  }
});

// Listen for recent repos updates from renderer
ipcMain.on('update-recent-repos', (event: any, repos: string[]) => {
  recentRepos = repos;
  createMenu(); // Rebuild menu with updated recent repos
});

// Provide git backend to renderer process
ipcMain.handle('get-git-backend', () => {
  return gitBackend;
});

// Provide user data path to renderer process for cache initialization
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// Settings IPC handlers
ipcMain.handle('get-settings', () => {
  const settingsManager = getSettingsManager();
  return settingsManager.getSettings();
});

ipcMain.handle('update-setting', async (event: any, key: string, value: any) => {
  const settingsManager = getSettingsManager();
  settingsManager.updateSetting(key as any, value);
  return { success: true };
});

ipcMain.handle('update-settings', async (event: any, updates: any) => {
  const settingsManager = getSettingsManager();
  settingsManager.updateSettings(updates);
  return { success: true };
});

ipcMain.handle('reset-settings', async () => {
  const settingsManager = getSettingsManager();
  settingsManager.resetToDefaults();
  return { success: true };
});

// Show item in file explorer
ipcMain.handle('show-item-in-folder', async (event: any, itemPath: string) => {
  try {
    // Check if the path exists
    if (fs.existsSync(itemPath)) {
      shell.showItemInFolder(itemPath);
    } else {
      // If file doesn't exist, show the parent directory
      const parentDir = path.dirname(itemPath);
      if (fs.existsSync(parentDir)) {
        shell.openPath(parentDir);
      }
    }
  } catch (error) {
    console.error('Error showing item in folder:', error);
  }
});

function openInEditor(itemPath: string, editor: string = 'code'): void {
  exec(`${editor} "${itemPath}"`, (error) => {
    if (error) {
      console.error('Error opening editor:', error);
    }
  });
}

// Open item in editor
ipcMain.handle('open-in-editor', async (event: any, itemPath: string, editor: string = 'code') => {
  try {
    // Check if the path exists
    if (fs.existsSync(itemPath)) {
      openInEditor(itemPath, editor);
    } else {
      // If file doesn't exist, show the parent directory
      const parentDir = path.dirname(itemPath);
      if (fs.existsSync(parentDir)) {
        openInEditor(parentDir, editor);
      }
    }
  } catch (error) {
    console.error('Error opening item in editor:', error);
  }
});

// Show save dialog
ipcMain.handle('show-save-dialog', async (event: any, options: any) => {
  if (!mainWindow) {
    return { canceled: true };
  }
  return await dialog.showSaveDialog(mainWindow, options);
});

// Show open dialog for directory selection
ipcMain.handle('show-open-dialog', async (event: any, options: any) => {
  if (!mainWindow) {
    return { canceled: true, filePaths: [] };
  }
  return await dialog.showOpenDialog(mainWindow, options);
});

// Init repository
ipcMain.handle('init-repository', async (event: any, repoPath: string) => {
  try {
    // Create git adapter
    const gitAdapter = await GitFactory.createAdapter(repoPath, gitBackend);

    // Initialize repository
    await gitAdapter.init();

    return { success: true, path: repoPath };
  } catch (error: any) {
    console.error('Error initializing repository:', error);
    return { success: false, error: error.message };
  }
});

// Clone repository
ipcMain.handle('clone-repository', async (event: any, repoUrl: string, parentFolder: string, repoName: string) => {
  try {
    const targetPath = path.join(parentFolder, repoName);

    // Check if target directory already exists
    if (fs.existsSync(targetPath)) {
      throw new Error(`Directory '${repoName}' already exists in the selected location.`);
    }

    // Create git adapter with temporary path (will be overridden by clone)
    const gitAdapter = await GitFactory.createAdapter(parentFolder, gitBackend);

    // Perform clone
    console.log(`Cloning ${repoUrl} to ${targetPath}`);
    await gitAdapter.clone(repoUrl, parentFolder, repoName);
    console.log('Clone completed successfully');

    return {
      success: true,
      path: targetPath
    };
  } catch (error: any) {
    console.error('Clone failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Auto-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    if (!app.isPackaged) {
      return {
        success: false,
        error: 'Updates are only available in production builds'
      };
    }
    const result = await autoUpdater.checkForUpdates();
    return {
      success: true,
      updateInfo: result?.updateInfo
    };
  } catch (error: any) {
    console.error('Error checking for updates:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error: any) {
    console.error('Error downloading update:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('install-update', () => {
  // This will quit the app and install the update
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
