/**
 * Runtime configuration and backend selection.
 *
 * `amplify_outputs.json` is written by `npx ampx sandbox` locally and by the
 * Amplify Hosting build in CI. It is gitignored, so it may be absent. Detecting it
 * with `import.meta.glob` rather than a dynamic import matters: a dynamic import
 * of a missing file fails the Vite build, whereas glob simply returns nothing.
 */

const outputModules = import.meta.glob('/amplify_outputs.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const outputsEntry = Object.values(outputModules)[0];

export const amplifyOutputs: Record<string, unknown> | null = outputsEntry?.default ?? null;

export type DataMode = 'amplify' | 'local';

function resolveDataMode(): DataMode {
  const requested = (import.meta.env.VITE_DATA_MODE ?? 'auto').toLowerCase();

  if (requested === 'amplify') {
    if (!amplifyOutputs) {
      // Failing loudly beats silently falling back to demo data in production.
      throw new Error(
        'VITE_DATA_MODE=amplify but amplify_outputs.json is missing. Run `npx ampx sandbox` or deploy the backend first.',
      );
    }
    return 'amplify';
  }
  if (requested === 'local') return 'local';
  return amplifyOutputs ? 'amplify' : 'local';
}

export const DATA_MODE: DataMode = resolveDataMode();

/** AC-43: demo mode must be visibly labelled wherever it is active. */
export const IS_DEMO_MODE = DATA_MODE === 'local';

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'PeerTutor';

export const CURRENCY = 'GBP';

/**
 * Shared password for the seeded demo accounts.
 *
 * Declared here rather than in the seed module so that the login page can show it
 * without importing the entire local backend into the bundle. This is not a secret:
 * in demo mode the accounts exist only in the current browser, and in AWS mode the
 * seed data does not exist at all.
 */
export const DEMO_PASSWORD = 'Password123';
