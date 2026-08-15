/**
 * PeerLearn REST API — single Lambda, internal router.
 *
 * Identity comes from the Cognito claims that API Gateway's authorizer attaches to
 * the request. The client is never trusted with anything: every handler re-derives
 * the caller from those claims, reloads the current records, and applies the shared
 * rules. This is the same trust model as the Amplify version, just over REST.
 *
 * Route prefixes are meaningful:
 *   /public/*  no authorizer  — browsing tutors, availability, reviews
 *   /api/*     Cognito authorizer — everything else
 */

import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

import { DomainError, DomainErrorCode, isDomainError } from '../shared/domain/errors';
import {
  assertCanBook,
  assertCanMessage,
  assertCanReview,
  assertIsParticipant,
  assertIsTutorOf,
  assertNoOverlap,
  assertSlotDeletable,
  assertTransition,
  computeRatingAggregate,
  isDiscoverable,
  validateDisplayName,
  validateHourlyRate,
  validateMessageBody,
  validateSlotTimes,
  validateTopic,
  LIMITS,
} from '../shared/domain/rules';
import { buildListing } from '../shared/domain/listing';
import { isValidSubjectId } from '../shared/domain/subjects';
import type {
  AcademicLevel,
  AppNotification,
  AvailabilitySlot,
  Message,
  NotificationType,
  Review,
  SessionMode,
  SessionView,
  TutorProfile,
  UserProfile,
  UserRole,
} from '../shared/domain/types';
import {
  TABLES,
  UpdateCommand,
  ddb,
  deleteItem,
  getItem,
  patchItem,
  putItem,
  queryAll,
} from './db';

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  SLOT_CONFLICT: 409,
  DUPLICATE_REQUEST: 409,
  INVALID_TRANSITION: 409,
  ALREADY_REVIEWED: 409,
  SLOT_IN_PAST: 400,
  EMAIL_IN_USE: 409,
  INVALID_CREDENTIALS: 401,
  INTERNAL: 500,
};

function ok(body: unknown, statusCode = 200): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body ?? null) };
}

function fail(error: unknown): APIGatewayProxyResult {
  if (isDomainError(error)) {
    return {
      statusCode: STATUS_BY_CODE[error.code] ?? 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ code: error.code, message: error.message, field: error.field }),
    };
  }

  // Never leak internals to the client; the detail goes to CloudWatch instead.
  console.error('Unhandled error', error);
  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      code: DomainErrorCode.INTERNAL,
      message: 'Something went wrong. Please try again.',
    }),
  };
}

function parseBody<T>(event: APIGatewayProxyEvent): T {
  if (!event.body) return {} as T;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(raw) as T;
  } catch {
    throw new DomainError(DomainErrorCode.VALIDATION, 'The request body was not valid JSON.');
  }
}

interface Caller {
  userId: string;
  email: string;
  claimName: string;
}

/** Reads the caller from the authorizer claims. Never from the request body. */
function requireCaller(event: APIGatewayProxyEvent): Caller {
  const claims = event.requestContext?.authorizer?.claims as
    | Record<string, string>
    | undefined;
  const userId = claims?.sub;

  if (!userId) {
    throw new DomainError(DomainErrorCode.UNAUTHENTICATED, 'You need to sign in first.');
  }

  return {
    userId,
    email: claims.email ?? '',
    claimName: claims.name ?? claims['cognito:username'] ?? 'Member',
  };
}

// ---------------------------------------------------------------------------
// Stored record shapes
// ---------------------------------------------------------------------------

interface UserRecord extends UserProfile {
  updatedAt: string;
}

interface TutorProfileRecord extends TutorProfile {
  /** Present only when discoverable. Drives the sparse `byPublished` index. */
  publishedFlag?: string;
}

interface SessionRecord extends SessionView {
  participantUserIds: string[];
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

/**
 * Loads the caller's profile row, creating it on first authenticated request.
 * Cognito owns credentials; this row owns application fields such as roles.
 */
async function ensureUser(caller: Caller): Promise<UserRecord> {
  const existing = await getItem<UserRecord>(TABLES.users, caller.userId);
  if (existing) return existing;

  const record: UserRecord = {
    id: caller.userId,
    userId: caller.userId,
    displayName: caller.claimName,
    email: caller.email,
    // Everyone can learn. The tutor role is added when a tutor profile is saved,
    // or explicitly from the profile screen.
    roles: ['STUDENT'],
    institution: null,
    bio: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return putItem(TABLES.users, record as unknown as Record<string, unknown>) as unknown as UserRecord;
}

async function getTutorProfileByUserId(userId: string): Promise<TutorProfileRecord | null> {
  const items = await queryAll<TutorProfileRecord>({
    TableName: TABLES.tutorProfiles,
    IndexName: 'byUserId',
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
    Limit: 1,
  });
  return items[0] ?? null;
}

async function slotsForTutorProfile(tutorProfileId: string): Promise<AvailabilitySlot[]> {
  return queryAll<AvailabilitySlot>({
    TableName: TABLES.slots,
    IndexName: 'byTutorProfile',
    KeyConditionExpression: 'tutorProfileId = :t',
    ExpressionAttributeValues: { ':t': tutorProfileId },
  });
}

async function sessionsForStudent(studentUserId: string): Promise<SessionRecord[]> {
  return queryAll<SessionRecord>({
    TableName: TABLES.sessions,
    IndexName: 'byStudent',
    KeyConditionExpression: 'studentUserId = :u',
    ExpressionAttributeValues: { ':u': studentUserId },
  });
}

async function sessionsForTutor(tutorUserId: string): Promise<SessionRecord[]> {
  return queryAll<SessionRecord>({
    TableName: TABLES.sessions,
    IndexName: 'byTutor',
    KeyConditionExpression: 'tutorUserId = :u',
    ExpressionAttributeValues: { ':u': tutorUserId },
  });
}

async function reviewsForTutorProfile(tutorProfileId: string): Promise<Review[]> {
  return queryAll<Review>({
    TableName: TABLES.reviews,
    IndexName: 'byTutorProfile',
    KeyConditionExpression: 'tutorProfileId = :t',
    ExpressionAttributeValues: { ':t': tutorProfileId },
  });
}

async function loadSessionForParticipant(
  sessionId: string,
  userId: string,
): Promise<SessionRecord> {
  const session = await getItem<SessionRecord>(TABLES.sessions, sessionId);
  if (!session) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
  }
  assertIsParticipant(session, userId);
  return session;
}

async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkTo: string;
}): Promise<void> {
  const record: AppNotification = {
    id: randomUUID(),
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    linkTo: params.linkTo,
    read: false,
    createdAt: nowIso(),
  };
  try {
    await putItem(TABLES.notifications, record as unknown as Record<string, unknown>);
  } catch (error) {
    // A failed notification must never fail the operation that caused it.
    console.error('notification write failed', error);
  }
}

// ---------------------------------------------------------------------------
// Slot claim / release — the atomicity guarantee
// ---------------------------------------------------------------------------

/**
 * Flips a slot OPEN -> BOOKED atomically.
 *
 * The ConditionExpression is the entire point. A read-then-write would let two
 * simultaneous requests both observe OPEN and both succeed; the condition makes
 * DynamoDB reject the loser. Returns false when the caller lost the race.
 */
async function claimSlot(slotId: string, sessionId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.slots,
        Key: { id: slotId },
        UpdateExpression: 'SET #status = :booked, sessionId = :sid, updatedAt = :now',
        ConditionExpression: '#status = :open',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':booked': 'BOOKED',
          ':open': 'OPEN',
          ':sid': sessionId,
          ':now': nowIso(),
        },
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}

async function releaseSlot(slotId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.slots,
        Key: { id: slotId },
        UpdateExpression: 'SET #status = :open, updatedAt = :now REMOVE sessionId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':open': 'OPEN', ':now': nowIso() },
      }),
    );
  } catch (error) {
    console.error('slot release failed', error);
  }
}

/** Recomputes a tutor's aggregate from the reviews that actually exist. */
async function refreshRatingAggregate(tutorProfileId: string): Promise<void> {
  const reviews = await reviewsForTutorProfile(tutorProfileId);
  const { ratingAvg, ratingCount } = computeRatingAggregate(
    reviews.map((review) => review.rating),
  );
  await patchItem(TABLES.tutorProfiles, tutorProfileId, {
    ratingAvg: ratingAvg === null ? null : ratingAvg,
    ratingCount,
    updatedAt: nowIso(),
  });
}

// ---------------------------------------------------------------------------
// Public handlers
// ---------------------------------------------------------------------------

async function listTutorListings() {
  const profiles = await queryAll<TutorProfileRecord>({
    TableName: TABLES.tutorProfiles,
    IndexName: 'byPublished',
    KeyConditionExpression: 'publishedFlag = :flag',
    ExpressionAttributeValues: { ':flag': '1' },
  });

  const now = new Date();
  const listings = await Promise.all(
    profiles.map(async (profile) => {
      const slots = await slotsForTutorProfile(profile.id);
      return buildListing(profile, slots, now);
    }),
  );
  return listings;
}

async function getTutorListing(tutorProfileId: string) {
  const profile = await getItem<TutorProfileRecord>(TABLES.tutorProfiles, tutorProfileId);
  if (!profile) return null;
  const slots = await slotsForTutorProfile(tutorProfileId);
  return buildListing(profile, slots, new Date());
}

// ---------------------------------------------------------------------------
// Authenticated handlers
// ---------------------------------------------------------------------------

async function updateMyProfile(caller: Caller, body: Record<string, unknown>) {
  const user = await ensureUser(caller);
  const changes: Record<string, unknown> = { updatedAt: nowIso() };

  if (body.displayName !== undefined) {
    changes.displayName = validateDisplayName(String(body.displayName));
  }
  if (body.institution !== undefined) {
    changes.institution = String(body.institution ?? '').trim() || null;
  }
  if (body.bio !== undefined) {
    const bio = String(body.bio ?? '').trim();
    if (bio.length > LIMITS.bioMax) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        `Keep your bio under ${LIMITS.bioMax} characters.`,
        'bio',
      );
    }
    changes.bio = bio || null;
  }
  if (body.roles !== undefined) {
    const roles = (body.roles as UserRole[]).filter(
      (role) => role === 'STUDENT' || role === 'TUTOR',
    );
    if (roles.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'You need at least one role on your account.',
        'roles',
      );
    }
    changes.roles = roles;
  }

  const updated = await patchItem<UserRecord>(TABLES.users, user.id, changes);

  // Keep the denormalised public copies in step, or the tutor card and the
  // account would disagree about the person's name.
  if (changes.displayName !== undefined || changes.institution !== undefined) {
    const tutorProfile = await getTutorProfileByUserId(caller.userId);
    if (tutorProfile) {
      await patchItem(TABLES.tutorProfiles, tutorProfile.id, {
        displayName: updated.displayName,
        institution: updated.institution ?? null,
        updatedAt: nowIso(),
      });
    }
  }

  return updated;
}

async function saveMyTutorProfile(caller: Caller, body: Record<string, unknown>) {
  const user = await ensureUser(caller);

  const headline = String(body.headline ?? '').trim();
  if (headline.length < 10 || headline.length > LIMITS.headlineMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Write a headline between 10 and ${LIMITS.headlineMax} characters.`,
      'headline',
    );
  }

  const bio = String(body.bio ?? '').trim();
  if (bio.length < 40 || bio.length > LIMITS.bioMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Write a bio between 40 and ${LIMITS.bioMax} characters.`,
      'bio',
    );
  }

  const hourlyRate = validateHourlyRate(Number(body.hourlyRate));

  const subjectIds = [...new Set((body.subjectIds as string[]) ?? [])].filter(
    isValidSubjectId,
  );
  if (subjectIds.length === 0) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Pick at least one subject you can tutor.',
      'subjectIds',
    );
  }

  const levels = ((body.levels as AcademicLevel[]) ?? []).filter(Boolean);
  if (levels.length === 0) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Pick at least one level you can teach.',
      'levels',
    );
  }

  const sessionMode = String(body.sessionMode ?? 'EITHER') as SessionMode;
  const isPublished = Boolean(body.isPublished);

  // Publishing a tutor profile implies the tutor role.
  if (!user.roles.includes('TUTOR')) {
    await patchItem(TABLES.users, user.id, {
      roles: [...user.roles, 'TUTOR'],
      updatedAt: nowIso(),
    });
  }

  const discoverable = isDiscoverable({
    isPublished,
    subjectCount: subjectIds.length,
    bio,
  });

  const existing = await getTutorProfileByUserId(caller.userId);

  const shared = {
    userId: caller.userId,
    displayName: user.displayName,
    institution: user.institution ?? null,
    headline,
    bio,
    hourlyRate,
    currency: 'GBP',
    sessionMode,
    levels,
    subjectIds,
    isPublished,
    // Writing or removing this attribute is what adds or removes the profile from
    // the sparse byPublished index, i.e. from search results.
    publishedFlag: discoverable ? '1' : null,
    updatedAt: nowIso(),
  };

  if (existing) {
    return patchItem<TutorProfileRecord>(TABLES.tutorProfiles, existing.id, shared);
  }

  const created: TutorProfileRecord = {
    id: randomUUID(),
    ...shared,
    publishedFlag: discoverable ? '1' : undefined,
    // Aggregates are only ever written by refreshRatingAggregate.
    ratingAvg: null,
    ratingCount: 0,
    createdAt: nowIso(),
  } as TutorProfileRecord;

  await putItem(TABLES.tutorProfiles, created as unknown as Record<string, unknown>);
  return created;
}

async function createSlots(caller: Caller, body: Record<string, unknown>) {
  const inputs = (body.slots as { startAt: string; endAt: string }[]) ?? [];
  if (inputs.length === 0) {
    throw new DomainError(DomainErrorCode.VALIDATION, 'Nothing to add.');
  }

  const now = new Date();
  for (const input of inputs) {
    validateSlotTimes(input.startAt, input.endAt, now);
  }

  const profile = await getTutorProfileByUserId(caller.userId);
  if (!profile) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Create your tutor profile before adding availability.',
    );
  }

  const existing = await slotsForTutorProfile(profile.id);
  const created: AvailabilitySlot[] = [];

  for (const input of inputs) {
    // Checked against stored slots AND the ones added earlier in this batch.
    assertNoOverlap({ startAt: input.startAt, endAt: input.endAt }, [
      ...existing,
      ...created,
    ]);

    const slot: AvailabilitySlot = {
      id: randomUUID(),
      tutorProfileId: profile.id,
      tutorUserId: caller.userId,
      startAt: input.startAt,
      endAt: input.endAt,
      status: 'OPEN',
      sessionId: null,
    };
    await putItem(TABLES.slots, {
      ...slot,
      sessionId: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    created.push(slot);
  }

  return created;
}

async function deleteSlot(caller: Caller, slotId: string) {
  const slot = await getItem<AvailabilitySlot>(TABLES.slots, slotId);
  if (!slot) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That slot no longer exists.');
  }
  if (slot.tutorUserId !== caller.userId) {
    throw new DomainError(DomainErrorCode.FORBIDDEN, 'That is not your slot.');
  }

  // The slot itself records which session holds it, so this is a single lookup
  // rather than a scan of the tutor's history.
  const holding = slot.sessionId
    ? await getItem<SessionRecord>(TABLES.sessions, slot.sessionId)
    : null;
  assertSlotDeletable(slot, holding ? [holding] : []);

  await deleteItem(TABLES.slots, slotId);
  return { ok: true };
}

async function bookSession(caller: Caller, body: Record<string, unknown>) {
  const user = await ensureUser(caller);

  const slotId = String(body.slotId ?? '');
  const subjectId = String(body.subjectId ?? '');
  const topic = validateTopic(String(body.topic ?? ''));
  const note = String(body.note ?? '').trim().slice(0, LIMITS.noteMax) || null;

  if (!isValidSubjectId(subjectId)) {
    throw new DomainError(DomainErrorCode.VALIDATION, 'Choose a subject.', 'subjectId');
  }

  const slot = await getItem<AvailabilitySlot>(TABLES.slots, slotId);
  if (!slot) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That time is no longer offered.');
  }

  const profile = await getItem<TutorProfileRecord>(
    TABLES.tutorProfiles,
    slot.tutorProfileId,
  );
  if (!profile) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That tutor is no longer available.');
  }
  if (!profile.subjectIds.includes(subjectId)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'This tutor does not teach that subject.',
      'subjectId',
    );
  }

  const studentSessions = await sessionsForStudent(caller.userId);

  assertCanBook({
    slot,
    studentUserId: caller.userId,
    tutorUserId: slot.tutorUserId,
    studentSessions,
    now: new Date(),
  });

  // Reserve the slot before creating the session, so losing the race costs nothing.
  const sessionId = randomUUID();
  if (!(await claimSlot(slotId, sessionId))) {
    throw new DomainError(
      DomainErrorCode.SLOT_CONFLICT,
      'Someone just booked that time. Choose another slot.',
    );
  }

  try {
    const session: SessionRecord = {
      id: sessionId,
      slotId,
      tutorProfileId: profile.id,
      tutorUserId: profile.userId,
      tutorName: profile.displayName,
      studentUserId: caller.userId,
      studentName: user.displayName,
      participantUserIds: [profile.userId, caller.userId],
      subjectId,
      topic,
      note,
      mode: profile.sessionMode,
      status: 'PENDING',
      startAt: slot.startAt,
      endAt: slot.endAt,
      meetingLink: null,
      cancelledByUserId: null,
      completedAt: null,
      hasReview: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await putItem(TABLES.sessions, session as unknown as Record<string, unknown>);

    await notify({
      userId: profile.userId,
      type: 'SESSION_REQUESTED',
      title: 'New session request',
      body: `${user.displayName} asked for help with ${topic}.`,
      linkTo: '/dashboard/sessions',
    });

    return session;
  } catch (error) {
    // Do not leave a slot reserved for a session that was never created.
    await releaseSlot(slotId);
    throw error;
  }
}

async function respondToSession(
  caller: Caller,
  sessionId: string,
  body: Record<string, unknown>,
) {
  const accept = Boolean(body.accept);
  const meetingLink = String(body.meetingLink ?? '').trim() || null;

  const session = await getItem<SessionRecord>(TABLES.sessions, sessionId);
  if (!session) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
  }

  assertIsTutorOf(session, caller.userId);
  const next = accept ? 'CONFIRMED' : 'DECLINED';
  assertTransition(session.status, next);

  if (accept && meetingLink && !/^https:\/\/\S+$/i.test(meetingLink)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'A meeting link must be a secure https URL.',
      'meetingLink',
    );
  }

  const updated = await patchItem<SessionRecord>(TABLES.sessions, sessionId, {
    status: next,
    meetingLink: accept ? meetingLink : null,
    updatedAt: nowIso(),
  });

  if (!accept) await releaseSlot(session.slotId);

  await notify({
    userId: session.studentUserId,
    type: accept ? 'SESSION_CONFIRMED' : 'SESSION_DECLINED',
    title: accept ? 'Session confirmed' : 'Session declined',
    body: accept
      ? `${session.tutorName} confirmed your session.`
      : `${session.tutorName} cannot make that time. Try another slot.`,
    linkTo: '/dashboard/sessions',
  });

  return updated;
}

async function cancelSession(caller: Caller, sessionId: string) {
  const user = await ensureUser(caller);
  const session = await loadSessionForParticipant(sessionId, caller.userId);

  assertTransition(session.status, 'CANCELLED');

  const updated = await patchItem<SessionRecord>(TABLES.sessions, sessionId, {
    status: 'CANCELLED',
    cancelledByUserId: caller.userId,
    updatedAt: nowIso(),
  });

  await releaseSlot(session.slotId);

  const otherUserId =
    caller.userId === session.tutorUserId ? session.studentUserId : session.tutorUserId;
  await notify({
    userId: otherUserId,
    type: 'SESSION_CANCELLED',
    title: 'Session cancelled',
    body: `${user.displayName} cancelled the session.`,
    linkTo: '/dashboard/sessions',
  });

  return updated;
}

async function completeSession(caller: Caller, sessionId: string) {
  const session = await getItem<SessionRecord>(TABLES.sessions, sessionId);
  if (!session) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
  }

  assertIsTutorOf(session, caller.userId);
  assertTransition(session.status, 'COMPLETED');

  if (Date.parse(session.startAt) > Date.now()) {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      'You cannot complete a session before it has started.',
    );
  }

  const completedAt = nowIso();
  const updated = await patchItem<SessionRecord>(TABLES.sessions, sessionId, {
    status: 'COMPLETED',
    completedAt,
    updatedAt: completedAt,
  });

  await notify({
    userId: session.studentUserId,
    type: 'SESSION_COMPLETED',
    title: 'Session completed',
    body: 'Leave a review to help other students choose.',
    linkTo: '/dashboard/sessions',
  });

  return updated;
}

async function submitReview(
  caller: Caller,
  sessionId: string,
  body: Record<string, unknown>,
) {
  const user = await ensureUser(caller);
  const rating = Number(body.rating);
  const comment = String(body.comment ?? '');

  const session = await getItem<SessionRecord>(TABLES.sessions, sessionId);
  if (!session) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
  }

  const existingForSession = await queryAll<Review>({
    TableName: TABLES.reviews,
    IndexName: 'bySession',
    KeyConditionExpression: 'sessionId = :s',
    ExpressionAttributeValues: { ':s': sessionId },
  });

  assertCanReview({
    session,
    studentUserId: caller.userId,
    existingReviews: existingForSession,
    rating,
    comment,
  });

  const review: Review = {
    id: randomUUID(),
    sessionId,
    tutorProfileId: session.tutorProfileId,
    studentUserId: caller.userId,
    rating,
    comment: comment.trim(),
    createdAt: nowIso(),
  };

  await putItem(TABLES.reviews, {
    ...review,
    studentName: user.displayName,
    subjectId: session.subjectId,
  });

  await patchItem(TABLES.sessions, sessionId, { hasReview: true, updatedAt: nowIso() });
  await refreshRatingAggregate(session.tutorProfileId);

  await notify({
    userId: session.tutorUserId,
    type: 'REVIEW_RECEIVED',
    title: 'New review',
    body: `${user.displayName} left you a ${rating}-star review.`,
    linkTo: `/tutors/${session.tutorProfileId}`,
  });

  return review;
}

async function listMessages(caller: Caller, sessionId: string) {
  await loadSessionForParticipant(sessionId, caller.userId);
  return queryAll<Message>({
    TableName: TABLES.messages,
    IndexName: 'bySession',
    KeyConditionExpression: 'sessionId = :s',
    ExpressionAttributeValues: { ':s': sessionId },
  });
}

async function sendMessage(
  caller: Caller,
  sessionId: string,
  body: Record<string, unknown>,
) {
  const user = await ensureUser(caller);
  const clean = validateMessageBody(String(body.body ?? ''));

  const session = await getItem<SessionRecord>(TABLES.sessions, sessionId);
  if (!session) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
  }
  assertCanMessage(session, caller.userId);

  const message: Message = {
    id: randomUUID(),
    sessionId,
    senderUserId: caller.userId,
    body: clean,
    createdAt: nowIso(),
  };

  await putItem(TABLES.messages, { ...message, senderName: user.displayName });

  const otherUserId =
    caller.userId === session.tutorUserId ? session.studentUserId : session.tutorUserId;
  await notify({
    userId: otherUserId,
    type: 'MESSAGE_RECEIVED',
    title: `Message from ${user.displayName}`,
    body: clean.length > 90 ? `${clean.slice(0, 90)}...` : clean,
    linkTo: '/dashboard/messages',
  });

  return message;
}

async function listNotifications(caller: Caller) {
  const items = await queryAll<AppNotification>({
    TableName: TABLES.notifications,
    IndexName: 'byUser',
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': caller.userId },
    ScanIndexForward: false,
  });
  return items;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod.toUpperCase();

  // Preflight is normally answered by API Gateway's MOCK integration; this is a
  // belt-and-braces fallback.
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const isPublic = (event.resource ?? '').startsWith('/public');
  const path = (event.pathParameters?.proxy ?? '').replace(/^\/+|\/+$/g, '');
  const segments = path.split('/').filter(Boolean);

  try {
    // ----- Public -----------------------------------------------------------
    if (isPublic) {
      if (method === 'GET' && segments[0] === 'tutors') {
        if (segments.length === 1) return ok(await listTutorListings());

        const tutorId = segments[1]!;
        if (segments.length === 2) return ok(await getTutorListing(tutorId));
        if (segments[2] === 'slots') return ok(await slotsForTutorProfile(tutorId));
        if (segments[2] === 'reviews') return ok(await reviewsForTutorProfile(tutorId));
      }
      throw new DomainError(DomainErrorCode.NOT_FOUND, 'Unknown endpoint.');
    }

    // ----- Authenticated ----------------------------------------------------
    const caller = requireCaller(event);
    const body = parseBody<Record<string, unknown>>(event);

    if (segments[0] === 'me') {
      const sub = segments[1];

      if (sub === 'profile') {
        if (method === 'GET') return ok(await ensureUser(caller));
        if (method === 'PUT') return ok(await updateMyProfile(caller, body));
      }

      if (sub === 'tutor-profile') {
        if (method === 'GET') return ok(await getTutorProfileByUserId(caller.userId));
        if (method === 'PUT') return ok(await saveMyTutorProfile(caller, body));
      }

      if (sub === 'slots') {
        if (method === 'GET') {
          return ok(
            await queryAll<AvailabilitySlot>({
              TableName: TABLES.slots,
              IndexName: 'byTutorUser',
              KeyConditionExpression: 'tutorUserId = :u',
              ExpressionAttributeValues: { ':u': caller.userId },
            }),
          );
        }
        if (method === 'POST') return ok(await createSlots(caller, body), 201);
        if (method === 'DELETE' && segments[2]) {
          return ok(await deleteSlot(caller, segments[2]));
        }
      }

      if (sub === 'sessions' && method === 'GET') {
        // A user can be tutor in some sessions and student in others, so both
        // indexes are queried and merged.
        const [asStudent, asTutor] = await Promise.all([
          sessionsForStudent(caller.userId),
          sessionsForTutor(caller.userId),
        ]);
        const byId = new Map<string, SessionRecord>();
        for (const session of [...asStudent, ...asTutor]) byId.set(session.id, session);
        return ok(
          [...byId.values()].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt)),
        );
      }

      if (sub === 'notifications') {
        if (method === 'GET') return ok(await listNotifications(caller));
        if (method === 'POST' && segments[2] === 'read-all') {
          const unread = (await listNotifications(caller)).filter((item) => !item.read);
          await Promise.all(
            unread.map((item) =>
              patchItem(TABLES.notifications, item.id, { read: true }),
            ),
          );
          return ok({ ok: true });
        }
        if (method === 'POST' && segments[2] && segments[3] === 'read') {
          const notification = await getItem<AppNotification>(
            TABLES.notifications,
            segments[2],
          );
          // Silently ignore someone else's notification rather than confirming
          // that it exists.
          if (notification && notification.userId === caller.userId) {
            await patchItem(TABLES.notifications, segments[2], { read: true });
          }
          return ok({ ok: true });
        }
      }
    }

    if (segments[0] === 'sessions') {
      if (method === 'POST' && segments.length === 1) {
        return ok(await bookSession(caller, body), 201);
      }

      const sessionId = segments[1];
      if (sessionId) {
        if (method === 'GET' && segments.length === 2) {
          return ok(await loadSessionForParticipant(sessionId, caller.userId));
        }
        if (method === 'GET' && segments[2] === 'messages') {
          return ok(await listMessages(caller, sessionId));
        }
        if (method === 'POST') {
          switch (segments[2]) {
            case 'respond':
              return ok(await respondToSession(caller, sessionId, body));
            case 'cancel':
              return ok(await cancelSession(caller, sessionId));
            case 'complete':
              return ok(await completeSession(caller, sessionId));
            case 'review':
              return ok(await submitReview(caller, sessionId, body), 201);
            case 'messages':
              return ok(await sendMessage(caller, sessionId, body), 201);
            default:
              break;
          }
        }
      }
    }

    throw new DomainError(DomainErrorCode.NOT_FOUND, 'Unknown endpoint.');
  } catch (error) {
    return fail(error);
  }
};
