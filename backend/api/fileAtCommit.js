import express from 'express';
import { Octokit } from '@octokit/rest';
import { sanitizePath } from '../middleware/security.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { path: filePath, repository, sha } = req.query;
    const token = req.session?.githubToken || process.env.GITHUB_TOKEN;

    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    if (!filePath || !repository || !sha) return res.status(400).json({ error: 'Missing parameters' });

    const [owner, repo] = repository.split('/');
    const sanitizedPath = sanitizePath(filePath);
    if (!sanitizedPath) return res.status(400).json({ error: 'Invalid path' });

    const octokit = new Octokit({ auth: token });

    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: sanitizedPath,
      ref: sha,
    });

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    res.json({ content });
  } catch (error) {
    console.error('Error fetching file at commit:', error);
    if (error.status === 404) return res.status(404).json({ error: 'File not found at this commit' });
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

export default router;
