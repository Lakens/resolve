import express from 'express';
import { Octokit } from '@octokit/rest';
import { defaultFrontendUrl } from '../config.js';

const router = express.Router();

// Helper function to find GitHub username by email
async function findGitHubUsername(octokit, email) {
  try {
    const response = await octokit.request('GET /search/users', {
      q: `${email} in:email`,
      per_page: 1,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (response.data.total_count > 0) {
      return response.data.items[0].login;
    }
    return null;
  } catch (error) {
    console.error('Error searching for user:', error);
    return null;
  }
}

// Send invitation and generate share link
router.post('/invite', async (req, res) => {
  const { username, email, repository, filePath } = req.body;
  const token = req.session?.githubToken || process.env.GITHUB_TOKEN;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const octokit = new Octokit({ 
      auth: token,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    // If email is provided, try to find the username
    let targetUsername = username;
    if (!username && email) {
      targetUsername = await findGitHubUsername(octokit, email);
      if (!targetUsername) {
        return res.status(404).json({ 
          error: 'User not found based on email, their email may be private on GitHub, use their username instead', 
          details: 'Could not find a GitHub user with this email address' 
        });
      }
    }

    if (!targetUsername) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: 'Please provide either a GitHub username or email address' 
      });
    }

    const [owner, repo] = repository.split('/');
    
    // Send GitHub invitation with proper headers
    const response = await octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
      owner,
      repo,
      username: targetUsername,
      permission: 'write',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    // Check response status
    if (response.status !== 201 && response.status !== 204) {
      throw new Error(`Unexpected response status: ${response.status}`);
    }

    // Generate share link with file path
    const frontendUrl = process.env.FRONTEND_URL || defaultFrontendUrl;
    const shareLink = filePath 
      ? `${frontendUrl}/document/${owner}/${repo}/${filePath}`
      : `${frontendUrl}/document/${owner}/${repo}`;
    
    res.json({ 
      success: true, 
      shareLink,
      username: targetUsername,
      message: `Invitation sent to ${targetUsername}`
    });
  } catch (error) {
    console.error('Failed to send invitation:', error);
    res.status(500).json({ 
      error: 'Failed to send invitation',
      details: error.message 
    });
  }
});

// Get pending invitations
router.get('/invitations', async (req, res) => {
  const token = req.session?.githubToken || process.env.GITHUB_TOKEN;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const octokit = new Octokit({ 
      auth: token,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const { data: invitations } = await octokit.repos.listInvitationsForAuthenticatedUser();
    
    res.json(invitations);
  } catch (error) {
    console.error('Failed to fetch invitations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch invitations',
      details: error.message 
    });
  }
});

// Accept invitation
router.post('/accept-invite', async (req, res) => {
  const { invitationId } = req.body;
  const token = req.session?.githubToken || process.env.GITHUB_TOKEN;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const octokit = new Octokit({ 
      auth: token,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    await octokit.repos.acceptInvitation({ invitation_id: invitationId });
    
    res.json({ 
      success: true, 
      message: 'Invitation accepted' 
    });
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    res.status(500).json({ 
      error: 'Failed to accept invitation',
      details: error.message 
    });
  }
});

export default router;
