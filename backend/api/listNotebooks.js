// backend/api/listNotebooks.js
import express from 'express';
import { Octokit } from '@octokit/rest';

const router = express.Router();

async function listNotebooks(req, res) {
  try {
    const { repository } = req.query;
    if (!repository) {
      return res.status(400).json({ error: 'Repository parameter is required' });
    }

    const token = req.session.githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      console.error('No token found in session');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid repository format' });
    }

    const octokit = new Octokit({ auth: token });

    // Get default branch
    const { data: repoData } = await octokit.repos.get({
      owner,
      repo,
    });
    const defaultBranch = repoData.default_branch;

    // Get tree
    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: 'true'
    });

    // Filter for supported file types
    const notebooks = treeData.tree
      .filter(item => item.type === 'blob' && (
        item.path.endsWith('.ipynb') ||
        item.path.endsWith('.qmd') ||
        item.path.endsWith('.Rmd') ||
        item.path.endsWith('.rmd') ||
        item.path.endsWith('.md')
      ))
      .map(item => item.path);

    res.json({ notebooks });
  } catch (error) {
    console.error('Error listing notebooks:', error);
    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid GitHub token' });
    }
    if (error.status === 404) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    res.status(500).json({ 
      error: process.env.NODE_ENV === 'production' 
        ? 'Error listing notebooks' 
        : error.message 
    });
  }
}

router.get('/', listNotebooks);

export default router;
