import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import session from 'express-session';
import FileStore from 'session-file-store';
import { createRateLimiter, secureCookies, validateToken } from './middleware/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
console.log('Loading .env file');
dotenv.config({ path: envPath });

const FileStoreSession = FileStore(session);

console.log('Environment variables loaded');

const authRoute = await import('./api/auth.js');
const userRoute = await import('./api/user.js');
const fetchFileRoute = await import('./api/fetchFile.js');
const saveFileRoute = await import('./api/saveFile.js');

const getRepositoriesRoute = await import('./api/getRepositories.js');
const listNotebooksRoute = await import('./api/listNotebooks.js');
const bibliographyRoute = await import('./api/bibliography.js');
const collaborationRoute = await import('./api/collaboration.js');

const app = express();

// Trust proxy - needed for secure cookies behind nginx/Caddy in production only
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// CORS configuration based on environment
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://www.resolve.pub', 'https://resolve.pub']
        : 'http://localhost:5173',
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
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(secureCookies);

// Add pre-flight handling
app.options('*', cors(corsOptions));

// Configure express-session
app.use(session({
  store: new FileStoreSession({
    path: './sessions',
    ttl: 43200, // 12 hours in seconds
    retries: 0,
    reapInterval: 3600, // 1 hour in seconds
    logFn: () => {}, // Disable verbose logging
    // Only encrypt session files in production to avoid decryption issues in dev
    ...(process.env.NODE_ENV === 'production' && { secret: process.env.SESSION_SECRET })
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Forces cookie set on every response
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.resolve.pub' : undefined
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

// In development, auto-inject the PAT from .env so login is not required
if (process.env.NODE_ENV !== 'production') {
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
  const hasEnvToken = process.env.NODE_ENV !== 'production' && !!process.env.GITHUB_TOKEN;
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message 
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running`));
