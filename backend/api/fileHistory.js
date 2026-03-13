import express from 'express';
import { Octokit } from '@octokit/rest';
import { sanitizePath } from '../middleware/security.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { path: filePath, repository } = req.query;
    const token = req.session?.githubToken || process.env.GITHUB_TOKEN;

    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    if (!filePath || !repository) return res.status(400).json({ error: 'Missing parameters' });

    const [owner, repo] = repository.split('/');
    const sanitizedPath = sanitizePath(filePath);
    if (!sanitizedPath) return res.status(400).json({ error: 'Invalid path' });

    const octokit = new Octokit({ auth: token });

    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      path: sanitizedPath,
      per_page: 50,
    });

    const result = commits.map(c => ({
      sha: c.sha,
      parentSha: c.parents[0]?.sha || null,
      message: c.commit.message.split('\n')[0],
      date: c.commit.committer.date,
      author: c.commit.author.name || c.commit.author.email,
    }));

    res.json({ commits: result });
  } catch (error) {
    console.error('Error fetching file history:', error);
    res.status(500).json({ error: 'Failed to fetch file history' });
  }
});

export default router;
