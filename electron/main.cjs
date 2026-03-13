const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
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

function getEnvTemplatePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', '.env.example');
  }
  return path.join(app.getAppPath(), 'backend', '.env.example');
}

function ensureDesktopEnvFile() {
  const userDataDir = app.getPath('userData');
  const envPath = path.join(userDataDir, '.env');

  if (fs.existsSync(envPath)) {
    return envPath;
  }

  const templatePath = getEnvTemplatePath();
  if (fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, envPath);
  } else {
    fs.writeFileSync(envPath, 'SESSION_SECRET=replace-this-with-a-random-secret\n', 'utf8');
  }

  dialog.showMessageBoxSync({
    type: 'info',
    title: 'QuartoReview Setup',
    message: 'A desktop configuration file was created.',
    detail: `Fill in ${envPath} with either a GitHub token or OAuth credentials before using GitHub-backed features.`
  });

  return envPath;
}

function spawnBackend() {
  if (backendProcess) {
    return;
  }

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
      SESSION_DIR: path.join(app.getPath('userData'), 'sessions')
    }
  });

  if (!app.isPackaged) {
    backendProcess.stdout.on('data', (chunk) => {
      process.stdout.write(`[backend] ${chunk}`);
    });
    backendProcess.stderr.on('data', (chunk) => {
      process.stderr.write(`[backend] ${chunk}`);
    });
  }

  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;

    if (quitting) {
      return;
    }

    dialog.showErrorBox(
      'QuartoReview Backend Stopped',
      `The embedded backend exited unexpectedly (${signal || code || 'unknown'}).`
    );
    app.quit();
  });
}

function stopBackend() {
  if (!backendProcess) {
    return;
  }

  const child = backendProcess;
  backendProcess = null;

  child.kill('SIGTERM');

  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, 3000);
}

function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });

      socket.once('connect', () => {
        socket.end();
        resolve();
      });

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
      const request = client.get(urlString, (response) => {
        response.resume();
        resolve();
      });

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
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

async function launchApp() {
  spawnBackend();
  await waitForPort(BACKEND_PORT);

  const startUrl = ELECTRON_RENDERER_URL || `http://localhost:${BACKEND_PORT}`;
  if (ELECTRON_RENDERER_URL) {
    await waitForUrl(ELECTRON_RENDERER_URL);
  }

  const window = createMainWindow();
  await window.loadURL(startUrl);
}

app.whenReady().then(async () => {
  try {
    await launchApp();
  } catch (error) {
    dialog.showErrorBox('Failed to Launch QuartoReview', error.message);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await launchApp();
    }
  });
});

app.on('before-quit', () => {
  quitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
