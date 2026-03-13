import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

// Serve WebR's local dist files at /webr-dist/ so we never hit the CDN.
// The R WASM binary (~50 MB) is already in node_modules after npm install.
const webRDistDir = resolve('node_modules/@r-wasm/webr/dist');
const MIME = {
  '.wasm': 'application/wasm',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.data': 'application/octet-stream',
  '.json': 'application/json',
};

export default defineConfig({
  plugins: [
    // Treat .js files that contain JSX as JSX (CRA migration compatibility)
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!id.match(/src\/.*\.js$/)) return null;
        return transformWithEsbuild(code, id, {
          loader: 'jsx',
          jsx: 'automatic',
        });
      },
    },
    react(),
    {
      name: 'serve-webr-dist',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/webr-dist/')) return next();
          const rel = req.url.slice('/webr-dist/'.length).split('?')[0];
          const filePath = join(webRDistDir, rel);
          if (!existsSync(filePath) || !statSync(filePath).isFile()) return next();
          res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          createReadStream(filePath).pipe(res);
        });
      },
    },
    {
      name: 'copy-webr-dist',
      closeBundle() {
        const outputDir = resolve('dist');
        const targetDir = join(outputDir, 'webr-dist');
        rmSync(targetDir, { recursive: true, force: true });
        mkdirSync(outputDir, { recursive: true });
        cpSync(webRDistDir, targetDir, { recursive: true });
      },
    },
  ],
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
});
