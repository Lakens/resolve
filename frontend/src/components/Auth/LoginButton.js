import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FaGithub } from 'react-icons/fa';
import { buildApiUrl } from '../../utils/runtime';
import { AuthContext } from '../../contexts/AuthContext';
import { saveAuthSetup } from '../../utils/api';

const LoginButton = () => {
  const {
    desktopMode,
    isAuthenticated,
    oauthConfigured,
    refreshAuth,
    setupPath,
    tokenConfigured
  } = useContext(AuthContext);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupMode, setSetupMode] = useState('token');
  const [githubToken, setGithubToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:3001/api/auth/callback');
  const [setupError, setSetupError] = useState('');
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [hasAutoOpenedSetup, setHasAutoOpenedSetup] = useState(false);

  const desktopEnvPath = useMemo(
    () => setupPath || '~/Library/Application Support/QuartoReview/.env',
    [setupPath]
  );
  const authConfigured = oauthConfigured || tokenConfigured;

  useEffect(() => {
    if (desktopMode && !isAuthenticated && !authConfigured && !hasAutoOpenedSetup) {
      setShowSetup(true);
      setHasAutoOpenedSetup(true);
    }
  }, [authConfigured, desktopMode, hasAutoOpenedSetup, isAuthenticated]);

  const openExternal = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleLogin = () => {
    if (!oauthConfigured) {
      setShowSetup(true);
      return;
    }

    const loginUrl = buildApiUrl('/api/auth');
    console.log('Redirecting to:', loginUrl);
    window.location.href = loginUrl;
  };

  const handleSaveSetup = async () => {
    setSetupError('');
    setIsSavingSetup(true);

    try {
      if (setupMode === 'token') {
        await saveAuthSetup({
          mode: 'token',
          githubToken
        });
        await refreshAuth();
        setShowSetup(false);
        return;
      }

      await saveAuthSetup({
        mode: 'oauth',
        clientId,
        clientSecret,
        redirectUri
      });
      await refreshAuth();
      setShowSetup(false);
      window.location.href = buildApiUrl('/api/auth');
    } catch (error) {
      setSetupError(error.response?.data?.error || 'Failed to save GitHub setup.');
    } finally {
      setIsSavingSetup(false);
    }
  };

  return (
      <div className="login-card">
      <p>
        QuartoReview is a WYSIWYG editor for Quarto (`.qmd`), R Markdown (`.Rmd`), Markdown (`.md`), and Jupyter (`.ipynb`) documents. To collaborate via GitHub, please sign in below.
      </p>
      {!authConfigured && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.9rem 1rem',
          borderRadius: '0.75rem',
          background: '#fff3cd',
          color: '#5c4700',
          maxWidth: '38rem',
          lineHeight: 1.5
        }}>
          GitHub is not configured yet. Click the button below and QuartoReview will guide you through connecting the app to GitHub from inside the UI.
        </div>
      )}
      <p>Don't have a file to try? Download a sample from <a href="https://github.com/Lakens/QuartoReview" target="_blank" rel="noreferrer">github.com/Lakens/QuartoReview</a> or open a local file from the menu.</p>
      <p>
        Don't have a GitHub account yet?{' '}
        <a href="https://github.com/join">
          Register here
        </a>{' '}
        and join our community!
      </p>
      <button onClick={handleLogin} className="login-button">
        <FaGithub />
        {oauthConfigured ? 'Continue with GitHub' : 'Connect GitHub'}
      </button>
      <button onClick={() => setShowSetup(true)} className="login-secondary-button">
        {authConfigured ? 'Edit GitHub setup' : 'Set up GitHub in this app'}
      </button>
      <p className="privacy-notice">
        <button onClick={() => setShowPrivacy(true)} className="privacy-link">
          Privacy Policy
        </button>
      </p>

      <div className="privacy-modal" style={{ display: showPrivacy ? 'flex' : 'none' }}>
        <div className="privacy-modal-content">
          <button className="close-button" onClick={() => setShowPrivacy(false)}>×</button>
          <div className="privacy-text">
            <h1>Privacy Policy</h1>
            <p>Last updated: January 22, 2025</p>

            <h2>Introduction</h2>
            <p>This Privacy Policy explains how QuartoReview ("we", "our", or "us") collects, uses, and protects your information when you use our WYSIWYG document editor ("the Service"). We are committed to protecting your privacy and handling your data in an open and transparent manner.</p>

            <h2>Information We Collect</h2>
            <h3>1. Account Information</h3>
            <ul>
              <li>GitHub account information (username, email) when you authenticate through GitHub OAuth</li>
              <li>Repository access permissions granted through GitHub</li>
            </ul>

            <h3>2. Usage Data</h3>
            <ul>
              <li>Notebook content and editing history</li>
              <li>Comments and collaboration data</li>
              <li>Citation and reference information</li>
              <li>Browser type and version</li>
              <li>Access timestamps</li>
              <li>Session duration</li>
            </ul>

            <h2>Data Storage and Security</h2>
            <h3>GitHub Integration</h3>
            <p>All notebook files and related content are stored in your GitHub repositories. We do not maintain separate copies of your notebooks.</p>

            <h3>Temporary Data</h3>
            <p>We temporarily cache data in your browser to:</p>
            <ul>
              <li>Manage active editing sessions</li>
              <li>Enable collaboration features</li>
            </ul>
            <p>This temporary data is stored only in your browser and is automatically cleared when you close the browser tab or window. We do not store any temporary data on our servers.</p>

            <h2>Data Sharing</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. Your data is shared only:</p>
            <ul>
              <li>With GitHub, as necessary for the Service's core functionality, e.g. for authentication, to invite collaborators, to download notebooks, or to save a notebook you edited.</li>
              <li>If you opt to explicitly share a notebook with others, this means you grant repository level access to the other user through GitHub repository permissions.</li>
              <li>As required by law or to protect our rights</li>
            </ul>

            <h2>Third-Party Services</h2>
            <h3>GitHub</h3>
            <p>Our Service integrates with GitHub for authentication and storage. When you use our Service, you are also subject to GitHub's Privacy Policy. We recommend reviewing their privacy policy at <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub's Privacy Statement</a></p>

            <h2>Hosting</h2>
            <h3>Backend on DigitalOcean</h3>
            <p>Our Service is hosted on a backend server which runs on a DigitalOcean server in Amsterdam, the Netherlands (i.e. in the EU). We use their services to provide a robust and secure platform for our users. For more information, please visit <a href="https://www.digitalocean.com" target="_blank" rel="noopener noreferrer">DigitalOcean</a></p>

            <h3>Frontend on Vercel</h3>
            <p>Our frontend is hosted on Vercel. We use their services to provide a robust and secure platform for our users. For more information, please visit <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">Vercel</a></p>

            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Withdraw GitHub access permissions</li>
              <li>Export your data</li>
            </ul>

            <h2>Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please create an issue in our GitHub repository: <a href="https://github.com/Lakens/QuartoReview" target="_blank" rel="noopener noreferrer">https://github.com/Lakens/QuartoReview</a></p>

            <h2>Cookies</h2>
            <p>We use essential cookies only for maintaining your session (i.e. to keep you logged in while you edit, enabling you to save) and GitHub authentication. We do not use any other cookies. No tracking or marketing cookies are used.</p>

            <h2>Children's Privacy</h2>
            <p>Our Service is not intended for children under 13. We do not knowingly collect personal information from children under 13.</p>
          </div>
        </div>
      </div>

      <div className="privacy-modal" style={{ display: showSetup ? 'flex' : 'none' }}>
        <div className="privacy-modal-content onboarding-modal-content">
          <button className="close-button" onClick={() => setShowSetup(false)}>×</button>
          <div className="privacy-text">
            <h1>Connect QuartoReview to GitHub</h1>
            <p>Choose the setup path that fits this Mac. The personal access token route is the fastest for a local install.</p>
            <p><strong>Settings file:</strong> <code>{desktopEnvPath}</code></p>

            <div className="onboarding-mode-toggle">
              <button
                className={`onboarding-mode-button${setupMode === 'token' ? ' is-active' : ''}`}
                onClick={() => setSetupMode('token')}
              >
                Personal token
              </button>
              <button
                className={`onboarding-mode-button${setupMode === 'oauth' ? ' is-active' : ''}`}
                onClick={() => setSetupMode('oauth')}
              >
                GitHub OAuth app
              </button>
            </div>

            {setupMode === 'token' ? (
              <div className="onboarding-section">
                <p>Recommended for local use. Create a GitHub personal access token with repository access, paste it below, and QuartoReview will log in immediately.</p>
                <button
                  className="login-secondary-button"
                  onClick={() => openExternal('https://github.com/settings/tokens/new?description=QuartoReview&scopes=repo')}
                  type="button"
                >
                  Open GitHub token page
                </button>
                <div className="onboarding-input-group">
                  <label htmlFor="github-token">Personal access token</label>
                  <input
                    id="github-token"
                    type="password"
                    value={githubToken}
                    onChange={(event) => setGithubToken(event.target.value)}
                    placeholder="ghp_..."
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : (
              <div className="onboarding-section">
                <p>Use this if you want the browser-based "Continue with GitHub" login flow. Create a GitHub OAuth app, paste the credentials here, and QuartoReview will launch GitHub for sign-in.</p>
                <button
                  className="login-secondary-button"
                  onClick={() => openExternal('https://github.com/settings/developers')}
                  type="button"
                >
                  Open GitHub OAuth settings
                </button>
                <div className="onboarding-input-group">
                  <label htmlFor="github-client-id">Client ID</label>
                  <input
                    id="github-client-id"
                    type="text"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    placeholder="GitHub OAuth client ID"
                    autoComplete="off"
                  />
                </div>
                <div className="onboarding-input-group">
                  <label htmlFor="github-client-secret">Client secret</label>
                  <input
                    id="github-client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                    placeholder="GitHub OAuth client secret"
                    autoComplete="off"
                  />
                </div>
                <div className="onboarding-input-group">
                  <label htmlFor="github-redirect-uri">Redirect URI</label>
                  <input
                    id="github-redirect-uri"
                    type="text"
                    value={redirectUri}
                    onChange={(event) => setRedirectUri(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}

            {setupError && (
              <div className="onboarding-error">
                {setupError}
              </div>
            )}

            <div className="onboarding-actions">
              <button className="login-secondary-button" onClick={() => setShowSetup(false)} type="button">
                Cancel
              </button>
              <button
                className="login-button onboarding-primary-button"
                onClick={handleSaveSetup}
                disabled={isSavingSetup}
                type="button"
              >
                {isSavingSetup
                  ? 'Saving...'
                  : setupMode === 'token'
                    ? 'Save token and sign in'
                    : 'Save and continue to GitHub'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div> 
  );
};

export default LoginButton;
