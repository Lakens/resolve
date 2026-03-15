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
  const [redirectUri, setRedirectUri] = useState('http://127.0.0.1/api/auth/callback');
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
            <p>Last updated: March 14, 2026</p>

            <h2>Introduction</h2>
            <p>QuartoReview is a desktop application that runs entirely on your own computer — it is not a web service or cloud platform. By design, it collects as little data as possible.</p>

            <h2>Local file mode</h2>
            <p>When you open and edit local files without connecting to GitHub, <strong>QuartoReview collects no data whatsoever.</strong> Your files stay on your computer. Nothing is sent over the internet.</p>

            <h2>GitHub mode (optional)</h2>
            <p>If you choose to connect GitHub to load and save files from your repositories, the following applies.</p>

            <h3>Your GitHub token</h3>
            <p>When you connect GitHub, you provide a Personal Access Token (PAT). This token is stored <strong>only on your own computer</strong> and is never sent to any QuartoReview server — because there is no QuartoReview server. It is used exclusively to communicate directly between your computer and GitHub's API.</p>

            <h3>Repository content</h3>
            <p>When you load or save a file, your computer communicates directly with GitHub. QuartoReview does not see, log, or store your document content. All files are stored in your own GitHub repositories.</p>

            <h3>Session data</h3>
            <p>A session cookie keeps you authenticated within the local app session. It is stored only in your browser session and is cleared when you close the app. It never leaves your computer.</p>

            <h2>What we do not collect</h2>
            <ul>
              <li>No usage analytics or telemetry</li>
              <li>No crash reports sent externally</li>
              <li>No tracking or marketing data</li>
              <li>No document content stored on any server</li>
            </ul>

            <h2>Third-party services</h2>
            <h3>GitHub</h3>
            <p>If you use GitHub mode, you are subject to <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub's Privacy Policy</a>. QuartoReview only communicates with GitHub using your own credentials, on your behalf.</p>

            <h3>Grammar and Spell Check</h3>
            <p>QuartoReview uses Harper for local grammar and spell checking. Checks run on your own computer and document text is not sent to an external grammar service.</p>

            <h2>Contact</h2>
            <p>Questions about this Privacy Policy? Please open an issue at <a href="https://github.com/Lakens/QuartoReview" target="_blank" rel="noopener noreferrer">github.com/Lakens/QuartoReview</a>.</p>
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
                <p>Use this if you want the browser-based "Continue with GitHub" login flow. Create a GitHub OAuth app, paste the credentials here, and QuartoReview will launch GitHub for sign-in. For desktop installs, use the loopback callback without a fixed port.</p>
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
                    placeholder="http://127.0.0.1/api/auth/callback"
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
