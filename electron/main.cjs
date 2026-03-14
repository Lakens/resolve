const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let quitting = false;

const BACKEND_PORT = 3001;
const ELECTRON_RENDERER_URL = process.env.ELECTRON_RENDERER_URL;

function getBackendScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'index.js');
  }
  return path.join(app.getAppPath(), 'backend', 'index.js');
}

function getFrontendDistPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'dist');
  }
  return path.join(app.getAppPath(), 'frontend', 'dist');
}

function getDesktopEnvPath() {
  return path.join(app.getPath('userData'), '.env');
}

// ---------------------------------------------------------------------------
// Setup: check whether a valid GitHub token has been configured
// ---------------------------------------------------------------------------

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

function needsSetup() {
  const envPath = getDesktopEnvPath();
  if (!fs.existsSync(envPath)) return true;
  const env = parseEnvFile(envPath);
  const token = env['GITHUB_TOKEN'] || '';
  // Not set, empty, or still the placeholder from the template
  return !token || token.startsWith('ghp_YOUR') || token === 'your_token_here';
}

function ensureDesktopEnvFile() {
  const envPath = getDesktopEnvPath();
  if (!fs.existsSync(envPath)) {
    const templatePath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend', '.env.example')
      : path.join(app.getAppPath(), 'backend', '.env.example');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, envPath);
    } else {
      fs.writeFileSync(envPath,
        'SESSION_SECRET=\nGITHUB_TOKEN=\n', 'utf8');
    }
  }
  return envPath;
}

function saveToken(token) {
  const envPath = ensureDesktopEnvFile();
  let content = fs.readFileSync(envPath, 'utf8');

  // Replace or append GITHUB_TOKEN line (including commented-out versions)
  if (/^#?\s*GITHUB_TOKEN\s*=/m.test(content)) {
    content = content.replace(/^#?\s*GITHUB_TOKEN\s*=.*$/m, `GITHUB_TOKEN=${token}`);
  } else {
    content += `\nGITHUB_TOKEN=${token}\n`;
  }

  // Auto-generate SESSION_SECRET if missing or empty
  if (/^#?\s*SESSION_SECRET\s*=\s*$/m.test(content) || !/^SESSION_SECRET\s*=/m.test(content)) {
    const secret = crypto.randomBytes(32).toString('hex');
    if (/^#?\s*SESSION_SECRET\s*=/m.test(content)) {
      content = content.replace(/^#?\s*SESSION_SECRET\s*=.*$/m, `SESSION_SECRET=${secret}`);
    } else {
      content = `SESSION_SECRET=${secret}\n` + content;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Setup window
// ---------------------------------------------------------------------------

function showSetupWindow() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 600,
      height: 580,
      resizable: false,
      center: true,
      title: 'QuartoReview — Setup',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'setup-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'setup.html'));
    win.once('ready-to-show', () => win.show());

    ipcMain.once('setup-save', (_event, token) => {
      saveToken(token.trim());
      win.close();
      resolve();
    });

    ipcMain.once('setup-open-github', () => {
      shell.openExternal('https://github.com/settings/tokens/new?scopes=repo&description=QuartoReview');
    });

    win.on('closed', () => resolve());
  });
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

function spawnBackend() {
  if (backendProcess) return;

  const backendScriptPath = getBackendScriptPath();
  const backendDir = path.dirname(backendScriptPath);
  const desktopEnvPath = ensureDesktopEnvFile();

  backendProcess = spawn(process.execPath, [backendScriptPath], {
    cwd: backendDir,
    stdio: app.isPackaged ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      APP_MODE: 'desktop',
      PORT: String(BACKEND_PORT),
      FRONTEND_URL: ELECTRON_RENDERER_URL || `http://localhost:${BACKEND_PORT}`,
      FRONTEND_DIST: getFrontendDistPath(),
      BACKEND_ENV_PATH: desktopEnvPath,
      SESSION_DIR: path.join(app.getPath('userData'), 'sessions'),
    },
  });

  if (!app.isPackaged) {
    backendProcess.stdout.on('data', (chunk) => process.stdout.write(`[backend] ${chunk}`));
    backendProcess.stderr.on('data', (chunk) => process.stderr.write(`[backend] ${chunk}`));
  }

  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    if (quitting) return;
    dialog.showErrorBox(
      'QuartoReview Backend Stopped',
      `The embedded backend exited unexpectedly (${signal || code || 'unknown'}).`
    );
    app.quit();
  });
}

function stopBackend() {
  if (!backendProcess) return;
  const child = backendProcess;
  backendProcess = null;
  child.kill('SIGTERM');
  setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 3000);
}

function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for localhost:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function waitForUrl(urlString, timeoutMs = 20000) {
  const start = Date.now();
  const client = urlString.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = client.get(urlString, (response) => { response.resume(); resolve(); });
      request.on('error', () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${urlString}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'QuartoReview',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

async function launchApp() {
  // GitHub setup is now optional — available from the in-app menu.
  // The app launches regardless of whether a token has been configured.
  spawnBackend();
  await waitForPort(BACKEND_PORT);

  const startUrl = ELECTRON_RENDERER_URL || `http://localhost:${BACKEND_PORT}`;
  if (ELECTRON_RENDERER_URL) await waitForUrl(ELECTRON_RENDERER_URL);

  const window = createMainWindow();
  await window.loadURL(startUrl);
}

// ---------------------------------------------------------------------------
// IPC — local file access & in-app GitHub setup
// ---------------------------------------------------------------------------

ipcMain.handle('open-local-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open file',
    filters: [
      { name: 'Markdown files', extensions: ['qmd', 'Rmd', 'rmd', 'md'] },
      { name: 'All files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('save-local-file', async (_event, content, filePath) => {
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath };
  }
  // No path: ask where to save
  const { canceled, filePath: chosenPath } = await dialog.showSaveDialog({
    title: 'Save file',
    filters: [
      { name: 'Markdown files', extensions: ['qmd', 'Rmd', 'rmd', 'md'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (canceled || !chosenPath) return null;
  fs.writeFileSync(chosenPath, content, 'utf8');
  return { filePath: chosenPath };
});

ipcMain.handle('show-github-setup', async () => {
  await showSetupWindow();
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    await launchApp();
  } catch (error) {
    dialog.showErrorBox('Failed to Launch QuartoReview', error.message);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await launchApp();
  });
});

app.on('before-quit', () => {
  quitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
