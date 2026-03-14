import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release -- <major.minor.patch>');
  process.exit(1);
}

const repoRoot = process.cwd();
const tagName = `v${version}`;

const filesToUpdate = [
  'package.json',
  'package-lock.json',
  'electron/package.json',
  'electron/package-lock.json',
  'backend/package.json',
  'backend/package-lock.json',
  'frontend/package.json',
  'frontend/package-lock.json',
];

function runGit(args, options = {}) {
  const gitBinary = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = spawnSync(gitBinary, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`git ${args.join(' ')} failed`);
  }

  return options.capture ? result.stdout.trim() : '';
}

function ensureCleanWorktree() {
  const status = runGit(['status', '--short'], { capture: true });
  if (status) {
    console.error('Release aborted: git working tree is not clean.');
    console.error(status);
    process.exit(1);
  }
}

function ensureOnMaster() {
  const branch = runGit(['branch', '--show-current'], { capture: true });
  if (branch !== 'master') {
    console.error(`Release aborted: current branch is "${branch}", expected "master".`);
    process.exit(1);
  }
}

function ensureTagDoesNotExist(tag) {
  const existing = runGit(['tag', '--list', tag], { capture: true });
  if (existing === tag) {
    console.error(`Release aborted: tag ${tag} already exists locally.`);
    process.exit(1);
  }
}

function updateVersionInJsonFile(relativePath, nextVersion) {
  const filePath = path.join(repoRoot, relativePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  data.version = nextVersion;
  if (data.packages && data.packages['']) {
    data.packages[''].version = nextVersion;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

ensureCleanWorktree();
ensureOnMaster();
ensureTagDoesNotExist(tagName);

for (const relativePath of filesToUpdate) {
  updateVersionInJsonFile(relativePath, version);
}

runGit(['add', ...filesToUpdate]);
runGit(['commit', '-m', `Release ${tagName}`]);
runGit(['tag', tagName]);
runGit(['push', 'origin', 'master']);
runGit(['push', 'origin', tagName]);

console.log(`Release ${tagName} created and pushed.`);
