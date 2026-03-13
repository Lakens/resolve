import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import session from 'express-session';
import FileStore from 'session-file-store';
import { createRateLimiter, secureCookies } from './middleware/security.js';
import {
  allowedOrigins,
  backendEnvPath,
  getFrontendDistDir,
  getWebRDistDir,
  isDesktopMode,
  isHostedProduction,
  sessionDir
} from './config.js';

console.log('Loading .env file');
dotenv.config({ path: backendEnvPath });

const FileStoreSession = FileStore(session);
const frontendDistDir = getFrontendDistDir();
const webRDistDir = getWebRDistDir();
const serveDesktopFrontend = isDesktopMode && !!frontendDistDir;

fs.mkdirSync(sessionDir, { recursive: true });

console.log('Environment variables loaded');

const authRoute = await import('./api/auth.js');
const userRoute = await import('./api/user.js');
const fetchFileRoute = await import('./api/fetchFile.js');
const saveFileRoute = await import('./api/saveFile.js');

const getRepositoriesRoute = await import('./api/getRepositories.js');
const listNotebooksRoute = await import('./api/listNotebooks.js');
const bibliographyRoute = await import('./api/bibliography.js');
const collaborationRoute = await import('./api/collaboration.js');
const fileHistoryRoute = await import('./api/fileHistory.js');
const fileAtCommitRoute = await import('./api/fileAtCommit.js');
const fetchRawFileRoute = await import('./api/fetchRawFile.js');

const app = express();

// Trust proxy - needed for secure cookies behind nginx/Caddy in production only
if (isHostedProduction) {
  app.set('trust proxy', 1);
}

// CORS configuration based on environment
const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Credentials',
        'Access-Control-Allow-Origin',
        'Origin',
        'Accept'
    ],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

if (serveDesktopFrontend) {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });
}

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(secureCookies);

// Add pre-flight handling
app.options('*', cors(corsOptions));

// Configure express-session
app.use(session({
  store: new FileStoreSession({
    path: sessionDir,
    ttl: 43200, // 12 hours in seconds
    retries: 0,
    reapInterval: 3600, // 1 hour in seconds
    logFn: () => {}, // Disable verbose logging
    // Only encrypt session files in production to avoid decryption issues in dev
    ...(isHostedProduction && { secret: process.env.SESSION_SECRET })
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Forces cookie set on every response
  cookie: {
    secure: isHostedProduction,
    httpOnly: true,
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    sameSite: isHostedProduction ? 'none' : 'lax',
    domain: isHostedProduction ? '.resolve.pub' : undefined
  },
  name: 'sessionId'
}));

// Add session security middleware
app.use((req, res, next) => {
  if (req.session && req.session.githubToken) {
    // Add creation time if not exists
    if (!req.session.created) {
      req.session.created = Date.now();
    }

    // Regenerate session every hour
    const hour = 60 * 60 * 1000;
    if (Date.now() - req.session.created > hour) {
      const githubToken = req.session.githubToken;
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          next();
          return;
        }
        req.session.githubToken = githubToken;
        req.session.created = Date.now();
        next();
      });
    } else {
      next();
    }
  } else {
    next();
  }
});

// Outside hosted production, auto-inject the PAT from .env so login is optional.
if (!isHostedProduction) {
  app.use((req, res, next) => {
    if (!req.session.githubToken && process.env.GITHUB_TOKEN) {
      req.session.githubToken = process.env.GITHUB_TOKEN;
    }
    next();
  });
}

// Apply rate limiting to all routes
app.use(createRateLimiter());

// Protected routes that require session authentication
const protectedRoutes = [
    '/api/fetchFile',
    '/api/fetchRawFile',
    '/api/saveFile',
    '/api/repositories',
    '/api/listNotebooks',
    '/api/bibliography/load',
    '/api/bibliography/save',
    '/api/collaboration'
];

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  const hasSession = req.session && req.session.githubToken;
  const hasEnvToken = !isHostedProduction && !!process.env.GITHUB_TOKEN;
  if (hasSession || hasEnvToken) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

protectedRoutes.forEach(route => {
    app.use(route, requireAuth);
});

// Routes
app.use('/api/auth', authRoute.default);
app.use('/api/user', userRoute.default);
app.use('/api/fetchFile', fetchFileRoute.default);
app.use('/api/saveFile', saveFileRoute.default);
app.use('/api/repositories', getRepositoriesRoute.default);
app.use('/api/listNotebooks', listNotebooksRoute.default);
app.use('/api/bibliography', bibliographyRoute.default);
app.use('/api/collaboration', collaborationRoute.default);
app.use('/api/fileHistory', fileHistoryRoute.default);
app.use('/api/fileAtCommit', fileAtCommitRoute.default);
app.use('/api/fetchRawFile', fetchRawFileRoute.default);

if (serveDesktopFrontend && webRDistDir) {
  app.use('/webr-dist', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  }, express.static(webRDistDir));
}

if (serveDesktopFrontend) {
  app.use(express.static(frontendDistDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendDistDir, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: isHostedProduction
            ? 'Internal server error' 
            : err.message 
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running`));
