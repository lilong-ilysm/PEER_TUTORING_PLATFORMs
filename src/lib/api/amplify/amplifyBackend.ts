/**
 * AWS backend: Cognito for identity, AppSync/DynamoDB for data, and the
 * session-actions Lambda for every state change.
 *
 * Read operations go straight to AppSync. Writes that carry an invariant go
 * through custom mutations, because a client that can write the `Session` model
 * directly can confirm its own booking request.
 *
 * Public reads use the API key so a guest can browse tutors, availability and
 * reviews before creating an account. No model readable with the API key contains
 * private data; see the comments in `amplify/data/resource.ts`.
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import {
  confirmSignUp as cognitoConfirmSignUp,
  fetchUserAttributes,
  getCurrentUser as cognitoGetCurrentUser,
  resendSignUpCode,
  signIn as cognitoSignIn,
  signOut as cognitoSignOut,
  signUp as cognitoSignUp,
} from 'aws-amplify/auth';

import type { Schema } from '../../../../amplify/data/resource';
import { DomainError, DomainErrorCode, extractErrorCode } from '../../../../shared/domain/errors';
import {
  computeRatingAggregate,
  isDiscoverable,
  validateDisplayName,
  validateEmail,
  validateHourlyRate,
  validatePassword,
  validateSlotTimes,
  assertNoOverlap,
  assertSlotDeletable,
  LIMITS,
} from '../../../../shared/domain/rules';
import { isValidSubjectId } from '../../../../shared/domain/subjects';
import { buildListing } from '../../../../shared/domain/listing';
import type {
  AcademicLevel,
  AppNotification,
  AvailabilitySlot,
  Message,
  Review,
  SessionMode,
  SessionView,
  TutorListing,
  TutorProfile,
  UserProfile,
  UserRole,
} from '../../../../shared/domain/types';
import { amplifyOutputs } from '../../config';
import type {
  AuthUser,
  Backend,
  BookSessionInput,
  CreateSlotInput,
  SignUpInput,
  SignUpResult,
  TutorProfileInput,
  UpdateUserProfileInput,
} from '../contract';

if (!amplifyOutputs) {
  throw new Error('amplify_outputs.json is required for the AWS backend.');
}
Amplify.configure(amplifyOutputs as Parameters<typeof Amplify.configure>[0]);

const client = generateClient<Schema>();

/** Public reads work for guests and signed-in users alike. */
const PUBLIC = { authMode: 'apiKey' } as const;

/**
 * Roles are chosen at registration but the `UserProfile` record can only be
 * written once the user is authenticated, which on AWS happens after email
 * confirmation. The choice is parked here in the meantime. Roles remain editable
 * from the profile screen, so the worst case if this is lost is that the user
 * picks again.
 */
const PENDING_ROLES_KEY = 'peertutor.pendingRoles';

function stashPendingRoles(roles: UserRole[], institution?: string): void {
  try {
    sessionStorage.setItem(PENDING_ROLES_KEY, JSON.stringify({ roles, institution }));
  } catch {
    // Storage unavailable; the profile bootstrap will fall back to STUDENT.
  }
}

function takePendingRoles(): { roles: UserRole[]; institution?: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ROLES_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_ROLES_KEY);
    return JSON.parse(raw) as { roles: UserRole[]; institution?: string };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

/** Converts an AppSync/GraphQL failure into the shared DomainError vocabulary. */
function throwGraphQlError(errors: { message: string }[] | undefined, fallback: string): never {
  const first = errors?.[0]?.message ?? '';
  const code = extractErrorCode(new Error(first));
  const readable = /\[[A-Z_]+\]\s*(.+)/.exec(first)?.[1];
  throw new DomainError(code, readable || fallback);
}

function unwrap<T>(
  result: { data?: T | null; errors?: { message: string }[] },
  fallback: string,
): T {
  if (result.errors?.length) throwGraphQlError(result.errors, fallback);
  if (result.data === null || result.data === undefined) {
    throw new DomainError(DomainErrorCode.NOT_FOUND, fallback);
  }
  return result.data;
}

/** Maps Cognito's error names onto our codes so the UI can react consistently. */
function translateAuthError(error: unknown): never {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? '';

  switch (name) {
    case 'UsernameExistsException':
      throw new DomainError(
        DomainErrorCode.EMAIL_IN_USE,
        'An account already exists with that email. Try signing in instead.',
        'email',
      );
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      // Deliberately identical for both, so the form cannot enumerate accounts.
      throw new DomainError(
        DomainErrorCode.INVALID_CREDENTIALS,
        'That email and password combination is not correct.',
      );
    case 'UserNotConfirmedException':
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Confirm your email address first. Check your inbox for the code.',
      );
    case 'CodeMismatchException':
      throw new DomainError(DomainErrorCode.VALIDATION, 'That code is not correct.', 'code');
    case 'ExpiredCodeException':
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'That code has expired. Request a new one.',
        'code',
      );
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Too many attempts. Wait a moment and try again.',
      );
    case 'InvalidPasswordException':
      throw new DomainError(DomainErrorCode.VALIDATION, message, 'password');
    default:
      throw new DomainError(
        DomainErrorCode.INTERNAL,
        message || 'Could not complete that request.',
      );
  }
}

// ---------------------------------------------------------------------------
// Record mapping. AppSync returns nullable fields for everything, so each record
// is normalised into the shared domain shape exactly once, here.
// ---------------------------------------------------------------------------

type RawTutorProfile = Awaited<
  ReturnType<typeof client.models.TutorProfile.get>
>['data'];

function mapTutorProfile(record: NonNullable<RawTutorProfile>): TutorProfile {
  return {
    id: record.id,
    userId: record.userId,
    displayName: record.displayName,
    institution: record.institution ?? null,
    headline: record.headline,
    bio: record.bio,
    hourlyRate: record.hourlyRate,
    currency: record.currency,
    sessionMode: record.sessionMode as SessionMode,
    levels: (record.levels ?? []).filter(Boolean) as AcademicLevel[],
    subjectIds: (record.subjectIds ?? []).filter(Boolean) as string[],
    isPublished: record.isPublished,
    ratingAvg: record.ratingAvg ?? null,
    ratingCount: record.ratingCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

type RawSlot = Awaited<ReturnType<typeof client.models.AvailabilitySlot.get>>['data'];

function mapSlot(record: NonNullable<RawSlot>): AvailabilitySlot {
  return {
    id: record.id,
    tutorProfileId: record.tutorProfileId,
    tutorUserId: record.tutorUserId,
    startAt: record.startAt,
    endAt: record.endAt,
    status: record.status as AvailabilitySlot['status'],
    sessionId: record.sessionId ?? null,
  };
}

type RawSession = Awaited<ReturnType<typeof client.models.Session.get>>['data'];

/**
 * Structural input shape rather than the model's own type.
 *
 * A `list`/`get` result types optional fields as `T | null | undefined`, while a
 * custom mutation result types them as `T | null`. Accepting the looser shape lets
 * one mapper serve both instead of needing near-duplicate versions.
 */
interface SessionRecordLike {
  id: string;
  slotId: string;
  tutorProfileId: string;
  tutorUserId: string;
  tutorName: string;
  studentUserId: string;
  studentName: string;
  subjectId: string;
  topic: string;
  note?: string | null;
  mode: string;
  status: string;
  startAt: string;
  endAt: string;
  meetingLink?: string | null;
  cancelledByUserId?: string | null;
  completedAt?: string | null;
  hasReview?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

function mapSession(record: SessionRecordLike): SessionView {
  return {
    id: record.id,
    slotId: record.slotId,
    tutorProfileId: record.tutorProfileId,
    tutorUserId: record.tutorUserId,
    tutorName: record.tutorName,
    studentUserId: record.studentUserId,
    studentName: record.studentName,
    subjectId: record.subjectId,
    topic: record.topic,
    note: record.note ?? null,
    mode: record.mode as SessionMode,
    status: record.status as SessionView['status'],
    startAt: record.startAt,
    endAt: record.endAt,
    meetingLink: record.meetingLink ?? null,
    cancelledByUserId: record.cancelledByUserId ?? null,
    completedAt: record.completedAt ?? null,
    hasReview: record.hasReview ?? false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

type RawReview = Awaited<ReturnType<typeof client.models.Review.get>>['data'];

interface ReviewRecordLike {
  id: string;
  sessionId: string;
  tutorProfileId: string;
  studentUserId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

function mapReview(record: ReviewRecordLike): Review {
  return {
    id: record.id,
    sessionId: record.sessionId,
    tutorProfileId: record.tutorProfileId,
    studentUserId: record.studentUserId,
    rating: record.rating,
    comment: record.comment ?? '',
    createdAt: record.createdAt,
  };
}

type RawMessage = Awaited<ReturnType<typeof client.models.Message.get>>['data'];

interface MessageRecordLike {
  id: string;
  sessionId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

function mapMessage(record: MessageRecordLike): Message {
  return {
    id: record.id,
    sessionId: record.sessionId,
    senderUserId: record.senderUserId,
    body: record.body,
    createdAt: record.createdAt,
  };
}

type RawNotification = Awaited<ReturnType<typeof client.models.Notification.get>>['data'];

function mapNotification(record: NonNullable<RawNotification>): AppNotification {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type as AppNotification['type'],
    title: record.title,
    body: record.body,
    linkTo: record.linkTo,
    read: record.read,
    createdAt: record.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

async function currentUserId(): Promise<string> {
  try {
    const user = await cognitoGetCurrentUser();
    return user.userId;
  } catch {
    throw new DomainError(DomainErrorCode.UNAUTHENTICATED, 'You need to sign in first.');
  }
}

async function findMyUserProfile(userId: string) {
  const result = await client.models.UserProfile.list({
    filter: { userId: { eq: userId } },
    limit: 1,
  });
  if (result.errors?.length) throwGraphQlError(result.errors, 'Could not load your profile.');
  return result.data?.[0] ?? null;
}

/**
 * Creates the `UserProfile` record on first authenticated load. Cognito owns the
 * credentials; this model owns the application-level fields such as roles.
 */
async function ensureUserProfile(): Promise<UserProfile> {
  const userId = await currentUserId();
  const existing = await findMyUserProfile(userId);

  if (existing) {
    return {
      id: existing.id,
      userId: existing.userId,
      displayName: existing.displayName,
      email: existing.email,
      roles: (existing.roles ?? []).filter(Boolean) as UserRole[],
      institution: existing.institution ?? null,
      bio: existing.bio ?? null,
      createdAt: existing.createdAt ?? new Date().toISOString(),
    };
  }

  const attributes = await fetchUserAttributes();
  const pending = takePendingRoles();

  const created = unwrap(
    await client.models.UserProfile.create({
      userId,
      displayName: attributes.name?.trim() || attributes.email?.split('@')[0] || 'Member',
      email: attributes.email ?? '',
      roles: pending?.roles?.length ? pending.roles : ['STUDENT'],
      institution: pending?.institution?.trim() || null,
    }),
    'Could not create your profile.',
  );

  return {
    id: created.id,
    userId: created.userId,
    displayName: created.displayName,
    email: created.email,
    roles: (created.roles ?? []).filter(Boolean) as UserRole[],
    institution: created.institution ?? null,
    bio: created.bio ?? null,
    createdAt: created.createdAt ?? new Date().toISOString(),
  };
}

/** Pages through a list query, because AppSync caps a single response. */
async function listAll<T>(
  fetchPage: (token?: string) => Promise<{
    data?: T[] | null;
    nextToken?: string | null;
    errors?: { message: string }[];
  }>,
  what: string,
): Promise<T[]> {
  const items: T[] = [];
  let token: string | undefined;
  let guard = 0;

  do {
    const page = await fetchPage(token);
    if (page.errors?.length) throwGraphQlError(page.errors, `Could not load ${what}.`);
    items.push(...((page.data ?? []) as T[]));
    token = page.nextToken ?? undefined;
    guard += 1;
  } while (token && guard < 20);

  return items;
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export const amplifyBackend: Backend = {
  kind: 'amplify',

  // --- Authentication -----------------------------------------------------

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      await cognitoGetCurrentUser();
    } catch {
      return null;
    }
    const profile = await ensureUserProfile();
    return {
      userId: profile.userId ?? profile.id,
      displayName: profile.displayName,
      email: profile.email,
      roles: profile.roles,
    };
  },

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const displayName = validateDisplayName(input.displayName);
    const email = validateEmail(input.email);
    validatePassword(input.password);

    if (input.roles.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Choose whether you want to learn, tutor, or both.',
        'roles',
      );
    }

    try {
      const result = await cognitoSignUp({
        username: email,
        password: input.password,
        options: {
          userAttributes: { email, name: displayName },
        },
      });

      stashPendingRoles(input.roles, input.institution);

      if (result.isSignUpComplete) {
        return { needsConfirmation: false, user: null, email };
      }
      return { needsConfirmation: true, user: null, email };
    } catch (error) {
      translateAuthError(error);
    }
  },

  async confirmSignUp(email: string, code: string, password?: string) {
    try {
      await cognitoConfirmSignUp({ username: email, confirmationCode: code.trim() });
    } catch (error) {
      translateAuthError(error);
    }

    // Sign the user straight in when we still hold the password, so confirmation
    // does not dead-end on a second login form.
    if (password) {
      return this.signIn(email, password);
    }
    return null;
  },

  async resendConfirmationCode(email: string) {
    try {
      await resendSignUpCode({ username: email });
    } catch (error) {
      translateAuthError(error);
    }
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    try {
      const result = await cognitoSignIn({
        username: email.trim().toLowerCase(),
        password,
      });
      if (!result.isSignedIn) {
        throw new DomainError(
          DomainErrorCode.VALIDATION,
          'Additional verification is required to sign in.',
        );
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      translateAuthError(error);
    }

    const profile = await ensureUserProfile();
    return {
      userId: profile.userId ?? profile.id,
      displayName: profile.displayName,
      email: profile.email,
      roles: profile.roles,
    };
  },

  async signOut() {
    await cognitoSignOut();
  },

  // --- Profiles -----------------------------------------------------------

  async getMyUserProfile() {
    try {
      await cognitoGetCurrentUser();
    } catch {
      return null;
    }
    return ensureUserProfile();
  },

  async updateMyUserProfile(input: UpdateUserProfileInput) {
    const userId = await currentUserId();
    const existing = await findMyUserProfile(userId);
    if (!existing) {
      throw new DomainError(DomainErrorCode.NOT_FOUND, 'Your profile was not found.');
    }

    const displayName =
      input.displayName === undefined ? undefined : validateDisplayName(input.displayName);

    if (input.roles && input.roles.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'You need at least one role on your account.',
        'roles',
      );
    }
    if (input.bio && input.bio.length > LIMITS.bioMax) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        `Keep your bio under ${LIMITS.bioMax} characters.`,
        'bio',
      );
    }

    const updated = unwrap(
      await client.models.UserProfile.update({
        id: existing.id,
        ...(displayName !== undefined ? { displayName } : {}),
        ...(input.institution !== undefined
          ? { institution: input.institution?.trim() || null }
          : {}),
        ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
        ...(input.roles !== undefined ? { roles: input.roles } : {}),
      }),
      'Could not save your profile.',
    );

    // Keep the public denormalised copy in step with the account record.
    if (displayName !== undefined || input.institution !== undefined) {
      const tutorProfiles = await client.models.TutorProfile.list({
        filter: { userId: { eq: userId } },
        limit: 1,
      });
      const mine = tutorProfiles.data?.[0];
      if (mine) {
        await client.models.TutorProfile.update({
          id: mine.id,
          ...(displayName !== undefined ? { displayName } : {}),
          ...(input.institution !== undefined
            ? { institution: input.institution?.trim() || null }
            : {}),
        });
      }
    }

    return {
      id: updated.id,
      userId: updated.userId,
      displayName: updated.displayName,
      email: updated.email,
      roles: (updated.roles ?? []).filter(Boolean) as UserRole[],
      institution: updated.institution ?? null,
      bio: updated.bio ?? null,
      createdAt: updated.createdAt ?? new Date().toISOString(),
    };
  },

  async getMyTutorProfile() {
    let userId: string;
    try {
      userId = await currentUserId();
    } catch {
      return null;
    }
    const result = await client.models.TutorProfile.list({
      filter: { userId: { eq: userId } },
      limit: 1,
    });
    if (result.errors?.length) {
      throwGraphQlError(result.errors, 'Could not load your tutor profile.');
    }
    const record = result.data?.[0];
    return record ? mapTutorProfile(record) : null;
  },

  async saveMyTutorProfile(input: TutorProfileInput) {
    const userId = await currentUserId();

    const headline = input.headline.trim();
    if (headline.length < 10 || headline.length > LIMITS.headlineMax) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        `Write a headline between 10 and ${LIMITS.headlineMax} characters.`,
        'headline',
      );
    }
    const bio = input.bio.trim();
    if (bio.length < 40 || bio.length > LIMITS.bioMax) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        `Write a bio between 40 and ${LIMITS.bioMax} characters.`,
        'bio',
      );
    }
    const hourlyRate = validateHourlyRate(input.hourlyRate);
    const subjectIds = [...new Set(input.subjectIds)].filter(isValidSubjectId);
    if (subjectIds.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Pick at least one subject you can tutor.',
        'subjectIds',
      );
    }
    if (input.levels.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Pick at least one level you can teach.',
        'levels',
      );
    }

    const account = await ensureUserProfile();

    // Publishing a tutor profile implies the tutor role.
    if (!account.roles.includes('TUTOR')) {
      const existingProfile = await findMyUserProfile(userId);
      if (existingProfile) {
        await client.models.UserProfile.update({
          id: existingProfile.id,
          roles: [...account.roles, 'TUTOR'],
        });
      }
    }

    const existing = await client.models.TutorProfile.list({
      filter: { userId: { eq: userId } },
      limit: 1,
    });
    const mine = existing.data?.[0];

    const fields = {
      userId,
      displayName: account.displayName,
      institution: account.institution ?? null,
      headline,
      bio,
      hourlyRate,
      currency: 'GBP',
      sessionMode: input.sessionMode,
      levels: input.levels,
      subjectIds,
      isPublished: input.isPublished,
    };

    if (mine) {
      return mapTutorProfile(
        unwrap(
          await client.models.TutorProfile.update({ id: mine.id, ...fields }),
          'Could not save your tutor profile.',
        ),
      );
    }

    return mapTutorProfile(
      unwrap(
        await client.models.TutorProfile.create({
          ...fields,
          // Aggregates start empty and are only ever written by the Lambda.
          ratingAvg: null,
          ratingCount: 0,
        }),
        'Could not create your tutor profile.',
      ),
    );
  },

  // --- Discovery ----------------------------------------------------------

  async listTutorListings() {
    const profiles = await listAll(
      (token) =>
        client.models.TutorProfile.list({
          ...PUBLIC,
          filter: { isPublished: { eq: true } },
          limit: 200,
          nextToken: token,
        }),
      'tutors',
    );

    const now = new Date();
    const slots = await listAll(
      (token) =>
        client.models.AvailabilitySlot.list({
          ...PUBLIC,
          filter: { status: { eq: 'OPEN' }, startAt: { gt: now.toISOString() } },
          limit: 500,
          nextToken: token,
        }),
      'availability',
    );

    const mappedSlots = slots.map((slot) => mapSlot(slot as NonNullable<RawSlot>));

    return profiles
      .map((record) => mapTutorProfile(record as NonNullable<RawTutorProfile>))
      // AC-13, applied through the same predicate the other backend uses.
      .filter((profile) =>
        isDiscoverable({
          isPublished: profile.isPublished,
          subjectCount: profile.subjectIds.length,
          bio: profile.bio,
        }),
      )
      .map((profile) => buildListing(profile, mappedSlots, now));
  },

  async getTutorListing(tutorProfileId: string) {
    const result = await client.models.TutorProfile.get(
      { id: tutorProfileId },
      { ...PUBLIC },
    );
    if (result.errors?.length) throwGraphQlError(result.errors, 'Could not load that tutor.');
    if (!result.data) return null;

    const profile = mapTutorProfile(result.data);
    const slots = await this.listSlotsForTutor(tutorProfileId);
    return buildListing(profile, slots, new Date());
  },

  // --- Availability -------------------------------------------------------

  async listSlotsForTutor(tutorProfileId: string) {
    const slots = await listAll(
      (token) =>
        client.models.AvailabilitySlot.list({
          ...PUBLIC,
          filter: { tutorProfileId: { eq: tutorProfileId } },
          limit: 300,
          nextToken: token,
        }),
      'availability',
    );
    return slots
      .map((slot) => mapSlot(slot as NonNullable<RawSlot>))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  },

  async listMySlots() {
    const userId = await currentUserId();
    const slots = await listAll(
      (token) =>
        client.models.AvailabilitySlot.list({
          filter: { tutorUserId: { eq: userId } },
          limit: 300,
          nextToken: token,
        }),
      'your availability',
    );
    return slots
      .map((slot) => mapSlot(slot as NonNullable<RawSlot>))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  },

  async createSlots(inputs: CreateSlotInput[]) {
    const now = new Date();
    if (inputs.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION, 'Nothing to add.');
    }
    for (const input of inputs) {
      validateSlotTimes(input.startAt, input.endAt, now);
    }

    const userId = await currentUserId();
    const profile = await this.getMyTutorProfile();
    if (!profile) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Create your tutor profile before adding availability.',
      );
    }

    const existing = await this.listMySlots();
    const created: AvailabilitySlot[] = [];

    for (const input of inputs) {
      assertNoOverlap({ startAt: input.startAt, endAt: input.endAt }, [...existing, ...created]);

      const record = unwrap(
        await client.models.AvailabilitySlot.create({
          tutorProfileId: profile.id,
          tutorUserId: userId,
          startAt: input.startAt,
          endAt: input.endAt,
          status: 'OPEN',
        }),
        'Could not publish that slot.',
      );
      created.push(mapSlot(record));
    }

    return created;
  },

  async deleteSlot(slotId: string) {
    const userId = await currentUserId();
    const slotResult = await client.models.AvailabilitySlot.get({ id: slotId });
    const slotRecord = slotResult.data;
    if (!slotRecord) {
      throw new DomainError(DomainErrorCode.NOT_FOUND, 'That slot no longer exists.');
    }
    const slot = mapSlot(slotRecord);
    if (slot.tutorUserId !== userId) {
      throw new DomainError(DomainErrorCode.FORBIDDEN, 'That is not your slot.');
    }

    // AC-17. The AppSync owner rule already prevents deleting someone else's slot;
    // this check adds the "not while it is booked" half.
    const sessions = await this.listMySessions();
    assertSlotDeletable(slot, sessions);

    const result = await client.models.AvailabilitySlot.delete({ id: slotId });
    if (result.errors?.length) throwGraphQlError(result.errors, 'Could not remove that slot.');
  },

  // --- Sessions -----------------------------------------------------------

  async listMySessions() {
    const userId = await currentUserId();
    const sessions = await listAll(
      (token) =>
        client.models.Session.list({
          filter: {
            or: [{ tutorUserId: { eq: userId } }, { studentUserId: { eq: userId } }],
          },
          limit: 300,
          nextToken: token,
        }),
      'your sessions',
    );
    return sessions
      .map((session) => mapSession(session as NonNullable<RawSession>))
      .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
  },

  async getSession(sessionId: string) {
    const result = await client.models.Session.get({ id: sessionId });
    if (result.errors?.length) throwGraphQlError(result.errors, 'Could not load that session.');
    // A non-participant gets null from AppSync's owner rule, which is the
    // server-side half of AC-29.
    return result.data ? mapSession(result.data) : null;
  },

  async bookSession(input: BookSessionInput) {
    const result = await client.mutations.bookSession({
      slotId: input.slotId,
      subjectId: input.subjectId,
      topic: input.topic,
      note: input.note ?? null,
    });
    return mapSession(unwrap(result, 'Could not book that session.'));
  },

  async respondToSession(sessionId: string, accept: boolean, meetingLink?: string) {
    const result = await client.mutations.respondToSession({
      sessionId,
      accept,
      meetingLink: meetingLink ?? null,
    });
    return mapSession(unwrap(result, 'Could not update that session.'));
  },

  async cancelSession(sessionId: string) {
    const result = await client.mutations.cancelSession({ sessionId });
    return mapSession(unwrap(result, 'Could not cancel that session.'));
  },

  async completeSession(sessionId: string) {
    const result = await client.mutations.completeSession({ sessionId });
    return mapSession(unwrap(result, 'Could not complete that session.'));
  },

  // --- Reviews ------------------------------------------------------------

  async listReviewsForTutor(tutorProfileId: string) {
    const reviews = await listAll(
      (token) =>
        client.models.Review.list({
          ...PUBLIC,
          filter: { tutorProfileId: { eq: tutorProfileId } },
          limit: 300,
          nextToken: token,
        }),
      'reviews',
    );
    return reviews
      .map((review) => mapReview(review as NonNullable<RawReview>))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async submitReview(sessionId: string, rating: number, comment: string) {
    const result = await client.mutations.submitReview({ sessionId, rating, comment });
    return mapReview(unwrap(result, 'Could not save your review.'));
  },

  // --- Messages -----------------------------------------------------------

  async listMessages(sessionId: string) {
    const messages = await listAll(
      (token) =>
        client.models.Message.list({
          filter: { sessionId: { eq: sessionId } },
          limit: 300,
          nextToken: token,
        }),
      'messages',
    );
    return messages
      .map((message) => mapMessage(message as NonNullable<RawMessage>))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },

  async sendMessage(sessionId: string, body: string) {
    const result = await client.mutations.sendMessage({ sessionId, body });
    return mapMessage(unwrap(result, 'Could not send that message.'));
  },

  // --- Notifications ------------------------------------------------------

  async listMyNotifications() {
    const userId = await currentUserId();
    const notifications = await listAll(
      (token) =>
        client.models.Notification.list({
          filter: { userId: { eq: userId } },
          limit: 200,
          nextToken: token,
        }),
      'notifications',
    );
    return notifications
      .map((record) => mapNotification(record as NonNullable<RawNotification>))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async markNotificationRead(notificationId: string) {
    await client.models.Notification.update({ id: notificationId, read: true });
  },

  async markAllNotificationsRead() {
    const unread = (await this.listMyNotifications()).filter(
      (notification) => !notification.read,
    );
    await Promise.all(
      unread.map((notification) =>
        client.models.Notification.update({ id: notification.id, read: true }),
      ),
    );
  },
};

/** Exposed for the rating consistency check in the profile view. */
export { computeRatingAggregate };
