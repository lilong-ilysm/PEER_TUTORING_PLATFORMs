import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { sessionActions } from '../functions/session-actions/resource';

/**
 * AppSync GraphQL API backed by DynamoDB.
 *
 * Two rules shape the authorisation design:
 *
 * 1. Guests must be able to browse tutors (the PM made discovery public), so some
 *    models are readable with the public API key. Therefore **no publicly readable
 *    model may contain an email address or any other private field**. That is why
 *    `UserProfile` (which holds email) is owner-only, and the public display name
 *    is denormalised onto `TutorProfile`, `Session` and `Review`.
 *
 * 2. Clients get **read** access to sessions, reviews and messages, never write.
 *    All writes go through the `session-actions` Lambda, which owns the invariants.
 *    A client that could write `Session` directly could confirm its own request.
 */
const schema = a
  .schema({
    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------
    UserRole: a.enum(['STUDENT', 'TUTOR']),
    AcademicLevel: a.enum(['HIGH_SCHOOL', 'FOUNDATION', 'UNDERGRADUATE', 'POSTGRADUATE']),
    SessionMode: a.enum(['ONLINE', 'IN_PERSON', 'EITHER']),
    SlotStatus: a.enum(['OPEN', 'BOOKED']),
    SessionStatus: a.enum(['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED']),
    NotificationType: a.enum([
      'SESSION_REQUESTED',
      'SESSION_CONFIRMED',
      'SESSION_DECLINED',
      'SESSION_CANCELLED',
      'SESSION_COMPLETED',
      'REVIEW_RECEIVED',
      'MESSAGE_RECEIVED',
    ]),

    // -------------------------------------------------------------------------
    // Private account record. Holds email, so it is never publicly readable.
    // -------------------------------------------------------------------------
    UserProfile: a
      .model({
        userId: a.string().required(),
        displayName: a.string().required(),
        email: a.email().required(),
        roles: a.ref('UserRole').array().required(),
        institution: a.string(),
        bio: a.string(),
        createdAt: a.datetime(),
      })
      .authorization((allow) => [allow.ownerDefinedIn('userId')]),

    // -------------------------------------------------------------------------
    // Public tutor record. Display name is denormalised here so search needs no
    // join and no private model has to be exposed.
    // -------------------------------------------------------------------------
    TutorProfile: a
      .model({
        userId: a.string().required(),
        displayName: a.string().required(),
        institution: a.string(),
        headline: a.string().required(),
        bio: a.string().required(),
        hourlyRate: a.float().required(),
        currency: a.string().required(),
        sessionMode: a.ref('SessionMode').required(),
        levels: a.ref('AcademicLevel').array().required(),
        subjectIds: a.string().array().required(),
        isPublished: a.boolean().required(),
        // Maintained exclusively by the session-actions Lambda from real reviews
        // (AC-15, AC-28). Null, not zero, when unrated (AC-16).
        ratingAvg: a.float(),
        ratingCount: a.integer().required(),
      })
      .authorization((allow) => [
        allow.ownerDefinedIn('userId'),
        allow.publicApiKey().to(['read']),
        allow.authenticated().to(['read']),
      ]),

    // -------------------------------------------------------------------------
    // Availability. Publicly readable so guests can see when a tutor is free.
    // Only the owning tutor may create or delete; only the Lambda may change
    // `status`, which is what keeps AC-20 honest.
    // -------------------------------------------------------------------------
    AvailabilitySlot: a
      .model({
        tutorProfileId: a.string().required(),
        tutorUserId: a.string().required(),
        startAt: a.datetime().required(),
        endAt: a.datetime().required(),
        status: a.ref('SlotStatus').required(),
        sessionId: a.string(),
      })
      .authorization((allow) => [
        allow.ownerDefinedIn('tutorUserId'),
        allow.publicApiKey().to(['read']),
        allow.authenticated().to(['read']),
      ]),

    // -------------------------------------------------------------------------
    // Sessions. Both participants can read; nobody can write from the client.
    // -------------------------------------------------------------------------
    Session: a
      .model({
        slotId: a.string().required(),
        tutorProfileId: a.string().required(),
        tutorUserId: a.string().required(),
        tutorName: a.string().required(),
        studentUserId: a.string().required(),
        studentName: a.string().required(),
        participantUserIds: a.string().array().required(),
        subjectId: a.string().required(),
        topic: a.string().required(),
        note: a.string(),
        mode: a.ref('SessionMode').required(),
        status: a.ref('SessionStatus').required(),
        startAt: a.datetime().required(),
        endAt: a.datetime().required(),
        meetingLink: a.string(),
        cancelledByUserId: a.string(),
        completedAt: a.datetime(),
        hasReview: a.boolean().required(),
      })
      .authorization((allow) => [
        allow.ownersDefinedIn('participantUserIds').to(['read']),
      ]),

    // -------------------------------------------------------------------------
    // Reviews. Publicly readable because they appear on tutor profiles; written
    // only by the Lambda, which enforces "completed session, student, once".
    // -------------------------------------------------------------------------
    Review: a
      .model({
        sessionId: a.string().required(),
        tutorProfileId: a.string().required(),
        studentUserId: a.string().required(),
        studentName: a.string().required(),
        subjectId: a.string().required(),
        rating: a.integer().required(),
        comment: a.string(),
      })
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        allow.authenticated().to(['read']),
      ]),

    // -------------------------------------------------------------------------
    // Messages. Readable only by the two participants (AC-29), enforced by
    // Cognito identity against the denormalised participant list.
    // -------------------------------------------------------------------------
    Message: a
      .model({
        sessionId: a.string().required(),
        senderUserId: a.string().required(),
        senderName: a.string().required(),
        participantUserIds: a.string().array().required(),
        body: a.string().required(),
      })
      .authorization((allow) => [
        allow.ownersDefinedIn('participantUserIds').to(['read']),
      ]),

    // -------------------------------------------------------------------------
    // Notifications. The recipient may read and mark as read, nothing else.
    // -------------------------------------------------------------------------
    Notification: a
      .model({
        userId: a.string().required(),
        type: a.ref('NotificationType').required(),
        title: a.string().required(),
        body: a.string().required(),
        linkTo: a.string().required(),
        read: a.boolean().required(),
      })
      .authorization((allow) => [allow.ownerDefinedIn('userId').to(['read', 'update'])]),

    // -------------------------------------------------------------------------
    // Mutations. Every session state change is a named, authenticated operation
    // handled by the Lambda. Clients cannot bypass these.
    // -------------------------------------------------------------------------
    bookSession: a
      .mutation()
      .arguments({
        slotId: a.string().required(),
        subjectId: a.string().required(),
        topic: a.string().required(),
        note: a.string(),
      })
      .returns(a.ref('Session'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sessionActions)),

    respondToSession: a
      .mutation()
      .arguments({
        sessionId: a.string().required(),
        accept: a.boolean().required(),
        meetingLink: a.string(),
      })
      .returns(a.ref('Session'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sessionActions)),

    cancelSession: a
      .mutation()
      .arguments({ sessionId: a.string().required() })
      .returns(a.ref('Session'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sessionActions)),

    completeSession: a
      .mutation()
      .arguments({ sessionId: a.string().required() })
      .returns(a.ref('Session'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sessionActions)),

    submitReview: a
      .mutation()
      .arguments({
        sessionId: a.string().required(),
        rating: a.integer().required(),
        comment: a.string(),
      })
      .returns(a.ref('Review'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sessionActions)),

    sendMessage: a
      .mutation()
      .arguments({
        sessionId: a.string().required(),
        body: a.string().required(),
      })
      .returns(a.ref('Message'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sessionActions)),
  })
  // Schema-level grant: gives the session-actions Lambda full read/write access to
  // every model above. This is the only place a function can be granted data
  // access in Amplify Gen 2; per-model `allow.resource(...)` is not supported.
  // It is what lets the client be given read-only access while all writes flow
  // through the handler that owns the invariants.
  .authorization((allow) => [allow.resource(sessionActions)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Signed-in users are the normal case; the API key exists purely so guests
    // can browse tutors, availability and reviews before creating an account.
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
