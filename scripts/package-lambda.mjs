/**
 * Zips the bundled Lambda into dist-lambda/function.zip.
 *
 * Node has no built-in zip writer, so this shells out to the platform's archiver.
 * That sounds simple and is not, for one specific reason:
 *
 * WHY THE FILE IS STAGED IN A TEMP DIRECTORY
 * ------------------------------------------
 * This project may live inside a OneDrive-synced folder. OneDrive opens a file for
 * reading the moment it is written, to upload it. Windows' Compress-Archive opens
 * its source with a share mode that refuses to proceed while another process holds
 * the file, so zipping a freshly-built bundle fails with:
 *
 *   "The process cannot access the file ... because it is being used by another
 *    process."
 *
 * Antivirus on-access scanning causes the same thing. Rather than fight it, the
 * bundle is copied to the OS temp directory (never synced, never scanned in the same
 * way), zipped there, and the finished archive copied back. Reads are also retried,
 * because the copy itself can hit the lock.
 *
 * The archive must contain index.js at its ROOT, because the Lambda handler is
 * configured as `index.handler`.
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bundleDir = resolve(root, 'dist-lambda');
const bundle = resolve(bundleDir, 'index.js');
const zipPath = resolve(bundleDir, 'function.zip');

if (!existsSync(bundle)) {
  console.error('dist-lambda/index.js not found. Run `npm run build:lambda` first.');
  process.exit(1);
}

/** Retries an operation that can fail transiently because of a file lock. */
function withRetry(label, operation, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      const locked =
        error.code === 'EBUSY' ||
        error.code === 'EPERM' ||
        error.code === 'EACCES' ||
        /being used by another process/i.test(error.message ?? '');

      if (!locked || attempt === attempts) throw error;

      console.log(`  ${label}: locked, retrying (${attempt}/${attempts - 1})…`);
      // Busy-wait briefly. Node has no synchronous sleep, and this script is
      // deliberately synchronous top to bottom.
      const until = Date.now() + 400;
      while (Date.now() < until) {
        /* wait */
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts.`);
}

if (!existsSync(bundleDir)) mkdirSync(bundleDir, { recursive: true });

// Staging directory outside the project tree, so no sync client or editor holds it.
const stageDir = mkdtempSync(join(tmpdir(), 'peerlearn-lambda-'));
const stagedBundle = join(stageDir, 'index.js');
const stagedZip = join(stageDir, 'function.zip');

try {
  // Read through Node and write a fresh copy, rather than copyFileSync, so a lock on
  // the ORIGINAL only has to survive a single read.
  const contents = withRetry('read bundle', () => readFileSync(bundle));
  writeFileSync(stagedBundle, contents);

  console.log(`Staged ${(contents.length / 1024).toFixed(1)} kB in ${stageDir}`);

  if (process.platform === 'win32') {
    try {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Compress-Archive -LiteralPath '${stagedBundle}' -DestinationPath '${stagedZip}' -Force`,
        ],
        { stdio: 'pipe' },
      );
    } catch (error) {
      // tar.exe ships with Windows 10 1803+ and can write zips. Worth trying before
      // giving up, since it uses ordinary read sharing.
      console.log('  Compress-Archive failed, trying tar…');
      execFileSync('tar', ['-a', '-c', '-f', stagedZip, 'index.js'], {
        cwd: stageDir,
        stdio: 'pipe',
      });
      void error;
    }
  } else {
    // -j strips directory names so index.js lands at the archive root.
    execFileSync('zip', ['-j', '-q', stagedZip, stagedBundle], { stdio: 'inherit' });
  }

  if (!existsSync(stagedZip)) {
    throw new Error('The archiver reported success but produced no archive.');
  }

  withRetry('write archive', () => {
    rmSync(zipPath, { force: true });
    copyFileSync(stagedZip, zipPath);
  });

  console.log(
    `Packaged: ${zipPath} (${(statSync(zipPath).size / 1024).toFixed(1)} kB)`,
  );
  console.log('Next: npm run deploy:lambda -- --stack peerlearn --region us-east-1');
} catch (error) {
  console.error('\nCould not create the Lambda archive.');
  console.error(error.message ?? error);
  console.error(
    '\nIf this keeps happening, pause OneDrive sync (or move the project outside the\n' +
      'synced folder) and try again. The bundle itself built correctly; only the zip\n' +
      'step is affected.',
  );
  process.exit(1);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
