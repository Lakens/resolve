// backend/api/fetchFile.js
import express from 'express';
import { Octokit } from '@octokit/rest';
import { sanitizePath } from '../middleware/security.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { path: filePath, repository } = req.query;
    
    // Use the token from the session
    const token = req.session.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!repository) {
      console.error('No repository provided');
      return res.status(400).json({ error: 'Repository not specified' });
    }

    const [owner, repo] = repository.split('/');
    const sanitizedPath = sanitizePath(filePath);

    const octokit = new Octokit({
      auth: token
    });

    // Get file content from GitHub
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: sanitizedPath
    });

    if (!response.data) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Decode content from base64
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');

    // Handle text-based markup files — return raw text
    if (sanitizedPath.endsWith('.qmd') ||
        sanitizedPath.endsWith('.Rmd') ||
        sanitizedPath.endsWith('.rmd') ||
        sanitizedPath.endsWith('.md')) {
      return res.json({ qmdContent: content, fileType: 'qmd' });
    }

    let ipynb;
    try {
      ipynb = JSON.parse(content);
    } catch (error) {
      console.error('Error parsing notebook:', error);
      return res.status(400).json({ error: 'Invalid notebook format' });
    }

    res.json({ ipynb, fileType: 'ipynb' });
  } catch (error) {
    console.error('Error fetching file:', error);
    if (error.status === 404) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

export default router;
