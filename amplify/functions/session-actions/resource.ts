import { defineFunction } from '@aws-amplify/backend';

/**
 * Every state-changing operation on sessions, reviews and messages runs through
 * this single Lambda.
 *
 * Why one function rather than declarative model mutations: the invariants in
 * `shared/domain/rules.ts` (AC-20 through AC-28) span multiple records and must be
 * checked against the caller's real identity. A client that can write a `Session`
 * row directly can set `status: CONFIRMED` on someone else's request. Routing
 * writes through a Lambda that owns the rules means the client is never trusted.
 */
export const sessionActions = defineFunction({
  name: 'session-actions',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  runtime: 20,
});
