#!/usr/bin/env node

const { execSync } = require('child_process');

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...options });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Invalid bump type: "${bumpType}". Must be patch, minor, or major.`);
  process.exit(1);
}

// 1. Ensure clean git status
const status = runCapture('git status --porcelain');
if (status.length > 0) {
  console.error('Error: Working tree has uncommitted changes. Please commit or stash first:');
  console.error(status);
  process.exit(1);
}

// 2. Check branch
const currentBranch = runCapture('git branch --show-current');
if (currentBranch !== 'main') {
  console.warn(`Warning: Currently on branch "${currentBranch}", expected "main".`);
}

console.log('Fetching latest changes from origin...');
try {
  run('git fetch origin');
} catch {}

// 3. Run validation build and lint
console.log('Running lint and build validation before release...');
run('npm run lint');
run('npm run build');

// 4. Bump version in package.json and create commit & tag atomically
console.log(`Bumping ${bumpType} version in package.json...`);
const newVersionTag = runCapture(`npm version ${bumpType} -m "chore(release): v%s"`);
console.log(`Successfully bumped to ${newVersionTag}!`);

// 5. Push commit and tag to origin
console.log(`Pushing commit and tag ${newVersionTag} to origin...`);
run('git push origin main --follow-tags');

console.log(`\n🎉 Release ${newVersionTag} successfully created and pushed!`);
console.log('GitHub Actions will now build installers and publish the release.');
