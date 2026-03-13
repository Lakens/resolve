/**
 * Lazily initialises a single shared WebR instance for the entire app session.
 *
 * WebR boots an R interpreter compiled to WebAssembly (~50 MB download on first
 * use, then cached by the browser).  We keep one instance alive for the whole
 * session so that:
 *   - The global R environment persists between chunk runs (variables, loaded
 *     packages, etc.)
 *   - We only pay the start-up cost once.
 *
 * Call getWebR() to obtain the ready instance; it returns a promise so the
 * caller can await initialisation without blocking.
 *
 * Call installPackagesForQmd(qmdContent) after loading a file to install exactly
 * the packages referenced by library()/require() calls in that document.
 *
 * Call syncFilesForQmd(qmdContent, qmdFilePath, repository, fetchRawFileFn)
 * to mirror data files referenced in R chunks into WebR's virtual filesystem.
 */

// ── Status / subscriber system ────────────────────────────────────────────────
// packageStatus shape: { phase: 'idle'|'installing'|'done'|'error',
//                        current: string|null, index: number, total: number,
//                        errors: Array<{pkg: string, message: string}> }
let _packageStatus = { phase: 'idle', current: null, index: 0, total: 0, errors: [] };
const _packageSubscribers = new Set();

function _setPackageStatus(update) {
  _packageStatus = { ..._packageStatus, ...update };
  _packageSubscribers.forEach(fn => fn(_packageStatus));
}

/** Subscribe to package-installation status changes.  Returns an unsubscribe fn. */
export function subscribePackageStatus(fn) {
  _packageSubscribers.add(fn);
  fn(_packageStatus); // immediately emit current state
  return () => _packageSubscribers.delete(fn);
}

/** Synchronous snapshot of the current package status. */
export function getPackageStatus() {
  return _packageStatus;
}

// ── File-sync status / subscriber system ─────────────────────────────────────
// fileStatus shape: { phase: 'idle'|'syncing'|'done'|'error',
//                     current: string|null, synced: number, total: number,
//                     skipped: string[] }
let _fileStatus = { phase: 'idle', current: null, synced: 0, total: 0, skipped: [] };
const _fileSubscribers = new Set();

function _setFileStatus(update) {
  _fileStatus = { ..._fileStatus, ...update };
  _fileSubscribers.forEach(fn => fn(_fileStatus));
}

/** Subscribe to file-sync status changes.  Returns an unsubscribe fn. */
export function subscribeFileStatus(fn) {
  _fileSubscribers.add(fn);
  fn(_fileStatus);
  return () => _fileSubscribers.delete(fn);
}

// ── QMD package extraction ────────────────────────────────────────────────────

/**
 * Parse a QMD string and return the unique set of package names referenced
 * by library() or require() calls inside R code chunks.
 */
export function extractPackagesFromQmd(qmdContent) {
  const packages = new Set();
  if (!qmdContent) return packages;

  // Match fenced R code chunks: ```{r ...} ... ```
  const chunkRegex = /^```\{r[^}]*\}([\s\S]*?)^```/gm;
  let chunkMatch;
  while ((chunkMatch = chunkRegex.exec(qmdContent)) !== null) {
    const chunkBody = chunkMatch[1];
    // Match library(pkg), library("pkg"), require(pkg), require('pkg')
    // Also handles optional second arguments: library(pkg, quietly = TRUE)
    const libRegex = /(?:library|require)\s*\(\s*["']?([a-zA-Z][a-zA-Z0-9._]*)["']?\s*(?:[,)])/g;
    let libMatch;
    while ((libMatch = libRegex.exec(chunkBody)) !== null) {
      packages.add(libMatch[1]);
    }
  }
  return packages;
}

// ── WebR instance ─────────────────────────────────────────────────────────────
let _instance = null;
let _initPromise = null;

/**
 * Returns a promise that resolves to the ready WebR instance.
 * Calling it multiple times is safe – initialisation only runs once.
 */
export async function getWebR() {
  if (!_initPromise) {
    _initPromise = (async () => {
      console.log('[WebR] Starting initialization…');
      console.log('[WebR] crossOriginIsolated =', window.crossOriginIsolated);
      console.log('[WebR] SharedArrayBuffer available =', typeof SharedArrayBuffer !== 'undefined');

      const { WebR } = await import('@r-wasm/webr');
      console.log('[WebR] Package imported, creating instance…');

      let channelType, channelLabel;
      if (window.crossOriginIsolated) {
        channelType = 1; // SharedArrayBuffer — fastest
        channelLabel = 'SharedArrayBuffer';
      } else {
        channelType = 2; // ServiceWorker fallback
        channelLabel = 'ServiceWorker';
      }
      console.log(`[WebR] Using channel: ${channelLabel} (type ${channelType})`);

      // baseUrl points to our local Vite middleware that serves the webr dist
      // directory — avoids downloading the 50 MB R binary from the CDN.
      const webR = new WebR(
        channelType === 2
          ? { channelType: 2, baseUrl: '/webr-dist/', serviceWorkerUrl: '/' }
          : { channelType: 1, baseUrl: '/webr-dist/' }
      );

      console.log('[WebR] Calling webR.init() — waiting for R to boot…');
      await webR.init();
      console.log('[WebR] init() resolved — R is ready!');

      // Make kbl() / knitr::kable() default to HTML output so tables render
      // correctly in the browser without needing format = "html" each time.
      await webR.evalRVoid('options(knitr.table.format = "html")');

      _instance = webR;
      return webR;
    })().catch(err => {
      console.error('[WebR] Initialization failed:', err);
      _initPromise = null; // allow retry
      throw err;
    });
  }
  return _initPromise;
}

/**
 * Install exactly the packages referenced by library()/require() in the given
 * QMD content.  Boots WebR if not already running.  Reports per-package errors
 * (e.g. package not compiled for WebAssembly) without aborting the whole batch.
 */
export async function installPackagesForQmd(qmdContent) {
  const packages = [...extractPackagesFromQmd(qmdContent)];
  if (packages.length === 0) return;

  const webR = await getWebR();
  const errors = [];

  _setPackageStatus({ phase: 'installing', index: 0, total: packages.length, errors: [], current: null });

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    _setPackageStatus({ current: pkg, index: i + 1 });
    console.log(`[WebR] Installing ${pkg} (${i + 1}/${packages.length})…`);
    try {
      await webR.installPackages([pkg], { quiet: true });
      // installPackages() only emits an R *warning* when a binary isn't found
      // — it never throws.  Verify the package is actually in the library.
      await webR.evalRVoid(`find.package("${pkg}")`);
      // Load the package into the R session so it's ready to use immediately.
      await webR.evalRVoid(`library("${pkg}")`, { withAutoprint: false });
      console.log(`[WebR] ${pkg} installed and loaded.`);
    } catch (err) {
      console.warn(`[WebR] ${pkg} not available for WebAssembly.`);
      errors.push({ pkg, message: 'Not available for WebAssembly' });
    }
  }

  if (errors.length > 0) {
    _setPackageStatus({ phase: 'error', current: null, errors });
    console.warn('[WebR] Unavailable packages:', errors.map(e => e.pkg).join(', '));
  } else {
    _setPackageStatus({ phase: 'done', current: null, errors: [] });
  }
}

/** Returns the set of package names that failed to install (unavailable for WebAssembly). */
export function getFailedPackages() {
  return new Set((_packageStatus.errors || []).map(e => e.pkg));
}

/**
 * Synchronous status check – useful for rendering a label before awaiting.
 * Returns 'idle' | 'loading' | 'ready'.
 */
export function getWebRStatus() {
  if (!_initPromise) return 'idle';
  if (!_instance) return 'loading';
  return 'ready';
}

// ── QMD file-path extraction ──────────────────────────────────────────────────

// Common R functions that take a file path as their first string argument.
const FILE_READ_FN_PATTERN = [
  'read\\.csv', 'read\\.csv2', 'read\\.table', 'read\\.delim', 'read\\.fwf',
  'read_csv', 'read_csv2', 'read_tsv', 'read_delim', 'read_delim2',
  'read_excel', 'read_xlsx', 'read_xls',
  'readRDS', 'load',
  'source',
  'fread',
  'read_sav', 'read_dta', 'read_sas', 'read_spss',
  'readLines', 'scan',
].join('|');

const FILE_PATH_RE = new RegExp(
  `(?:${FILE_READ_FN_PATTERN})\\s*\\(\\s*["']([^"']+)["']`,
  'g'
);

/**
 * Parse a QMD string and return the unique set of relative file paths
 * referenced by common file-reading functions inside R code chunks.
 * Absolute paths and URLs are excluded — only relative paths are returned.
 */
export function extractFilePathsFromQmd(qmdContent) {
  const paths = new Set();
  if (!qmdContent) return paths;

  const chunkRegex = /^```\{r[^}]*\}([\s\S]*?)^```/gm;
  let chunkMatch;
  while ((chunkMatch = chunkRegex.exec(qmdContent)) !== null) {
    const body = chunkMatch[1];
    const re = new RegExp(FILE_PATH_RE.source, 'g');
    let m;
    while ((m = re.exec(body)) !== null) {
      const p = m[1];
      // Skip URLs and absolute paths — we can only serve relative repo paths
      if (!p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('/')) {
        paths.add(p);
      }
    }
  }
  return paths;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a relative file path against the directory containing the QMD file,
 * producing a normalised repo-relative path.
 *
 * Example: qmdFilePath = "chapters/ch1.qmd", relativePath = "../data/file.csv"
 *          → "data/file.csv"
 */
function resolveRepoPath(qmdFilePath, relativePath) {
  const qmdDir = qmdFilePath.includes('/')
    ? qmdFilePath.substring(0, qmdFilePath.lastIndexOf('/'))
    : '';
  const combined = qmdDir ? `${qmdDir}/${relativePath}` : relativePath;
  const parts = combined.split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  return resolved.join('/');
}

/** Recursively create directories in WebR's virtual filesystem. */
async function mkdirp(webR, dirPath) {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try { await webR.FS.mkdir(current); } catch (_) { /* already exists — fine */ }
  }
}

/** Decode a base64 string to a Uint8Array (for binary-safe FS writes). */
function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── File sync ─────────────────────────────────────────────────────────────────

/**
 * Mirror data files referenced in R chunks into WebR's virtual filesystem so
 * that read_csv(), read_excel(), load(), source(), etc. work without changes.
 *
 * Steps:
 *  1. Scan the QMD for relative file path literals in file-reading calls.
 *  2. Set WebR's working directory to match the QMD's location in the repo.
 *  3. For each path: resolve it repo-relative, fetch via the backend, write
 *     into WebR's FS at the corresponding absolute path under /home/web_user/.
 *
 * @param {string}   qmdContent   - Raw QMD text.
 * @param {string}   qmdFilePath  - Path of the QMD within the repo (e.g. "chapters/ch1.qmd").
 * @param {string}   repository   - "owner/repo" string.
 * @param {Function} fetchRawFileFn - async (path, repository) → { content: base64, size }
 */
export async function syncFilesForQmd(qmdContent, qmdFilePath, repository, fetchRawFileFn) {
  const relativePaths = [...extractFilePathsFromQmd(qmdContent)];

  const webR = await getWebR();

  // Set R's working directory to the QMD's directory within the virtual FS,
  // so that relative paths in code (../data/file.csv) resolve correctly.
  const qmdDir = qmdFilePath && qmdFilePath.includes('/')
    ? qmdFilePath.substring(0, qmdFilePath.lastIndexOf('/'))
    : '';
  const webRWorkDir = `/home/web_user${qmdDir ? '/' + qmdDir : ''}`;
  await mkdirp(webR, webRWorkDir);
  await webR.evalRVoid(`setwd("${webRWorkDir}")`);
  console.log(`[WebR] Working directory set to ${webRWorkDir}`);

  if (relativePaths.length === 0) {
    _setFileStatus({ phase: 'done', current: null, synced: 0, total: 0, skipped: [] });
    return;
  }

  if (!repository) {
    console.warn('[WebR] syncFilesForQmd: no repository provided, skipping file sync');
    return;
  }

  _setFileStatus({ phase: 'syncing', current: null, synced: 0, total: relativePaths.length, skipped: [] });

  const skipped = [];

  for (let i = 0; i < relativePaths.length; i++) {
    const relPath = relativePaths[i];
    const repoPath = resolveRepoPath(qmdFilePath || '', relPath);
    const fsPath = `/home/web_user/${repoPath}`;

    _setFileStatus({ current: relPath, synced: i });
    console.log(`[WebR] Fetching ${repoPath} from GitHub…`);

    try {
      const { content } = await fetchRawFileFn(repoPath, repository);
      const bytes = base64ToUint8Array(content);

      // Ensure parent directory exists
      const parentDir = fsPath.includes('/') ? fsPath.substring(0, fsPath.lastIndexOf('/')) : '/home/web_user';
      await mkdirp(webR, parentDir);

      await webR.FS.writeFile(fsPath, bytes);
      console.log(`[WebR] Wrote ${fsPath} (${bytes.length} bytes)`);
    } catch (err) {
      const reason = err?.response?.status === 404
        ? 'not found in repository'
        : err?.response?.status === 413
          ? 'file too large (> 5 MB)'
          : err?.message || 'fetch failed';
      console.warn(`[WebR] Skipping ${repoPath}: ${reason}`);
      skipped.push(relPath);
    }
  }

  _setFileStatus({
    phase: 'done',
    current: null,
    synced: relativePaths.length - skipped.length,
    total: relativePaths.length,
    skipped,
  });
}

// ── Inline R evaluation ───────────────────────────────────────────────────────

// Module-level cache: expr → { value: string, error: string|null }
let _inlineRCache = new Map();

/** Return the current inline-R evaluation cache (read-only snapshot). */
export function getInlineRCache() {
  return _inlineRCache;
}

/**
 * Evaluate an array of unique inline R expressions via WebR and cache results.
 * Each expression is evaluated as `as.character(<expr>)` so numbers, booleans,
 * and vectors are converted to readable strings.
 *
 * Returns a Map of expr → { value: string|null, error: string|null }.
 */
export async function evaluateInlineExpressions(expressions) {
  if (!expressions || expressions.length === 0) return new Map();

  const webR = await getWebR();
  const results = new Map();

  for (const expr of expressions) {
    try {
      const rObj = await webR.evalR(`as.character(${expr})`);
      const arr = await rObj.toArray();
      await rObj.destroy();
      results.set(expr, { value: arr.join(' '), error: null });
    } catch (err) {
      const msg = (err.message || 'R error').replace(/^Error in eval\(.*?\) : /, '');
      results.set(expr, { value: null, error: msg });
    }
  }

  // Merge into the persistent cache
  _inlineRCache = new Map([..._inlineRCache, ...results]);
  return results;
}

// ── Image utility ─────────────────────────────────────────────────────────────

/**
 * Convert an ImageBitmap (returned by WebR canvas messages) to a base64-
 * encoded PNG string suitable for use in an <img> src or Jupyter image output.
 */
export function imageBitmapToBase64(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  // Remove the "data:image/png;base64," prefix
  return canvas.toDataURL('image/png').split(',')[1];
}
