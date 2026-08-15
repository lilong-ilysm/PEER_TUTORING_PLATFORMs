/**
 * Uploads the packaged Lambda bundle.
 *
 * MUTATING: this replaces the code of an existing function. It does not create,
 * delete or modify any other AWS resource, and it never touches IAM.
 *
 * Usage:
 *   npm run package:lambda
 *   npm run deploy:lambda -- --stack peerlearn --region us-east-1
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const stack = arg('stack', 'peerlearn');
const region = arg('region', 'us-east-1');
const functionName = arg('function', `${stack}-api`);

const zipPath = resolve(import.meta.dirname, '..', 'dist-lambda', 'function.zip');

if (!existsSync(zipPath)) {
  console.error('dist-lambda/function.zip not found. Run `npm run package:lambda` first.');
  process.exit(1);
}

console.log(`Updating function code: ${functionName} (${region})`);

try {
  const output = execFileSync(
    'aws',
    [
      'lambda',
      'update-function-code',
      '--function-name',
      functionName,
      '--zip-file',
      `fileb://${zipPath}`,
      '--region',
      region,
      '--query',
      'LastUpdateStatus',
      '--output',
      'text',
    ],
    { encoding: 'utf8' },
  );
  console.log(`Done. LastUpdateStatus: ${output.trim()}`);
  console.log('Give it a few seconds, then check: aws lambda get-function --function-name ' + functionName);
} catch (error) {
  console.error('Upload failed.');
  console.error(error.stdout?.toString() || error.message);
  process.exit(1);
}
