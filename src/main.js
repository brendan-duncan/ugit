const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let recentRepos = [];
let windowStatePath;

// Parse command-line arguments for git backend selection
// Usage: npm start -- --git-backend=nodegit
let gitBackend = 'simple-git'; // default
const args = process.argv.slice(1);
for (const arg of args) {
  if (arg.startsWith('--git-backend=')) {
    gitBackend = arg.split('=')[1];
    console.log(`Using git backend: ${gitBackend}`);
  }
}

// Load window state from file
function loadWindowState() {
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
function saveWindowState() {
  try {
    const bounds = mainWindow.getBounds();
    const state = {
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

function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
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
    if (!mainWindow.isMaximized()) {
      saveWindowState();
    }
  });

  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowState();
    }
  });

  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
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

  const template = [
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
          label: 'Recent Repositories',
          submenu: recentSubmenu
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
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Clear All Caches',
          click: () => {
            const cacheManager = require('./utils/cacheManager');
            cacheManager.clearAllCaches();
            if (mainWindow) {
              mainWindow.webContents.send('caches-cleared');
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openRepository() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Repository'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const repoPath = result.filePaths[0];
    // Send the repository path to the renderer process
    mainWindow.webContents.send('open-repository', repoPath);
  }
}

// Suppress cache access denied errors
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(() => {
  // Initialize cache manager with user data path
  const cacheManager = require('./utils/cacheManager');
  cacheManager.setCacheDir(app.getPath('userData'));

  // Set window state file path
  windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

  createWindow();
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

// Listen for recent repos updates from renderer
ipcMain.on('update-recent-repos', (event, repos) => {
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

// Show item in file explorer
ipcMain.handle('show-item-in-folder', async (event, itemPath) => {
  const { shell } = require('electron');
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

// Show save dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

// Show open dialog for directory selection
ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

// Clone repository
ipcMain.handle('clone-repository', async (event, repoUrl, parentFolder, repoName) => {
  const GitFactory = require('./git/GitFactory');
  const path = require('path');
  
  try {
    const targetPath = path.join(parentFolder, repoName);
    
    // Check if target directory already exists
    const fs = require('fs');
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
  } catch (error) {
    console.error('Clone failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
