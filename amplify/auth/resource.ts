import { defineAuth } from '@aws-amplify/backend';

/**
 * Amazon Cognito user pool.
 *
 * Email is the sign-in identifier, which is what gives AC-2 (duplicate email
 * rejected) for free: Cognito enforces uniqueness on the alias, so two accounts
 * can never share an email even under a race.
 *
 * The password policy is set explicitly in `amplify/backend.ts` and mirrored by
 * `passwordProblems()` in `shared/domain/rules.ts`.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    // Collected at sign-up and used as the display name across the product.
    fullname: {
      required: true,
      mutable: true,
    },
  },
});
