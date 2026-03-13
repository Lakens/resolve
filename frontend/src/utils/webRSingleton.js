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

  _setPackageStatus({ phase: 'installing', index: 0, total: packages.length, errors: [] });

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    _setPackageStatus({ current: pkg, index: i + 1 });
    console.log(`[WebR] Installing ${pkg} (${i + 1}/${packages.length})…`);
    try {
      await webR.installPackages([pkg], { quiet: true });
      // installPackages() only emits an R *warning* when a binary isn't found
      // — it never throws.  Verify the package is actually in the library.
      await webR.evalRVoid(`find.package("${pkg}")`);
      console.log(`[WebR] ${pkg} installed.`);
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
