import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import fixPath from 'fix-path';

// On macOS/Linux, GUI-launched apps don't inherit the shell's PATH, so spawned
// processes (git, git-lfs, etc.) can't be found. fix-path runs the user's login
// shell to recover the real PATH.
fixPath();
import cacheManager from './utils/cacheManager';
import { initializeSettings } from './utils/settings';
import { getSettingsManager } from './utils/settings';
import GitFactory from './git/GitFactory';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { shell } from 'electron';
import { exec, spawn, execFile } from 'child_process';

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, let user choose
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

let mainWindow: Electron.BrowserWindow | null = null;
let recentRepos: string[] = [];
let windowStatePath: string;
// A repository path passed on the command line (e.g. from the Windows Explorer
// "Open with ugit" context menu) that should be opened once the renderer is ready.
let pendingOpenPath: string | null = null;

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

// Extract a repository (directory) path passed on the command line. The Windows
// Explorer context menu launches `ugit.exe "C:\path\to\folder"`, so we scan the
// arguments for the first one that points at an existing directory.
//
// We deliberately avoid keying off positional indexes (e.g. app.isPackaged): the
// `second-instance` event delivers the *other* process's argv, whose layout can
// differ from this instance's (a packaged app receiving args from an `electron .`
// launch still has a leading `.` script arg). Requiring an *absolute* directory
// path cleanly ignores the executable path (a file), the `.` script arg (relative),
// and any flags, regardless of how either process was launched.
function getRepoPathFromArgs(argv: string[]): string | null {
  for (const arg of argv) {
    if (!arg || arg.startsWith('-') || !path.isAbsolute(arg)) {
      continue;
    }
    try {
      if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
        return path.resolve(arg);
      }
    } catch {
      // Ignore unreadable/invalid paths and keep scanning.
    }
  }
  return null;
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
  // Get current settings
  const settingsManager = getSettingsManager();
  const currentTheme = settingsManager.getSetting('theme') || 'dark';

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
          label: 'Lore Shared Stores...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-shared-store-dialog');
            }
          }
        },
        {
          label: 'Local Lore Server...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-local-server-dialog');
            }
          }
        },
        { type: 'separator' },
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
      label: 'Edit',
      submenu: [
        //{ role: 'undo' },
        //{ role: 'redo' },
        //{ type: 'separator' },
        //{ role: 'cut' },
        { role: 'copy' },
        //{ role: 'paste' },
        //{ role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Color Mode',
          submenu: [
            {
              label: 'Dark',
              type: 'radio',
              checked: currentTheme === 'dark',
              click: () => {
                settingsManager.updateSetting('theme', 'dark');
                if (mainWindow) {
                  mainWindow.reload();
                }
              }
            },
            {
              label: 'Light',
              type: 'radio',
              checked: currentTheme === 'light',
              click: () => {
                settingsManager.updateSetting('theme', 'light');
                if (mainWindow) {
                  mainWindow.reload();
                }
              }
            }
          ]
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
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://brendan-duncan.github.io/ugit');
          }
        },
        {
          label: 'Issue Tracker',
          click: () => {
            shell.openExternal('https://github.com/brendan-duncan/ugit/issues');
          }
        },
        {
          label: 'GitHub Repository',
          click: () => {
            shell.openExternal('https://github.com/brendan-duncan/ugit');
          }
        },
        { type: 'separator' },
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

// Ensure only a single instance runs. When the user invokes "Open with ugit" on a
// folder while ugit is already running, Windows launches a second process; the lock
// hands the folder path to the existing instance instead of opening a new window.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const repoPath = getRepoPathFromArgs(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      if (repoPath) {
        mainWindow.webContents.send('open-repository', repoPath);
      }
    }
  });

  app.whenReady().then(() => {
    // Initialize cache manager with user data path
    cacheManager.setCacheDir(app.getPath('userData'));

    // Initialize settings manager
    initializeSettings(cacheManager);

    // Set window state file path
    windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

    // Capture any folder passed on the command line so it can be opened once the
    // renderer signals it is ready (see the 'renderer-ready' handler below).
    pendingOpenPath = getRepoPathFromArgs(process.argv);

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
}

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

// The renderer signals it has registered its IPC listeners. Flush any repository
// path that was passed on the command line (e.g. via "Open with ugit").
ipcMain.on('renderer-ready', () => {
  if (mainWindow && pendingOpenPath) {
    mainWindow.webContents.send('open-repository', pendingOpenPath);
    pendingOpenPath = null;
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

// Open a terminal/console at the given directory (or a file's parent directory).
ipcMain.handle('open-in-console', async (event: any, itemPath: string) => {
  try {
    let dir = itemPath;
    if (fs.existsSync(itemPath) && !fs.statSync(itemPath).isDirectory()) dir = path.dirname(itemPath);
    if (!fs.existsSync(dir)) dir = path.dirname(itemPath);
    if (process.platform === 'win32') {
      exec(`start "" cmd /K cd /d "${dir}"`, { cwd: dir });
    } else if (process.platform === 'darwin') {
      exec(`open -a Terminal "${dir}"`);
    } else {
      exec(`x-terminal-emulator || gnome-terminal || xterm`, { cwd: dir });
    }
  } catch (error) {
    console.error('Error opening console:', error);
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

// --- Lore tooling: version detection, install, and local server management ---

const LORE_SERVER_HTTP = 'http://127.0.0.1:41339/health_check';

function loreServerHealthy(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(LORE_SERVER_HTTP, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function loreServerPaths(dataFolder: string) {
  const store = path.join(dataFolder, 'store');
  const logs = path.join(dataFolder, 'logs');
  const config = path.join(dataFolder, 'config');
  return {
    store, logs, config,
    pidFile: path.join(logs, 'server.pid'),
    outLog: path.join(logs, 'server.out.log'),
    errLog: path.join(logs, 'server.err.log'),
    localToml: path.join(config, 'local.toml'),
  };
}

function binVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) { resolve(null); return; }
      resolve((stdout || stderr || '').trim() || 'installed');
    });
  });
}

// Report whether the lore CLI / loreserver are found (with versions) and whether a server is up.
ipcMain.handle('lore-detect', async (_event: any, lorePath: string, serverPath: string) => {
  const [loreVersion, serverVersion, serverHealthy] = await Promise.all([
    binVersion(lorePath),
    binVersion(serverPath),
    loreServerHealthy(),
  ]);
  return { loreVersion, serverVersion, serverHealthy };
});

// Run Epic's official install script for this platform. Network + system-modifying — user-initiated.
ipcMain.handle('lore-install', async () => {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? { file: 'powershell.exe', args: ['-NoProfile', '-Command', 'irm https://raw.githubusercontent.com/EpicGames/lore/main/scripts/install.ps1 | iex'] }
      : { file: 'bash', args: ['-c', 'curl -fsSL https://raw.githubusercontent.com/EpicGames/lore/main/scripts/install.sh | bash'] };
    execFile(cmd.file, cmd.args, { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`.trim();
      if (err) { resolve({ ok: false, output: output || err.message }); return; }
      resolve({ ok: true, output: output || 'Install complete.' });
    });
  });
});

ipcMain.handle('lore-server-status', async () => {
  return { running: await loreServerHealthy() };
});

// Start a durable local Lore server against `dataFolder` (generates config, spawns loreserver,
// records a PID, polls health). Mirrors the dev start-server script, generalized to any folder.
ipcMain.handle('lore-server-start', async (_event: any, dataFolder: string, serverPath: string) => {
  try {
    if (!dataFolder || !dataFolder.trim()) return { ok: false, message: 'Choose a data folder first.' };
    if (await loreServerHealthy()) return { ok: true, alreadyRunning: true, message: 'A Lore server is already listening on 41337.' };

    const p = loreServerPaths(dataFolder);
    fs.mkdirSync(p.store, { recursive: true });
    fs.mkdirSync(p.logs, { recursive: true });
    fs.mkdirSync(p.config, { recursive: true });
    // Durable storage overrides (JSON.stringify gives a valid TOML basic string with escaped \).
    const toml =
      '# Generated by ugit — durable local Lore server storage.\n' +
      `[immutable_store.local]\npath = ${JSON.stringify(p.store)}\nflush_delay_seconds = 10\n\n` +
      `[mutable_store.local]\npath = ${JSON.stringify(p.store)}\nflush_delay_seconds = 10\n`;
    fs.writeFileSync(p.localToml, toml, 'utf8');

    const out = fs.openSync(p.outLog, 'a');
    const errFd = fs.openSync(p.errLog, 'a');
    const child = spawn(serverPath, ['--config', p.config], {
      detached: true,
      stdio: ['ignore', out, errFd],
      windowsHide: true,
      env: { ...process.env, RUST_LOG: process.env.RUST_LOG || 'info' },
    });
    child.on('error', () => { /* surfaced via the health poll below */ });
    if (child.pid) fs.writeFileSync(p.pidFile, String(child.pid), 'utf8');
    child.unref();

    for (let i = 0; i < 15; i++) {
      if (await loreServerHealthy()) return { ok: true, pid: child.pid, message: 'Server started and healthy.' };
      await new Promise(r => setTimeout(r, 600));
    }
    return { ok: true, pid: child.pid, healthy: false, message: `Server process started (PID ${child.pid ?? '?'}) but it isn't healthy yet — check ${p.errLog}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
});

// Stop the local server by killing the PID ugit recorded when it started the process.
ipcMain.handle('lore-server-stop', async (_event: any, dataFolder: string) => {
  let killed = false;
  if (dataFolder && dataFolder.trim()) {
    const p = loreServerPaths(dataFolder);
    try {
      const pid = parseInt(fs.readFileSync(p.pidFile, 'utf8').trim(), 10);
      if (pid) { process.kill(pid); killed = true; }
    } catch { /* no/stale pid file, or process already gone */ }
    try { fs.unlinkSync(p.pidFile); } catch { /* ignore */ }
  }
  // Give the OS a moment to release the port, then re-check health.
  await new Promise(r => setTimeout(r, 400));
  const stillUp = await loreServerHealthy();
  return {
    ok: !stillUp,
    killed,
    running: stillUp,
    message: stillUp
      ? "A server is still responding on 41337 — it may have been started outside ugit; stop it where it's running."
      : 'Server stopped.',
  };
});

// Init repository
ipcMain.handle('init-repository', async (event: any, options: any) => {
  try {
    // Support both the legacy string-path call and the new options object.
    const {
      repoPath,
      remoteName = 'origin',
      remoteUrl = '',
      branchName = 'main',
    } = typeof options === 'string' ? { repoPath: options } as any : (options || {});

    // Create git adapter
    const gitAdapter = await GitFactory.createAdapter(repoPath, gitBackend);

    // Initialize repository with the requested branch name (defaults to 'main')
    await gitAdapter.init((branchName && branchName.trim()) || 'main');

    // Only add a remote when a URL was provided.
    const trimmedUrl = (remoteUrl || '').trim();
    if (trimmedUrl) {
      await gitAdapter.addRemote((remoteName && remoteName.trim()) || 'origin', trimmedUrl);
    }

    // Drop any stale cache left over from a previous repository at this path so the
    // freshly initialized repo loads its real branch/remote state instead of showing
    // out-of-date values (e.g. the wrong branch name) until the first manual refresh.
    cacheManager.clearCache(repoPath);

    return { success: true, path: repoPath };
  } catch (error: any) {
    console.error('Error initializing repository:', error);
    return { success: false, error: error.message };
  }
});

// Clone repository
ipcMain.handle('clone-repository', async (event: any, repoUrl: string, parentFolder: string, repoName: string, cloneId?: string, cloneDepth?: number) => {
  try {
    const targetPath = path.join(parentFolder, repoName);

    // Check if target directory already exists
    if (fs.existsSync(targetPath)) {
      throw new Error(`Directory '${repoName}' already exists in the selected location.`);
    }

    // Create git adapter with temporary path (will be overridden by clone)
    const gitAdapter = await GitFactory.createAdapter(parentFolder, gitBackend);

    // Forward clone progress back to the tab that initiated it (if any), so the
    // renderer can show progress without blocking the rest of the UI.
    const onProgress = cloneId
      ? (progress: any) => {
          try {
            event.sender.send('clone-progress', { cloneId, ...progress });
          } catch (err) {
            // Window may have been closed mid-clone; ignore.
          }
        }
      : undefined;

    // Perform clone (depth comes from the clone dialog; 0/undefined = full clone).
    const depth = cloneDepth && cloneDepth > 0 ? cloneDepth : 0;
    console.log(`Cloning ${repoUrl} to ${targetPath}${depth > 0 ? ` (depth ${depth})` : ''}`);
    await gitAdapter.clone(repoUrl, parentFolder, repoName, onProgress, depth);
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
