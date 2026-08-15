import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { sessionActions } from './functions/session-actions/resource';

const backend = defineBackend({
  auth,
  data,
  sessionActions,
});

// ---------------------------------------------------------------------------
// Cognito password policy.
//
// Set explicitly rather than left at the Cognito default, because the client-side
// checks in `shared/domain/rules.ts` (`passwordProblems`) must agree with it
// exactly. If the server required a symbol and the client did not, a user would
// pass client validation and then be rejected by Cognito with a confusing error.
// ---------------------------------------------------------------------------
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: false,
    temporaryPasswordValidityDays: 3,
  },
};

// Email is the sign-in alias, so Cognito itself guarantees uniqueness (AC-2).
cfnUserPool.autoVerifiedAttributes = ['email'];

// ---------------------------------------------------------------------------
// AC-20: atomic slot claiming.
//
// The session-actions Lambda performs a DynamoDB conditional update on the
// availability slot table so that two simultaneous bookings cannot both succeed.
// That requires the generated table name and direct IAM access, which the data
// resource exposes through this escape hatch.
// ---------------------------------------------------------------------------
const slotTable = backend.data.resources.tables['AvailabilitySlot'];
if (!slotTable) {
  throw new Error(
    'AvailabilitySlot table not found. Did the model name change in amplify/data/resource.ts?',
  );
}

backend.sessionActions.addEnvironment('SLOT_TABLE_NAME', slotTable.tableName);
slotTable.grantReadWriteData(backend.sessionActions.resources.lambda);

export default backend;
