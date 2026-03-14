const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let quitting = false;

const DEFAULT_BACKEND_PORT = 3001;
const ELECTRON_RENDERER_URL = process.env.ELECTRON_RENDERER_URL;
const IS_SMOKE_TEST = process.env.QUARTOREVIEW_SMOKE_TEST === '1';
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

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

function getBackendPidPath() {
  return path.join(app.getPath('userData'), 'backend.pid');
}

function getBundledGuidePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'guide', 'GUIDE.md');
  }
  return path.join(__dirname, '..', 'GUIDE.md');
}

function getAutosaveRootPath() {
  return path.join(app.getPath('userData'), 'autosaves');
}

function ensureAutosaveRootPath() {
  const autosaveRoot = getAutosaveRootPath();
  fs.mkdirSync(autosaveRoot, { recursive: true });
  return autosaveRoot;
}

function sanitizeFileSegment(value) {
  return String(value || 'document')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'document';
}

function formatAutosaveTimestamp(date = new Date()) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function getDocumentIdentity(document) {
  if (!document || !document.kind) return null;
  if (document.kind === 'local') return `local::${document.filePath || document.displayName || 'untitled'}`;
  if (document.kind === 'github') return `github::${document.repository || 'unknown'}::${document.filePath || document.displayName || 'untitled'}`;
  if (document.kind === 'guide') return 'guide::GUIDE.md';
  return `${document.kind}::${document.filePath || document.displayName || 'untitled'}`;
}

function getDocumentBaseName(document) {
  const source = document?.filePath || document?.displayName || 'document.qmd';
  const parsed = path.parse(source);
  const ext = parsed.ext || '.qmd';
  const name = sanitizeFileSegment(parsed.name || 'document');
  return { baseName: name, extension: ext };
}

function getDocumentAutosavePaths(document) {
  const identity = getDocumentIdentity(document);
  if (!identity) return null;

  const docHash = crypto.createHash('sha1').update(identity).digest('hex').slice(0, 12);
  const { baseName, extension } = getDocumentBaseName(document);
  const docDir = path.join(ensureAutosaveRootPath(), `${baseName}__${docHash}`);

  return {
    identity,
    docDir,
    metaPath: path.join(docDir, 'meta.json'),
    latestPath: path.join(docDir, `${baseName}__latest${extension}`),
    baseName,
    extension,
  };
}

function hashContent(content) {
  return crypto.createHash('sha1').update(String(content || ''), 'utf8').digest('hex');
}

function readAutosaveMeta(metaPath) {
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeAutosaveMeta(metaPath, meta) {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

function pruneAutosaveEntries(meta, maxCheckpoints = 10, maxAgeDays = 14) {
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const filesToDelete = [];

  const checkpoints = Array.isArray(meta.checkpoints)
    ? meta.checkpoints
        .filter((entry) => entry && entry.filePath)
        .filter((entry) => {
          const keep = !entry.savedAt || Date.parse(entry.savedAt) >= cutoff;
          if (!keep) filesToDelete.push(entry.filePath);
          return keep;
        })
        .sort((a, b) => Date.parse(b.savedAt || 0) - Date.parse(a.savedAt || 0))
    : [];

  while (checkpoints.length > maxCheckpoints) {
    const removed = checkpoints.pop();
    filesToDelete.push(removed.filePath);
  }

  const sessionStart = meta.sessionStart && meta.sessionStart.filePath && fs.existsSync(meta.sessionStart.filePath)
    ? meta.sessionStart
    : null;

  return {
    nextMeta: {
      ...meta,
      checkpoints,
      sessionStart,
    },
    filesToDelete,
  };
}

function cleanupAutosaveStorage() {
  const autosaveRoot = ensureAutosaveRootPath();
  const entries = fs.readdirSync(autosaveRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const docDir = path.join(autosaveRoot, entry.name);
    const metaPath = path.join(docDir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;

    const meta = readAutosaveMeta(metaPath);
    const { nextMeta, filesToDelete } = pruneAutosaveEntries(meta);
    for (const filePath of filesToDelete) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // Ignore stale paths.
      }
    }
    writeAutosaveMeta(metaPath, nextMeta);
  }
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
    win.once('ready-to-show', () => {
      if (!IS_SMOKE_TEST) {
        win.show();
      }
    });

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

function writeBackendPid(pid) {
  fs.writeFileSync(getBackendPidPath(), String(pid), 'utf8');
}

function clearBackendPid() {
  try {
    fs.unlinkSync(getBackendPidPath());
  } catch (_) {
    // Ignore missing files.
  }
}

async function terminatePid(pid, signal = 'SIGTERM') {
  if (!pid || pid === process.pid) return;

  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code === 'ESRCH') return;
    throw error;
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
  }

  if (process.platform === 'win32') {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('taskkill', ['/PID', String(pid), '/F']);
      return;
    } catch (_) {
      // Fall through to the final kill attempt.
    }
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function killRecordedBackend() {
  const pidPath = getBackendPidPath();
  if (!fs.existsSync(pidPath)) return;

  const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
  clearBackendPid();
  if (!Number.isInteger(pid) || pid <= 0) return;

  try {
    await terminatePid(pid);
  } catch (error) {
    console.warn(`Failed to terminate recorded backend pid ${pid}:`, error.message);
  }
}

function waitForBackendHealth(port, healthToken, timeoutMs = 20000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            maybeRetry(new Error(`Unexpected /health status ${response.statusCode}`));
            return;
          }

          try {
            const payload = JSON.parse(body);
            if (payload.ok && payload.launchToken === healthToken) {
              resolve();
              return;
            }
            maybeRetry(new Error('Backend health token mismatch'));
          } catch (error) {
            maybeRetry(error);
          }
        });
      });

      request.on('error', maybeRetry);
    };

    const maybeRetry = (error) => {
      if (Date.now() - start >= timeoutMs) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      setTimeout(attempt, 250);
    };

    attempt();
  });
}

async function spawnBackend() {
  if (backendProcess) return;
  await killRecordedBackend();

  const backendScriptPath = getBackendScriptPath();
  const backendDir = path.dirname(backendScriptPath);
  const desktopEnvPath = ensureDesktopEnvFile();
  const backendPort = DEFAULT_BACKEND_PORT;
  const backendHealthToken = crypto.randomBytes(24).toString('hex');

  backendProcess = spawn(process.execPath, [backendScriptPath], {
    cwd: backendDir,
    stdio: app.isPackaged ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      APP_MODE: 'desktop',
      PORT: String(backendPort),
      FRONTEND_URL: ELECTRON_RENDERER_URL || `http://localhost:${backendPort}`,
      FRONTEND_DIST: getFrontendDistPath(),
      BACKEND_ENV_PATH: desktopEnvPath,
      BACKEND_HEALTH_TOKEN: backendHealthToken,
      SESSION_DIR: path.join(app.getPath('userData'), 'sessions'),
    },
  });
  backendProcess.__quartoReviewPort = backendPort;
  backendProcess.__quartoReviewHealthToken = backendHealthToken;
  writeBackendPid(backendProcess.pid);

  if (!app.isPackaged) {
    backendProcess.stdout.on('data', (chunk) => process.stdout.write(`[backend] ${chunk}`));
    backendProcess.stderr.on('data', (chunk) => process.stderr.write(`[backend] ${chunk}`));
  }

  backendProcess.on('exit', (code, signal) => {
    clearBackendPid();
    backendProcess = null;
    if (quitting) return;
    process.exitCode = 1;
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
  clearBackendPid();
  child.kill('SIGTERM');
  setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 3000);
}

function exitForSmokeTest(code = 0) {
  quitting = true;
  stopBackend();
  setTimeout(() => app.exit(code), 250);
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

  // The renderer's beforeunload handler blocks window close silently in
  // Electron. Override it: allow closing but ask via a native dialog instead.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Leave', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'You have unsaved changes.',
      detail: 'Close anyway?',
    });
    if (choice === 0) event.preventDefault(); // 0 = "Leave" → allow close
  });

  mainWindow.once('ready-to-show', () => {
    if (!IS_SMOKE_TEST) {
      mainWindow.show();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

async function launchApp() {
  // GitHub setup is now optional — available from the in-app menu.
  // The app launches regardless of whether a token has been configured.
  await spawnBackend();
  await waitForBackendHealth(
    backendProcess.__quartoReviewPort,
    backendProcess.__quartoReviewHealthToken
  );

  const startUrl = ELECTRON_RENDERER_URL || `http://localhost:${backendProcess.__quartoReviewPort}`;
  if (ELECTRON_RENDERER_URL) await waitForUrl(ELECTRON_RENDERER_URL);

  const window = createMainWindow();
  await window.loadURL(startUrl);

  if (IS_SMOKE_TEST) {
    setTimeout(() => exitForSmokeTest(0), 1500);
  }
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
  if (filePath && !filePath.startsWith('quarto-review://')) {
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

ipcMain.handle('open-startup-guide', async () => {
  const guidePath = getBundledGuidePath();
  if (!fs.existsSync(guidePath)) return null;

  return {
    filePath: 'quarto-review://guide/GUIDE.md',
    displayName: 'GUIDE.md',
    content: fs.readFileSync(guidePath, 'utf8'),
    readOnlySource: true,
  };
});

ipcMain.handle('autosave-save', async (_event, payload) => {
  const { document, content, kind } = payload || {};
  const paths = getDocumentAutosavePaths(document);
  if (!paths || typeof content !== 'string') return null;

  fs.mkdirSync(paths.docDir, { recursive: true });
  const savedAt = new Date().toISOString();
  const contentHash = hashContent(content);
  const meta = readAutosaveMeta(paths.metaPath);

  fs.writeFileSync(paths.latestPath, content, 'utf8');
  meta.identity = paths.identity;
  meta.document = document;
  meta.latest = {
    filePath: paths.latestPath,
    savedAt,
    contentHash,
  };

  if (kind === 'session-start') {
    const sessionPath = path.join(
      paths.docDir,
      `${paths.baseName}__session-start__${formatAutosaveTimestamp(new Date(savedAt))}${paths.extension}`
    );
    fs.writeFileSync(sessionPath, content, 'utf8');
    meta.sessionStart = {
      filePath: sessionPath,
      savedAt,
      contentHash,
    };
  }

  if (kind === 'checkpoint') {
    const checkpointPath = path.join(
      paths.docDir,
      `${paths.baseName}__${formatAutosaveTimestamp(new Date(savedAt))}${paths.extension}`
    );
    fs.writeFileSync(checkpointPath, content, 'utf8');
    meta.checkpoints = Array.isArray(meta.checkpoints) ? meta.checkpoints : [];
    meta.checkpoints.push({
      filePath: checkpointPath,
      savedAt,
      contentHash,
    });
  }

  const { nextMeta, filesToDelete } = pruneAutosaveEntries(meta);
  writeAutosaveMeta(paths.metaPath, nextMeta);
  for (const filePath of filesToDelete) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      // Ignore files already gone.
    }
  }

  return {
    savedAt,
    latestPath: paths.latestPath,
  };
});

ipcMain.handle('autosave-get-recovery', async (_event, payload) => {
  const { document, currentContent } = payload || {};
  const paths = getDocumentAutosavePaths(document);
  if (!paths || !fs.existsSync(paths.metaPath)) return null;

  const meta = readAutosaveMeta(paths.metaPath);
  const currentHash = hashContent(currentContent || '');
  const candidates = [];

  if (meta.latest?.filePath && fs.existsSync(meta.latest.filePath) && meta.latest.contentHash !== currentHash) {
    candidates.push({
      type: 'latest',
      filePath: meta.latest.filePath,
      savedAt: meta.latest.savedAt,
    });
  }

  if (meta.sessionStart?.filePath && fs.existsSync(meta.sessionStart.filePath) && meta.sessionStart.contentHash !== currentHash) {
    candidates.push({
      type: 'session-start',
      filePath: meta.sessionStart.filePath,
      savedAt: meta.sessionStart.savedAt,
    });
  }

  for (const checkpoint of meta.checkpoints || []) {
    if (!checkpoint?.filePath || !fs.existsSync(checkpoint.filePath)) continue;
    if (checkpoint.contentHash === currentHash) continue;
    candidates.push({
      type: 'checkpoint',
      filePath: checkpoint.filePath,
      savedAt: checkpoint.savedAt,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.savedAt || 0) - Date.parse(a.savedAt || 0));
  const newest = candidates[0];

  return {
    ...newest,
    content: fs.readFileSync(newest.filePath, 'utf8'),
  };
});

ipcMain.handle('autosave-clear', async (_event, payload) => {
  const paths = getDocumentAutosavePaths(payload?.document);
  if (!paths || !fs.existsSync(paths.docDir)) return null;

  fs.rmSync(paths.docDir, { recursive: true, force: true });
  return { cleared: true };
});

ipcMain.handle('autosave-open-folder', async () => {
  const autosaveRoot = ensureAutosaveRootPath();
  return shell.openPath(autosaveRoot);
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    cleanupAutosaveStorage();
    await launchApp();
  } catch (error) {
    process.exitCode = 1;
    if (IS_SMOKE_TEST) {
      exitForSmokeTest(1);
      return;
    }
    dialog.showErrorBox('Failed to Launch QuartoReview', error.message);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await launchApp();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.on('before-quit', () => {
  quitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
