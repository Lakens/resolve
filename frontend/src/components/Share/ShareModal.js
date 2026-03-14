import React, { useState, useEffect } from 'react';
import { sendCollaborationInvite } from '../../utils/api';
import '../../styles/components/share/_modal.css';

const ShareModal = ({ isOpen, onClose, repository, filePath }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasCheckedRepo, setHasCheckedRepo] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setShareLink('');
      setUsername('');
      setEmail('');
      setHasCheckedRepo(false);
    }
  }, [isOpen]);

  // Check repository when it changes
  useEffect(() => {
    if (isOpen && repository) {
      setHasCheckedRepo(true);
      setError(null);
    }
  }, [repository, isOpen]);

  const handleInvite = async () => {
    if (!repository) {
      setError('Please select a repository before sharing');
      return;
    }

    if (!username && !email) {
      setError('Please provide either a GitHub username or email address');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await sendCollaborationInvite(username, email, repository, filePath);
      setShareLink(result.shareLink);
      if (result.username !== username) {
        setUsername(result.username); // Update username if it was found via email
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const shareText = `Hi, I'd like to collaborate with you on a document in QuartoReview. Click this link to join: ${shareLink}`;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share Document</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          {!hasCheckedRepo ? (
            <div>Loading...</div>
          ) : !repository ? (
            <div className="error-message">
              Please select a repository before sharing
            </div>
          ) : (
            <>
              <div className="input-group">
                <label htmlFor="username">GitHub Username (recommended)</label>
                <input
                  id="username"
                  type="text"
                  placeholder="Enter GitHub username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (e.target.value) setEmail(''); // Clear email if username is entered
                  }}
                />
                <small className="input-help">
                  For example: "octocat"
                </small>
              </div>

              <div className="input-separator">
                <span>OR</span>
              </div>

              <div className="input-group">
                <label htmlFor="email">GitHub Email Address</label>
                <input
                  id="email"
                  type="email"
                  placeholder="Enter GitHub email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (e.target.value) setUsername(''); // Clear username if email is entered
                  }}
                />
                <small className="input-help">
                  We'll look up the GitHub username associated with this email
                </small>
              </div>

              <button 
                className="invite-button"
                onClick={handleInvite}
                disabled={isLoading || (!username.trim() && !email.trim())}
              >
                {isLoading ? 'Sending...' : 'Send Invitation'}
              </button>
              
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              
              {shareLink && (
                <div className="share-link-section">
                  <h3>Share Link Generated</h3>
                  <textarea 
                    className="share-text"
                    readOnly 
                    value={shareText}
                    onClick={(e) => e.target.select()}
                  />
                  <button 
                    className="copy-button"
                    onClick={() => navigator.clipboard.writeText(shareText)}
                  >
                    Copy Message
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
