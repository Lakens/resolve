import express from 'express';
import { Octokit } from '@octokit/rest';
import { sanitizePath } from '../middleware/security.js';
import { isDesktopMode } from '../config.js';

const router = express.Router();

function normalizeContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content, null, 2);
}

async function getExistingFileSha(octokit, owner, repo, filePath, ref) {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ...(ref ? { ref } : {})
    });

    return Array.isArray(data) ? undefined : data.sha;
  } catch (error) {
    if (error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

async function saveDirectToDefaultBranch(octokit, owner, repo, branch, filePath, message, fileContent) {
  const sha = await getExistingFileSha(octokit, owner, repo, filePath, branch);

  const response = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    branch,
    message,
    content: Buffer.from(fileContent).toString('base64'),
    ...(sha ? { sha } : {})
  });

  return {
    success: true,
    data: {
      branch,
      commitSha: response.data.commit.sha,
      status: 'saved'
    }
  };
}

async function waitForMergeableStatus(octokit, owner, repo, pullNumber, maxRetries = 10, delayMs = 1500) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    });

    if (data.mergeable !== null) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}

async function deleteBranchQuietly(octokit, owner, repo, branchName) {
  try {
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`
    });
  } catch (error) {
    if (error.status !== 422 && error.status !== 404) {
      console.warn(`Failed to delete branch ${branchName}:`, error.message);
    }
  }
}

router.post('/', async (req, res) => {
  try {
    const { content, path, repository, commitMessage } = req.body;
    const token = req.session?.githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      console.error('No GitHub token found in session');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!content || !path || !repository) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid repository format' });
    }

    const sanitizedPath = sanitizePath(path);
    if (!sanitizedPath) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    let fileContent;
    try {
      fileContent = normalizeContent(content);
    } catch (error) {
      console.error('Error stringifying content:', error);
      return res.status(400).json({ error: 'Invalid content format' });
    }

    const octokit = new Octokit({ auth: token });
    const message = commitMessage || 'Update document';

    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    if (isDesktopMode) {
      const result = await saveDirectToDefaultBranch(
        octokit,
        owner,
        repo,
        defaultBranch,
        sanitizedPath,
        message,
        fileContent
      );
      return res.json(result);
    }

    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`
    });

    const newBranchName = `update-${sanitizedPath.replace(/\//g, '-')}-${Date.now()}`;
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranchName}`,
      sha: ref.object.sha
    });

    const sha = await getExistingFileSha(octokit, owner, repo, sanitizedPath, newBranchName);

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: sanitizedPath,
      message,
      content: Buffer.from(fileContent).toString('base64'),
      branch: newBranchName,
      ...(sha ? { sha } : {})
    });

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: message,
      head: newBranchName,
      base: defaultBranch,
      body: message
    });

    const prCheck = await waitForMergeableStatus(octokit, owner, repo, pr.number);

    if (!prCheck) {
      return res.status(503).json({
        error: 'GitHub is still evaluating the save. Please retry in a moment.',
        data: {
          pr_url: pr.html_url,
          branch: newBranchName,
          status: 'pending'
        }
      });
    }

    if (!prCheck.mergeable) {
      return res.status(409).json({
        error: 'GitHub could not merge the saved changes automatically.',
        data: {
          pr_url: pr.html_url,
          branch: newBranchName,
          status: 'conflict'
        }
      });
    }

    const mergeResponse = await octokit.pulls.merge({
      owner,
      repo,
      pull_number: pr.number,
      merge_method: 'squash'
    });

    await deleteBranchQuietly(octokit, owner, repo, newBranchName);

    return res.json({
      success: true,
      data: {
        pr_url: pr.html_url,
        branch: newBranchName,
        commitSha: mergeResponse.data.sha,
        status: 'merged'
      }
    });
  } catch (error) {
    console.error('Error saving file:', error);
    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid GitHub token' });
    }
    if (error.status === 404) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    res.status(500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Error saving file'
        : error.message
    });
  }
});

export default router;
