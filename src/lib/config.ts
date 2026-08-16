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

/**
 * REST backend configuration.
 *
 * Used by the API Gateway + Lambda + DynamoDB deployment (`infra/peerlearn.yaml`),
 * which exists because AWS Amplify Gen 2 cannot be deployed in an AWS Academy
 * Learner Lab: Gen 2 requires `iam:CreateRole`, which that environment denies.
 *
 * All three values are public by nature. A Cognito user pool id and app client id
 * are designed to be shipped in a browser bundle; they are identifiers, not
 * credentials. There is deliberately no identity pool, so the browser never holds
 * AWS credentials at all.
 */
export const REST_CONFIG = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
} as const;

const restConfigured = Boolean(
  REST_CONFIG.apiBaseUrl && REST_CONFIG.userPoolId && REST_CONFIG.userPoolClientId,
);

export type DataMode = 'rest' | 'amplify' | 'local';

function resolveDataMode(): DataMode {
  const requested = (import.meta.env.VITE_DATA_MODE ?? 'auto').toLowerCase();

  if (requested === 'rest') {
    if (!restConfigured) {
      // Failing loudly beats silently serving demo data from something that looks
      // like a production build.
      throw new Error(
        'VITE_DATA_MODE=rest but VITE_API_BASE_URL, VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID are not all set. See infra/peerlearn.yaml outputs.',
      );
    }
    return 'rest';
  }

  if (requested === 'amplify') {
    if (!amplifyOutputs) {
      throw new Error(
        'VITE_DATA_MODE=amplify but amplify_outputs.json is missing. Run `npx ampx sandbox` or deploy the backend first.',
      );
    }
    return 'amplify';
  }

  if (requested === 'local') return 'local';

  // auto: prefer a configured REST backend, then Amplify, then demo data.
  if (restConfigured) return 'rest';
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

/**
 * Email of the seeded demo administrator.
 *
 * This is NOT a credential: it identifies an account that exists only in demo mode,
 * in the visitor's own browser, alongside the other seed data. No administrator is
 * ever seeded into a deployed AWS database — the first real admin is created by
 * promoting an existing account, which requires direct database access.
 */
export const ADMIN_DEMO_EMAIL = 'admin@peertutor.test';
