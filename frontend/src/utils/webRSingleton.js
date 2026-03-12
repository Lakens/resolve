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
 */

// ── Package pre-installation ──────────────────────────────────────────────────
const PREINSTALL_PACKAGES = ['tidyverse', 'kableExtra', 'palmerpenguins'];

// ── Status / subscriber system ────────────────────────────────────────────────
// packageStatus shape: { phase: 'idle'|'installing'|'done'|'error',
//                        current: string|null, index: number, total: number }
let _packageStatus = { phase: 'idle', current: null, index: 0, total: PREINSTALL_PACKAGES.length };
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

      _instance = webR;

      // Pre-install packages after R is ready
      await _preinstallPackages(webR);

      return webR;
    })().catch(err => {
      console.error('[WebR] Initialization failed:', err);
      _initPromise = null; // allow retry
      throw err;
    });
  }
  return _initPromise;
}

async function _preinstallPackages(webR) {
  console.log('[WebR] Installing R packages…');
  _setPackageStatus({ phase: 'installing', index: 0, total: PREINSTALL_PACKAGES.length });

  try {
    for (let i = 0; i < PREINSTALL_PACKAGES.length; i++) {
      const pkg = PREINSTALL_PACKAGES[i];
      _setPackageStatus({ phase: 'installing', current: pkg, index: i + 1, total: PREINSTALL_PACKAGES.length });
      console.log(`[WebR] Installing ${pkg} (${i + 1}/${PREINSTALL_PACKAGES.length})…`);
      await webR.installPackages([pkg], { quiet: true });
      console.log(`[WebR] ${pkg} installed.`);
    }

    _setPackageStatus({ phase: 'done', current: null });
    console.log('[WebR] All packages installed.');
  } catch (err) {
    console.error('[WebR] Package installation failed:', err);
    _setPackageStatus({ phase: 'error', current: null });
  }
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
