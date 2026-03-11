import React, { useState } from 'react';
import { FaGithub } from 'react-icons/fa';

const LoginButton = () => {
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleLogin = () => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      console.error('API URL not configured');
      return;
    }
    const loginUrl = `${apiUrl}/api/auth`;
    console.log('Redirecting to:', loginUrl);
    window.location.href = loginUrl;
  };

  return (
      <div className="login-card">
      <p>
        Resolve is your seamless solution for collaborating on Quarto and Jupyter (`.ipynb`) documents. To get started, please sign in with your GitHub account.
      </p>
      <p>Don't have any .ipynb files to test Resolve? Go to GitHub and fork: https://github.com/MichelNivard/writing-together</p>
      <p>
        Don't have a GitHub account yet?{' '}
        <a href="https://github.com/join">
          Register here
        </a>{' '}
        and join our community!
      </p>
      <button onClick={handleLogin} className="login-button">
        <FaGithub />
        Continue with GitHub
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
            <p>This Privacy Policy explains how Resolve ("we", "our", or "us") collects, uses, and protects your information when you use our WYSIWYG Jupyter Notebook Editor ("the Service"). We are committed to protecting your privacy and handling your data in an open and transparent manner.</p>

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
            <p>If you have questions about this Privacy Policy, please create an issue in our GitHub repository: <a href="https://github.com/MichelNivard/resolve" target="_blank" rel="noopener noreferrer">https://github.com/MichelNivard/resolve</a></p>

            <h2>Cookies</h2>
            <p>We use essential cookies only for maintaining your session (i.e. to keep you logged in while you edit, enabling you to save) and GitHub authentication. We do not use any other cookies. No tracking or marketing cookies are used.</p>

            <h2>Children's Privacy</h2>
            <p>Our Service is not intended for children under 13. We do not knowingly collect personal information from children under 13.</p>
          </div>
        </div>
      </div>
    </div> 
  );
};

export default LoginButton;