import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const isDesktopMode = process.env.APP_MODE === 'desktop';
export const isHostedProduction = process.env.NODE_ENV === 'production' && !isDesktopMode;

export const defaultFrontendUrl = isDesktopMode
  ? 'http://localhost:3001'
  : 'https://resolve.pub';

export const backendEnvPath = process.env.BACKEND_ENV_PATH || path.resolve(__dirname, '.env');
export const sessionDir = process.env.SESSION_DIR || path.resolve(__dirname, 'sessions');

export const allowedOrigins = isHostedProduction
  ? ['https://www.resolve.pub', 'https://resolve.pub']
  : ['http://localhost:3001', 'http://localhost:5173'];

export function resolveExistingPath(...candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

export function getFrontendDistDir() {
  return resolveExistingPath(
    process.env.FRONTEND_DIST,
    path.resolve(__dirname, '../frontend/dist')
  );
}

export function getWebRDistDir() {
  const frontendDistDir = getFrontendDistDir();

  return resolveExistingPath(
    frontendDistDir ? path.resolve(frontendDistDir, 'webr-dist') : null,
    path.resolve(__dirname, '../frontend/dist/webr-dist'),
    path.resolve(__dirname, '../frontend/node_modules/@r-wasm/webr/dist'),
    path.resolve(__dirname, '../node_modules/@r-wasm/webr/dist')
  );
}
