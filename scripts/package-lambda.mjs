/**
 * Zips the bundled Lambda.
 *
 * Node has no built-in zip writer, so this shells out to whatever the platform
 * provides: Compress-Archive on Windows, `zip` elsewhere. That avoids adding an
 * archiver dependency for one build step.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bundleDir = resolve(root, 'dist-lambda');
const bundle = resolve(bundleDir, 'index.js');
const zipPath = resolve(bundleDir, 'function.zip');

if (!existsSync(bundle)) {
  console.error('dist-lambda/index.js not found. Run `npm run build:lambda` first.');
  process.exit(1);
}

if (!existsSync(bundleDir)) mkdirSync(bundleDir, { recursive: true });
rmSync(zipPath, { force: true });

try {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${bundle}' -DestinationPath '${zipPath}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  } else {
    // -j strips directory names, so index.js lands at the archive root where
    // Lambda's `index.handler` expects it.
    execFileSync('zip', ['-j', '-q', zipPath, bundle], { stdio: 'inherit' });
  }
} catch (error) {
  console.error('Could not create the zip archive.', error.message);
  process.exit(1);
}

console.log(`Packaged: ${zipPath}`);
