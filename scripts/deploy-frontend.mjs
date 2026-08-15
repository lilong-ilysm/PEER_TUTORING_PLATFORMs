/**
 * Deploys dist/ to AWS Amplify Hosting using a manual deployment.
 *
 * MUTATING: creates a deployment job on an existing Amplify app and branch. It does
 * not create or delete the app, and it never touches IAM.
 *
 * Manual deployment is used deliberately rather than a Git-connected build:
 * Amplify's Git integration for Gen 2 requires a **service role**, and creating an
 * IAM role is exactly what the AWS Academy Learner Lab denies. Manual deployment
 * needs no role at all.
 *
 * Usage:
 *   npm run build
 *   npm run deploy:frontend -- --app-id dxxxxxxxxxxxxx --branch main
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const appId = arg('app-id');
const branch = arg('branch', 'main');
const region = arg('region', 'us-east-1');

if (!appId) {
  console.error('Missing --app-id. Find it with: aws amplify list-apps --region us-east-1');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const distDir = resolve(root, 'dist');
const zipPath = resolve(root, 'dist-frontend.zip');

if (!existsSync(distDir)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

function aws(argv) {
  return execFileSync('aws', [...argv, '--region', region], { encoding: 'utf8' });
}

// --- 1. Zip the build output ------------------------------------------------
// The archive must have index.html at its root, hence dist/* rather than dist.
rmSync(zipPath, { force: true });
console.log('Packaging dist/ ...');
if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('bash', ['-c', `cd '${distDir}' && zip -q -r '${zipPath}' .`], {
    stdio: 'inherit',
  });
}
console.log(`Archive: ${(statSync(zipPath).size / 1024).toFixed(0)} kB`);

// --- 2. Ensure the branch exists -------------------------------------------
try {
  aws(['amplify', 'get-branch', '--app-id', appId, '--branch-name', branch]);
  console.log(`Branch "${branch}" exists.`);
} catch {
  console.log(`Branch "${branch}" not found; creating it.`);
  aws(['amplify', 'create-branch', '--app-id', appId, '--branch-name', branch]);
}

// --- 3. Request an upload slot ---------------------------------------------
console.log('Creating deployment ...');
const created = JSON.parse(
  aws(['amplify', 'create-deployment', '--app-id', appId, '--branch-name', branch]),
);

const { zipUploadUrl, jobId } = created;
if (!zipUploadUrl) {
  console.error('Amplify did not return an upload URL.', created);
  process.exit(1);
}

// --- 4. Upload -------------------------------------------------------------
console.log('Uploading ...');
const response = await fetch(zipUploadUrl, {
  method: 'PUT',
  body: readFileSync(zipPath),
  headers: { 'Content-Type': 'application/zip' },
});

if (!response.ok) {
  console.error(`Upload failed: HTTP ${response.status} ${response.statusText}`);
  process.exit(1);
}

// --- 5. Start the deployment ----------------------------------------------
console.log('Starting deployment ...');
const started = JSON.parse(
  aws([
    'amplify',
    'start-deployment',
    '--app-id',
    appId,
    '--branch-name',
    branch,
    ...(jobId ? ['--job-id', jobId] : []),
  ]),
);

rmSync(zipPath, { force: true });

console.log(`Deployment ${started.jobSummary?.jobId ?? ''} ${started.jobSummary?.status ?? 'started'}`);
console.log(`URL: https://${branch}.${appId}.amplifyapp.com`);
console.log('Check progress with:');
console.log(`  aws amplify list-jobs --app-id ${appId} --branch-name ${branch} --region ${region} --max-results 1`);
