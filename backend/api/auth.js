import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import {
  backendEnvPath,
  defaultFrontendUrl,
  isDesktopMode,
  isHostedProduction
} from '../config.js';

const router = express.Router();
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1/api/auth/callback';

function resolveRedirectUri(req) {
  const rawRedirectUri = String(process.env.REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();

  try {
    const redirectUrl = new URL(rawRedirectUri);
    const isLoopback = redirectUrl.hostname === '127.0.0.1' || redirectUrl.hostname === 'localhost';
    const currentPort = req?.get?.('host')?.split(':')[1] || process.env.PORT || '';

    if (isLoopback && !redirectUrl.port && currentPort) {
      redirectUrl.port = currentPort;
    }

    return redirectUrl.toString();
  } catch (_) {
    return rawRedirectUri;
  }
}

function parseCurrentEnvFile() {
  if (!fs.existsSync(backendEnvPath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(backendEnvPath, 'utf8'));
}

function formatEnvValue(value) {
  return /[\s#]/.test(value) ? JSON.stringify(value) : value;
}

function persistDesktopEnv(nextValues) {
  const currentValues = parseCurrentEnvFile();
  const mergedValues = {
    ...currentValues,
    ...nextValues
  };

  if (!mergedValues.SESSION_SECRET) {
    mergedValues.SESSION_SECRET = crypto.randomBytes(24).toString('hex');
  }

  const serialized = Object.entries(mergedValues)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${key}=${formatEnvValue(String(value))}`)
    .join('\n');

  fs.mkdirSync(path.dirname(backendEnvPath), { recursive: true });
  fs.writeFileSync(backendEnvPath, `${serialized}\n`, 'utf8');

  Object.entries(mergedValues).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      delete process.env[key];
      return;
    }
    process.env[key] = String(value);
  });

  return mergedValues;
}

async function validateGitHubToken(token) {
  await axios.get('https://api.github.com/user', {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
}

// Redirect user to GitHub OAuth
router.get('/', (req, res) => {
  try {
    console.log('Initiating GitHub OAuth flow');

    if (!process.env.GITHUB_CLIENT_ID || !process.env.REDIRECT_URI) {
      res.status(500).send('GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and REDIRECT_URI to the desktop .env file, or set GITHUB_TOKEN for local single-user access.');
      return;
    }

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: resolveRedirectUri(req),
      scope: 'repo'
    }).toString();
    
    console.log('Redirecting to GitHub with params');
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch (error) {
    console.error('Error in auth redirect:', error.message);
    res.status(500).json({ error: 'Failed to initiate GitHub OAuth' });
  }
});

// Add a route to check session status
router.get('/check', (req, res) => {
  const devMode = !isHostedProduction;
  const hasToken = !!req.session?.githubToken || (devMode && !!process.env.GITHUB_TOKEN);
  res.json({
    authenticated: hasToken,
    oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.REDIRECT_URI),
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    desktopMode: isDesktopMode,
    setupPath: backendEnvPath,
    sessionID: req.sessionID
  });
});

router.post('/setup', async (req, res) => {
  if (!isDesktopMode) {
    res.status(403).json({ error: 'Desktop setup is only available in desktop mode.' });
    return;
  }

  const { mode, githubToken, clientId, clientSecret, redirectUri } = req.body || {};

  try {
    if (mode === 'token') {
      const trimmedToken = String(githubToken || '').trim();
      if (!trimmedToken) {
        res.status(400).json({ error: 'Enter a GitHub personal access token.' });
        return;
      }

      await validateGitHubToken(trimmedToken);
      persistDesktopEnv({
        GITHUB_TOKEN: trimmedToken
      });

      req.session.githubToken = trimmedToken;
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session after token setup:', err.message);
          res.status(500).json({ error: 'Saved the token, but failed to update the session.' });
          return;
        }

        res.json({
          success: true,
          mode: 'token',
          authenticated: true,
          oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.REDIRECT_URI),
          tokenConfigured: true,
          setupPath: backendEnvPath
        });
      });
      return;
    }

    if (mode === 'oauth') {
      const trimmedClientId = String(clientId || '').trim();
      const trimmedClientSecret = String(clientSecret || '').trim();
      const trimmedRedirectUri = String(redirectUri || DEFAULT_REDIRECT_URI).trim();

      if (!trimmedClientId || !trimmedClientSecret || !trimmedRedirectUri) {
        res.status(400).json({ error: 'Enter the GitHub OAuth client ID, client secret, and redirect URI.' });
        return;
      }

      persistDesktopEnv({
        GITHUB_CLIENT_ID: trimmedClientId,
        GITHUB_CLIENT_SECRET: trimmedClientSecret,
        REDIRECT_URI: trimmedRedirectUri
      });

      res.json({
        success: true,
        mode: 'oauth',
        authenticated: Boolean(req.session?.githubToken),
        oauthConfigured: true,
        tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
        setupPath: backendEnvPath
      });
      return;
    }

    res.status(400).json({ error: 'Choose either token or OAuth setup.' });
  } catch (error) {
    const status = error.response?.status === 401 ? 400 : 500;
    const message = status === 400
      ? 'GitHub rejected that token. Create a token with repository access and try again.'
      : 'Failed to save GitHub setup.';
    console.error('Desktop auth setup failed:', error.message);
    res.status(status).json({ error: message });
  }
});

// GitHub OAuth callback
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: resolveRedirectUri(req)
      },
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      console.error('GitHub OAuth: Failed to get access token');
      return res.status(400).json({ error: 'Failed to get access token' });
    }

    // Store token in session
    req.session.githubToken = access_token;
    
    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err.message);
        return res.status(500).json({ error: 'Failed to save session' });
      }
      
      console.log('Session saved successfully');

      console.log('Authentication successful');

      // Redirect to frontend
      const frontendUrl = process.env.FRONTEND_URL || defaultFrontendUrl;
      
      res.redirect(frontendUrl);
    });
  } catch (error) {
    console.error('Error in auth callback:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Add logout endpoint
router.post('/logout', (req, res) => {
  console.log('Processing logout request');

  req.session.destroy((err) => {
    if (err) {
      console.error('Error during logout:', err.message);
      return res.status(500).json({ error: 'Logout failed' });
    }
    console.log('User logged out successfully');
    res.clearCookie('sessionId');
    res.json({ success: true });
  });
});

export default router;
