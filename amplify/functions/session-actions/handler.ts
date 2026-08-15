/**
 * All session, review and message writes.
 *
 * The client is never trusted. Every handler below re-derives the caller's
 * identity from the Cognito claims attached by AppSync, loads the current records
 * from DynamoDB, and applies the shared rules in `shared/domain/rules.ts`. The
 * client-side adapter runs the same rule functions, so the UI can show accurate
 * errors, but the decision that counts is made here.
 *
 * AC-20 (no double booking under concurrency) is guaranteed by a DynamoDB
 * conditional update on the availability slot, not by a read-then-write, because a
 * read-then-write loses a genuine race.
 */

import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  DynamoDBClient,
  UpdateItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { env } from '$amplify/env/session-actions';

import type { Schema } from '../../data/resource';
import { DomainError, DomainErrorCode } from '../../../shared/domain/errors';
import {
  assertCanBook,
  assertCanMessage,
  assertCanReview,
  assertIsParticipant,
  assertIsTutorOf,
  assertTransition,
  computeRatingAggregate,
  validateMessageBody,
  validateTopic,
  LIMITS,
} from '../../../shared/domain/rules';
import { isValidSubjectId, getSubjectName } from '../../../shared/domain/subjects';
import type {
  NotificationType,
  Session as DomainSession,
} from '../../../shared/domain/types';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

const ddb = new DynamoDBClient({});

/**
 * Injected by `amplify/backend.ts`, which reads the generated table name from the
 * data resource. Read from `process.env` rather than the generated `$amplify/env`
 * type because the variable is attached via the CDK escape hatch, which does not
 * feed the generated types.
 */
const SLOT_TABLE = process.env.SLOT_TABLE_NAME;
if (!SLOT_TABLE) {
  throw new Error(
    'SLOT_TABLE_NAME is not set. Check the addEnvironment call in amplify/backend.ts.',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyEvent = AppSyncResolverEvent<Record<string, unknown>> & {
  info: { fieldName: string };
};

interface Caller {
  userId: string;
  displayName: string;
  email: string;
}

function requireCaller(event: AnyEvent): Caller {
  const identity = event.identity as AppSyncIdentityCognito | null;
  const userId = identity?.sub;
  if (!userId) {
    throw new DomainError(DomainErrorCode.UNAUTHENTICATED, 'You need to sign in first.');
  }
  const claims = (identity.claims ?? {}) as Record<string, unknown>;
  return {
    userId,
    displayName: String(claims.name ?? claims['cognito:username'] ?? 'Member'),
    email: String(claims.email ?? ''),
  };
}

/** Unwraps an Amplify data call, converting GraphQL errors into DomainError. */
function unwrap<T>(result: { data: T | null; errors?: { message: string }[] }, what: string): T {
  if (result.errors?.length) {
    console.error(`${what} failed`, result.errors);
    throw new DomainError(DomainErrorCode.INTERNAL, `Could not ${what}.`);
  }
  if (result.data === null || result.data === undefined) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, `${what}: not found.`);
  }
  return result.data;
}

async function loadSession(sessionId: string) {
  const result = await client.models.Session.get({ id: sessionId });
  if (!result.data) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
  }
  return result.data;
}

/** Narrows an Amplify model record to the shared domain shape used by the rules. */
function toDomainSession(record: {
  id: string;
  slotId: string;
  tutorProfileId: string;
  tutorUserId: string;
  studentUserId: string;
  subjectId: string;
  topic: string;
  status: string;
  startAt: string;
  endAt: string;
  mode: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}): DomainSession {
  return {
    id: record.id,
    slotId: record.slotId,
    tutorProfileId: record.tutorProfileId,
    tutorUserId: record.tutorUserId,
    studentUserId: record.studentUserId,
    subjectId: record.subjectId,
    topic: record.topic,
    mode: record.mode as DomainSession['mode'],
    status: record.status as DomainSession['status'],
    startAt: record.startAt,
    endAt: record.endAt,
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkTo: string;
}) {
  // A failed notification must never fail the operation that triggered it.
  try {
    await client.models.Notification.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      linkTo: params.linkTo,
      read: false,
    });
  } catch (error) {
    console.error('notification create failed', error);
  }
}

/**
 * Atomically flips a slot OPEN -> BOOKED. Returns false when someone else won the
 * race, which is exactly the AC-20 case.
 */
async function claimSlot(slotId: string, sessionId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: SLOT_TABLE,
        Key: { id: { S: slotId } },
        UpdateExpression: 'SET #status = :booked, #sessionId = :sid, #updatedAt = :now',
        ConditionExpression: '#status = :open',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#sessionId': 'sessionId',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':booked': { S: 'BOOKED' },
          ':open': { S: 'OPEN' },
          ':sid': { S: sessionId },
          ':now': { S: new Date().toISOString() },
        },
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}

/** Releases a slot back to OPEN. Used on cancel/decline and on rollback. */
async function releaseSlot(slotId: string): Promise<void> {
  await ddb.send(
    new UpdateItemCommand({
      TableName: SLOT_TABLE,
      Key: { id: { S: slotId } },
      UpdateExpression: 'SET #status = :open, #updatedAt = :now REMOVE #sessionId',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#sessionId': 'sessionId',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':open': { S: 'OPEN' },
        ':now': { S: new Date().toISOString() },
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// bookSession (AC-19, AC-20, AC-21)
// ---------------------------------------------------------------------------

async function bookSession(event: AnyEvent) {
  const caller = requireCaller(event);
  const slotId = String(event.arguments.slotId);
  const subjectId = String(event.arguments.subjectId);
  const topic = validateTopic(String(event.arguments.topic ?? ''));
  const rawNote = event.arguments.note ? String(event.arguments.note) : null;

  if (!isValidSubjectId(subjectId)) {
    throw new DomainError(DomainErrorCode.VALIDATION, 'Choose a subject.', 'subjectId');
  }
  const note = rawNote?.trim().slice(0, LIMITS.noteMax) || null;

  const slotResult = await client.models.AvailabilitySlot.get({ id: slotId });
  if (!slotResult.data) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That time is no longer offered.');
  }
  const slot = slotResult.data;

  const tutorProfile = unwrap(
    await client.models.TutorProfile.get({ id: slot.tutorProfileId }),
    'load the tutor profile',
  );
  if (!tutorProfile.subjectIds.includes(subjectId)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'This tutor does not teach that subject.',
      'subjectId',
    );
  }

  // The student's existing sessions, needed for the duplicate and clash checks.
  const existing = await client.models.Session.list({
    filter: { studentUserId: { eq: caller.userId } },
    limit: 500,
  });
  const studentSessions = (existing.data ?? []).map((record) =>
    toDomainSession(record as never),
  );

  assertCanBook({
    slot: {
      id: slot.id,
      tutorProfileId: slot.tutorProfileId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status: slot.status as 'OPEN' | 'BOOKED',
      sessionId: slot.sessionId ?? null,
    },
    studentUserId: caller.userId,
    tutorUserId: slot.tutorUserId,
    studentSessions,
    now: new Date(),
  });

  // Reserve the slot before creating the session so a lost race costs nothing.
  const sessionId = crypto.randomUUID();
  const claimed = await claimSlot(slotId, sessionId);
  if (!claimed) {
    throw new DomainError(
      DomainErrorCode.SLOT_CONFLICT,
      'Someone just booked that time. Choose another slot.',
    );
  }

  try {
    const created = unwrap(
      await client.models.Session.create({
        id: sessionId,
        slotId,
        tutorProfileId: slot.tutorProfileId,
        tutorUserId: slot.tutorUserId,
        tutorName: tutorProfile.displayName,
        studentUserId: caller.userId,
        studentName: caller.displayName,
        participantUserIds: [slot.tutorUserId, caller.userId],
        subjectId,
        topic,
        note,
        mode: tutorProfile.sessionMode,
        status: 'PENDING',
        startAt: slot.startAt,
        endAt: slot.endAt,
        hasReview: false,
      }),
      'create the session',
    );

    await notify({
      userId: slot.tutorUserId,
      type: 'SESSION_REQUESTED',
      title: 'New session request',
      body: `${caller.displayName} requested help with ${getSubjectName(subjectId)}.`,
      linkTo: '/dashboard/sessions',
    });

    return created;
  } catch (error) {
    // Do not leave the slot reserved for a session that was never created.
    await releaseSlot(slotId).catch((rollbackError) =>
      console.error('slot rollback failed', rollbackError),
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// respondToSession (AC-23, AC-24)
// ---------------------------------------------------------------------------

async function respondToSession(event: AnyEvent) {
  const caller = requireCaller(event);
  const sessionId = String(event.arguments.sessionId);
  const accept = Boolean(event.arguments.accept);
  const meetingLink = event.arguments.meetingLink ? String(event.arguments.meetingLink) : null;

  const session = await loadSession(sessionId);
  const domain = toDomainSession(session as never);

  assertIsTutorOf(domain, caller.userId);
  const next = accept ? 'CONFIRMED' : 'DECLINED';
  assertTransition(domain.status, next);

  if (meetingLink && !/^https:\/\/\S+$/i.test(meetingLink)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'A meeting link must be a secure https URL.',
      'meetingLink',
    );
  }

  const updated = unwrap(
    await client.models.Session.update({
      id: sessionId,
      status: next,
      meetingLink: accept ? meetingLink : null,
    }),
    'update the session',
  );

  // AC-22: declining frees the slot for someone else.
  if (!accept) {
    await releaseSlot(session.slotId).catch((error) =>
      console.error('slot release failed', error),
    );
  }

  await notify({
    userId: session.studentUserId,
    type: accept ? 'SESSION_CONFIRMED' : 'SESSION_DECLINED',
    title: accept ? 'Session confirmed' : 'Session declined',
    body: accept
      ? `${session.tutorName} confirmed your ${getSubjectName(session.subjectId)} session.`
      : `${session.tutorName} cannot make that time. Try another slot.`,
    linkTo: '/dashboard/sessions',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// cancelSession (AC-22, AC-24)
// ---------------------------------------------------------------------------

async function cancelSession(event: AnyEvent) {
  const caller = requireCaller(event);
  const sessionId = String(event.arguments.sessionId);

  const session = await loadSession(sessionId);
  const domain = toDomainSession(session as never);

  assertIsParticipant(domain, caller.userId);
  assertTransition(domain.status, 'CANCELLED');

  const updated = unwrap(
    await client.models.Session.update({
      id: sessionId,
      status: 'CANCELLED',
      cancelledByUserId: caller.userId,
    }),
    'cancel the session',
  );

  await releaseSlot(session.slotId).catch((error) =>
    console.error('slot release failed', error),
  );

  const otherUserId =
    caller.userId === session.tutorUserId ? session.studentUserId : session.tutorUserId;
  await notify({
    userId: otherUserId,
    type: 'SESSION_CANCELLED',
    title: 'Session cancelled',
    body: `${caller.displayName} cancelled the ${getSubjectName(session.subjectId)} session.`,
    linkTo: '/dashboard/sessions',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// completeSession (AC-23, AC-24)
// ---------------------------------------------------------------------------

async function completeSession(event: AnyEvent) {
  const caller = requireCaller(event);
  const sessionId = String(event.arguments.sessionId);

  const session = await loadSession(sessionId);
  const domain = toDomainSession(session as never);

  assertIsTutorOf(domain, caller.userId);
  assertTransition(domain.status, 'COMPLETED');

  if (Date.parse(session.startAt) > Date.now()) {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      'You cannot complete a session before it has started.',
    );
  }

  const updated = unwrap(
    await client.models.Session.update({
      id: sessionId,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    }),
    'complete the session',
  );

  await notify({
    userId: session.studentUserId,
    type: 'SESSION_COMPLETED',
    title: 'Session completed',
    body: `Your ${getSubjectName(session.subjectId)} session is complete. Leave a review to help others.`,
    linkTo: '/dashboard/sessions',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// submitReview (AC-25 to AC-28)
// ---------------------------------------------------------------------------

async function submitReview(event: AnyEvent) {
  const caller = requireCaller(event);
  const sessionId = String(event.arguments.sessionId);
  const rating = Number(event.arguments.rating);
  const comment = String(event.arguments.comment ?? '');

  const session = await loadSession(sessionId);
  const domain = toDomainSession(session as never);

  const existingForSession = await client.models.Review.list({
    filter: { sessionId: { eq: sessionId } },
    limit: 10,
  });

  assertCanReview({
    session: domain,
    studentUserId: caller.userId,
    existingReviews: (existingForSession.data ?? []).map((review) => ({
      id: review.id,
      sessionId: review.sessionId,
      tutorProfileId: review.tutorProfileId,
      studentUserId: review.studentUserId,
      rating: review.rating,
      comment: review.comment ?? '',
      createdAt: review.createdAt ?? '',
    })),
    rating,
    comment,
  });

  const created = unwrap(
    await client.models.Review.create({
      sessionId,
      tutorProfileId: session.tutorProfileId,
      studentUserId: caller.userId,
      studentName: caller.displayName,
      subjectId: session.subjectId,
      rating,
      comment: comment.trim() || null,
    }),
    'save the review',
  );

  await client.models.Session.update({ id: sessionId, hasReview: true });

  // AC-28: recompute the aggregate from the reviews that actually exist, so the
  // stored value can never drift from the visible reviews.
  const allForTutor = await client.models.Review.list({
    filter: { tutorProfileId: { eq: session.tutorProfileId } },
    limit: 1000,
  });
  const { ratingAvg, ratingCount } = computeRatingAggregate(
    (allForTutor.data ?? []).map((review) => review.rating),
  );
  await client.models.TutorProfile.update({
    id: session.tutorProfileId,
    ratingAvg,
    ratingCount,
  });

  await notify({
    userId: session.tutorUserId,
    type: 'REVIEW_RECEIVED',
    title: 'New review',
    body: `${caller.displayName} left you a ${rating}-star review.`,
    linkTo: `/tutors/${session.tutorProfileId}`,
  });

  return created;
}

// ---------------------------------------------------------------------------
// sendMessage (AC-29, AC-30)
// ---------------------------------------------------------------------------

async function sendMessage(event: AnyEvent) {
  const caller = requireCaller(event);
  const sessionId = String(event.arguments.sessionId);
  const body = validateMessageBody(String(event.arguments.body ?? ''));

  const session = await loadSession(sessionId);
  const domain = toDomainSession(session as never);

  assertCanMessage(domain, caller.userId);

  const created = unwrap(
    await client.models.Message.create({
      sessionId,
      senderUserId: caller.userId,
      senderName: caller.displayName,
      participantUserIds: [session.tutorUserId, session.studentUserId],
      body,
    }),
    'send the message',
  );

  const otherUserId =
    caller.userId === session.tutorUserId ? session.studentUserId : session.tutorUserId;
  await notify({
    userId: otherUserId,
    type: 'MESSAGE_RECEIVED',
    title: `Message from ${caller.displayName}`,
    body: body.length > 90 ? `${body.slice(0, 90)}...` : body,
    linkTo: '/dashboard/messages',
  });

  return created;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (event: AnyEvent) => Promise<unknown>> = {
  bookSession,
  respondToSession,
  cancelSession,
  completeSession,
  submitReview,
  sendMessage,
};

export const handler = async (event: AnyEvent) => {
  const fieldName = event.info?.fieldName;
  const run = HANDLERS[fieldName];

  if (!run) {
    console.error('unknown field', fieldName);
    throw new Error('[INTERNAL] Unsupported operation.');
  }

  try {
    return await run(event);
  } catch (error) {
    if (error instanceof DomainError) {
      // Encoded so the client can recover the code from the GraphQL error string.
      throw new Error(`[${error.code}] ${error.message}`);
    }
    // Never leak internals to the client.
    console.error(`${fieldName} failed`, error);
    throw new Error('[INTERNAL] Something went wrong. Please try again.');
  }
};
