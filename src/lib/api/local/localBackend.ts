/**
 * Demo-mode backend.
 *
 * Implements the same `Backend` contract as the AWS adapter and calls the same
 * functions from `shared/domain/rules.ts`. That is deliberate: if this file
 * enforced its own looser rules, QA would sign off behaviour that production does
 * not actually have.
 */

import { DomainError, DomainErrorCode } from '../../../../shared/domain/errors';
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
  validateEmail,
  validateHourlyRate,
  validateMessageBody,
  validatePassword,
  validateSlotTimes,
  validateTopic,
  LIMITS,
} from '../../../../shared/domain/rules';
import { isValidSubjectId } from '../../../../shared/domain/subjects';
// Single shared implementation, so the demo, Amplify and REST backends cannot
// disagree about what a tutor listing looks like.
import { buildListing } from '../../../../shared/domain/listing';
import type {
  AppNotification,
  AvailabilitySlot,
  Message,
  NotificationType,
  Review,
  SessionView,
  TutorProfile,
  UserProfile,
} from '../../../../shared/domain/types';
import type {
  AuthUser,
  Backend,
  BookSessionInput,
  CreateSlotInput,
  SignUpInput,
  TutorProfileInput,
  UpdateUserProfileInput,
} from '../contract';
import {
  hashPassword,
  mutate,
  newId,
  newSalt,
  readDb,
  writeDb,
  type LocalAccount,
  type LocalDb,
  type LocalSession,
} from './db';
import { seedDatabase, topUpSeedAvailability } from './seed';

/** Simulated latency, so loading and error states are actually exercised in review. */
const LATENCY_MS = 160;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

/**
 * In-flight seed, used only to stop two concurrent callers seeding twice. It is
 * deliberately *not* a one-shot latch: the readiness check below inspects the
 * actual database each time, so if storage is cleared mid-session (by the user, by
 * another tab, or between tests) the next call re-seeds instead of leaving the app
 * showing an empty platform until a reload.
 */
let seeding: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  const db = readDb();

  if (db.accounts.length > 0) {
    if (topUpSeedAvailability(db)) writeDb(db);
    return;
  }

  if (!seeding) {
    seeding = (async () => {
      // Re-read inside the critical section: another caller may have seeded
      // while this one was waiting.
      const fresh = readDb();
      if (fresh.accounts.length === 0) {
        await seedDatabase(fresh);
        writeDb(fresh);
      }
    })().finally(() => {
      seeding = null;
    });
  }

  return seeding;
}

function toAuthUser(account: LocalAccount): AuthUser {
  return {
    userId: account.id,
    displayName: account.displayName,
    email: account.email,
    roles: account.roles,
  };
}

function toUserProfile(account: LocalAccount): UserProfile {
  const { passwordHash: _hash, salt: _salt, seeded: _seeded, ...profile } = account;
  return profile;
}

function requireAccount(db: LocalDb): LocalAccount {
  const account = db.accounts.find((candidate) => candidate.id === db.currentUserId);
  if (!account) {
    throw new DomainError(DomainErrorCode.UNAUTHENTICATED, 'You need to sign in first.');
  }
  return account;
}

function toSessionView(session: LocalSession): SessionView {
  return session;
}

function pushNotification(
  db: LocalDb,
  params: { userId: string; type: NotificationType; title: string; body: string; linkTo: string },
): void {
  db.notifications.unshift({
    id: newId(),
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    linkTo: params.linkTo,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export const localBackend: Backend = {
  kind: 'local',

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  async getCurrentUser() {
    await ensureReady();
    const db = readDb();
    const account = db.accounts.find((candidate) => candidate.id === db.currentUserId);
    return account ? toAuthUser(account) : null;
  },

  async signUp(input: SignUpInput) {
    await ensureReady();

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

    const db = readDb();
    // AC-2: duplicate email is rejected with a specific message.
    if (db.accounts.some((account) => account.email === email)) {
      throw new DomainError(
        DomainErrorCode.EMAIL_IN_USE,
        'An account already exists with that email. Try signing in instead.',
        'email',
      );
    }

    const salt = newSalt();
    const passwordHash = await hashPassword(input.password, salt);

    const id = newId();

    return mutate((current) => {
      const account: LocalAccount = {
        id,
        // No separate identity provider in demo mode, so these are the same value.
        userId: id,
        displayName,
        email,
        roles: input.roles,
        institution: input.institution?.trim() || null,
        bio: null,
        createdAt: new Date().toISOString(),
        passwordHash,
        salt,
      };
      current.accounts.push(account);
      current.currentUserId = account.id;
      // No email exists in demo mode, so there is nothing to verify.
      return { needsConfirmation: false, user: toAuthUser(account), email };
    });
  },

  async confirmSignUp() {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Email confirmation is not used in demo mode.',
    );
  },

  async resendConfirmationCode() {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Email confirmation is not used in demo mode.',
    );
  },

  async signIn(emailInput: string, password: string) {
    await ensureReady();
    const email = emailInput.trim().toLowerCase();
    const db = readDb();
    const account = db.accounts.find((candidate) => candidate.email === email);

    // AC-4: the same message whether the email exists or the password is wrong, so
    // the form cannot be used to enumerate accounts.
    const genericFailure = new DomainError(
      DomainErrorCode.INVALID_CREDENTIALS,
      'That email and password combination is not correct.',
    );

    if (!account) {
      // Hash anyway so a missing account is not detectably faster.
      await hashPassword(password, 'timing-equaliser');
      throw genericFailure;
    }

    const attempted = await hashPassword(password, account.salt);
    if (attempted !== account.passwordHash) throw genericFailure;

    return mutate((current) => {
      current.currentUserId = account.id;
      return toAuthUser(account);
    });
  },

  async signOut() {
    mutate((db) => {
      db.currentUserId = null;
    });
    await delay(null);
  },

  // -------------------------------------------------------------------------
  // Profiles
  // -------------------------------------------------------------------------

  async getMyUserProfile() {
    await ensureReady();
    const db = readDb();
    const account = db.accounts.find((candidate) => candidate.id === db.currentUserId);
    return account ? toUserProfile(account) : null;
  },

  async updateMyUserProfile(input: UpdateUserProfileInput) {
    await ensureReady();

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

    return mutate((db) => {
      const account = requireAccount(db);
      if (displayName !== undefined) account.displayName = displayName;
      if (input.institution !== undefined) account.institution = input.institution?.trim() || null;
      if (input.bio !== undefined) account.bio = input.bio?.trim() || null;
      if (input.roles !== undefined) account.roles = input.roles;

      // Keep the denormalised public copy in step, or the tutor card and the
      // account would disagree about the person's name.
      const tutorProfile = db.tutorProfiles.find((profile) => profile.userId === account.id);
      if (tutorProfile) {
        tutorProfile.displayName = account.displayName;
        tutorProfile.institution = account.institution ?? null;
        tutorProfile.updatedAt = new Date().toISOString();
      }
      for (const session of db.sessions) {
        if (session.tutorUserId === account.id) session.tutorName = account.displayName;
        if (session.studentUserId === account.id) session.studentName = account.displayName;
      }

      return toUserProfile(account);
    });
  },

  async getMyTutorProfile() {
    await ensureReady();
    const db = readDb();
    if (!db.currentUserId) return null;
    return db.tutorProfiles.find((profile) => profile.userId === db.currentUserId) ?? null;
  },

  async saveMyTutorProfile(input: TutorProfileInput) {
    await ensureReady();

    const headline = input.headline.trim();
    if (headline.length < 10) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Write a short headline so students know what you cover.',
        'headline',
      );
    }
    if (headline.length > LIMITS.headlineMax) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        `Keep the headline under ${LIMITS.headlineMax} characters.`,
        'headline',
      );
    }

    const bio = input.bio.trim();
    if (bio.length < 40) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Add at least a couple of sentences about how you tutor.',
        'bio',
      );
    }
    if (bio.length > LIMITS.bioMax) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        `Keep your bio under ${LIMITS.bioMax} characters.`,
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

    return mutate((db) => {
      const account = requireAccount(db);
      const now = new Date().toISOString();

      // Publishing a tutor profile implies the tutor role.
      if (!account.roles.includes('TUTOR')) {
        account.roles = [...account.roles, 'TUTOR'];
      }

      const existing = db.tutorProfiles.find((profile) => profile.userId === account.id);

      if (existing) {
        existing.headline = headline;
        existing.bio = bio;
        existing.hourlyRate = hourlyRate;
        existing.sessionMode = input.sessionMode;
        existing.levels = input.levels;
        existing.subjectIds = subjectIds;
        existing.isPublished = input.isPublished;
        existing.displayName = account.displayName;
        existing.institution = account.institution ?? null;
        existing.updatedAt = now;
        return existing;
      }

      const created: TutorProfile = {
        id: newId(),
        userId: account.id,
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
        ratingAvg: null,
        ratingCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      db.tutorProfiles.push(created);
      return created;
    });
  },

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  async listTutorListings() {
    await ensureReady();
    const db = readDb();
    const now = new Date();

    // AC-13: only published profiles with a subject and a bio are discoverable.
    return db.tutorProfiles
      .filter((profile) =>
        isDiscoverable({
          isPublished: profile.isPublished,
          subjectCount: profile.subjectIds.length,
          bio: profile.bio,
        }),
      )
      .map((profile) => buildListing(profile, db.slots, now));
  },

  async getTutorListing(tutorProfileId: string) {
    await ensureReady();
    const db = readDb();
    const profile = db.tutorProfiles.find((candidate) => candidate.id === tutorProfileId);
    if (!profile) return null;
    return buildListing(profile, db.slots, new Date());
  },

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  async listSlotsForTutor(tutorProfileId: string) {
    await ensureReady();
    const db = readDb();
    return db.slots
      .filter((slot) => slot.tutorProfileId === tutorProfileId)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  },

  async listMySlots() {
    await ensureReady();
    const db = readDb();
    const account = requireAccount(db);
    return db.slots
      .filter((slot) => slot.tutorUserId === account.id)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  },

  async createSlots(inputs: CreateSlotInput[]) {
    await ensureReady();
    const now = new Date();

    if (inputs.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION, 'Nothing to add.');
    }
    for (const input of inputs) {
      validateSlotTimes(input.startAt, input.endAt, now);
    }

    return mutate((db) => {
      const account = requireAccount(db);
      const profile = db.tutorProfiles.find((candidate) => candidate.userId === account.id);
      if (!profile) {
        throw new DomainError(
          DomainErrorCode.VALIDATION,
          'Create your tutor profile before adding availability.',
        );
      }

      const created: AvailabilitySlot[] = [];
      const mine = db.slots.filter((slot) => slot.tutorProfileId === profile.id);

      for (const input of inputs) {
        // Checked against both stored slots and the ones added in this batch.
        assertNoOverlap({ startAt: input.startAt, endAt: input.endAt }, [...mine, ...created]);

        created.push({
          id: newId(),
          tutorProfileId: profile.id,
          tutorUserId: account.id,
          startAt: input.startAt,
          endAt: input.endAt,
          status: 'OPEN',
          sessionId: null,
        });
      }

      db.slots.push(...created);
      return created;
    });
  },

  async deleteSlot(slotId: string) {
    await ensureReady();
    mutate((db) => {
      const account = requireAccount(db);
      const slot = db.slots.find((candidate) => candidate.id === slotId);
      if (!slot) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That slot no longer exists.');
      }
      if (slot.tutorUserId !== account.id) {
        throw new DomainError(DomainErrorCode.FORBIDDEN, 'That is not your slot.');
      }

      // AC-17: blocked while a pending or confirmed session occupies the slot.
      assertSlotDeletable(slot, db.sessions);

      db.slots = db.slots.filter((candidate) => candidate.id !== slotId);
    });
    await delay(null);
  },

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  async listMySessions() {
    await ensureReady();
    const db = readDb();
    const account = requireAccount(db);
    return db.sessions
      .filter(
        (session) =>
          session.tutorUserId === account.id || session.studentUserId === account.id,
      )
      .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
      .map(toSessionView);
  },

  async getSession(sessionId: string) {
    await ensureReady();
    const db = readDb();
    const account = requireAccount(db);
    const session = db.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) return null;
    // AC-29: a non-participant cannot read the record at all.
    assertIsParticipant(session, account.id);
    return toSessionView(session);
  },

  async bookSession(input: BookSessionInput) {
    await ensureReady();
    const topic = validateTopic(input.topic);

    if (!isValidSubjectId(input.subjectId)) {
      throw new DomainError(DomainErrorCode.VALIDATION, 'Choose a subject.', 'subjectId');
    }
    const note = input.note?.trim().slice(0, LIMITS.noteMax) || null;

    // Synchronous critical section: no await between the check and the write, so
    // the slot cannot be claimed twice within this tab.
    const result = mutate((db) => {
      const account = requireAccount(db);
      const slot = db.slots.find((candidate) => candidate.id === input.slotId);
      if (!slot) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That time is no longer offered.');
      }

      const profile = db.tutorProfiles.find((candidate) => candidate.id === slot.tutorProfileId);
      if (!profile) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That tutor is no longer available.');
      }
      if (!profile.subjectIds.includes(input.subjectId)) {
        throw new DomainError(
          DomainErrorCode.VALIDATION,
          'This tutor does not teach that subject.',
          'subjectId',
        );
      }

      const studentSessions = db.sessions.filter(
        (session) => session.studentUserId === account.id,
      );

      assertCanBook({
        slot,
        studentUserId: account.id,
        tutorUserId: slot.tutorUserId,
        studentSessions,
        now: new Date(),
      });

      const nowIso = new Date().toISOString();
      const session: LocalSession = {
        id: newId(),
        slotId: slot.id,
        tutorProfileId: profile.id,
        tutorUserId: profile.userId,
        tutorName: profile.displayName,
        studentUserId: account.id,
        studentName: account.displayName,
        subjectId: input.subjectId,
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
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      slot.status = 'BOOKED';
      slot.sessionId = session.id;
      db.sessions.push(session);

      pushNotification(db, {
        userId: profile.userId,
        type: 'SESSION_REQUESTED',
        title: 'New session request',
        body: `${account.displayName} asked for help with ${topic}.`,
        linkTo: '/dashboard/sessions',
      });

      return toSessionView(session);
    });

    return delay(result);
  },

  async respondToSession(sessionId: string, accept: boolean, meetingLink?: string) {
    await ensureReady();

    if (accept && meetingLink && !/^https:\/\/\S+$/i.test(meetingLink)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'A meeting link must be a secure https URL.',
        'meetingLink',
      );
    }

    const result = mutate((db) => {
      const account = requireAccount(db);
      const session = db.sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
      }

      assertIsTutorOf(session, account.id);
      assertTransition(session.status, accept ? 'CONFIRMED' : 'DECLINED');

      session.status = accept ? 'CONFIRMED' : 'DECLINED';
      session.meetingLink = accept ? meetingLink?.trim() || null : null;
      session.updatedAt = new Date().toISOString();

      // AC-22: a declined request releases the slot.
      if (!accept) {
        const slot = db.slots.find((candidate) => candidate.id === session.slotId);
        if (slot) {
          slot.status = 'OPEN';
          slot.sessionId = null;
        }
      }

      pushNotification(db, {
        userId: session.studentUserId,
        type: accept ? 'SESSION_CONFIRMED' : 'SESSION_DECLINED',
        title: accept ? 'Session confirmed' : 'Session declined',
        body: accept
          ? `${session.tutorName} confirmed your session on ${new Date(session.startAt).toLocaleDateString()}.`
          : `${session.tutorName} cannot make that time. Try another slot.`,
        linkTo: '/dashboard/sessions',
      });

      return toSessionView(session);
    });

    return delay(result);
  },

  async cancelSession(sessionId: string) {
    await ensureReady();

    const result = mutate((db) => {
      const account = requireAccount(db);
      const session = db.sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
      }

      assertIsParticipant(session, account.id);
      assertTransition(session.status, 'CANCELLED');

      session.status = 'CANCELLED';
      session.cancelledByUserId = account.id;
      session.updatedAt = new Date().toISOString();

      const slot = db.slots.find((candidate) => candidate.id === session.slotId);
      if (slot) {
        slot.status = 'OPEN';
        slot.sessionId = null;
      }

      const otherUserId =
        account.id === session.tutorUserId ? session.studentUserId : session.tutorUserId;
      pushNotification(db, {
        userId: otherUserId,
        type: 'SESSION_CANCELLED',
        title: 'Session cancelled',
        body: `${account.displayName} cancelled the session on ${new Date(session.startAt).toLocaleDateString()}.`,
        linkTo: '/dashboard/sessions',
      });

      return toSessionView(session);
    });

    return delay(result);
  },

  async completeSession(sessionId: string) {
    await ensureReady();

    const result = mutate((db) => {
      const account = requireAccount(db);
      const session = db.sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
      }

      assertIsTutorOf(session, account.id);
      assertTransition(session.status, 'COMPLETED');

      if (Date.parse(session.startAt) > Date.now()) {
        throw new DomainError(
          DomainErrorCode.INVALID_TRANSITION,
          'You cannot complete a session before it has started.',
        );
      }

      session.status = 'COMPLETED';
      session.completedAt = new Date().toISOString();
      session.updatedAt = session.completedAt;

      pushNotification(db, {
        userId: session.studentUserId,
        type: 'SESSION_COMPLETED',
        title: 'Session completed',
        body: 'Leave a review to help other students choose.',
        linkTo: '/dashboard/sessions',
      });

      return toSessionView(session);
    });

    return delay(result);
  },

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  async listReviewsForTutor(tutorProfileId: string) {
    await ensureReady();
    const db = readDb();
    return db.reviews
      .filter((review) => review.tutorProfileId === tutorProfileId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async submitReview(sessionId: string, rating: number, comment: string) {
    await ensureReady();

    const result = mutate((db) => {
      const account = requireAccount(db);
      const session = db.sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
      }

      assertCanReview({
        session,
        studentUserId: account.id,
        existingReviews: db.reviews,
        rating,
        comment,
      });

      const review: Review = {
        id: newId(),
        sessionId,
        tutorProfileId: session.tutorProfileId,
        studentUserId: account.id,
        rating,
        comment: comment.trim(),
        createdAt: new Date().toISOString(),
      };
      db.reviews.push(review);
      session.hasReview = true;

      // AC-28: recomputed from the reviews that exist, never incremented blindly.
      const profile = db.tutorProfiles.find(
        (candidate) => candidate.id === session.tutorProfileId,
      );
      if (profile) {
        const ratings = db.reviews
          .filter((candidate) => candidate.tutorProfileId === profile.id)
          .map((candidate) => candidate.rating);
        const aggregate = computeRatingAggregate(ratings);
        profile.ratingAvg = aggregate.ratingAvg;
        profile.ratingCount = aggregate.ratingCount;
        profile.updatedAt = new Date().toISOString();
      }

      pushNotification(db, {
        userId: session.tutorUserId,
        type: 'REVIEW_RECEIVED',
        title: 'New review',
        body: `${account.displayName} left you a ${rating}-star review.`,
        linkTo: `/tutors/${session.tutorProfileId}`,
      });

      return review;
    });

    return delay(result);
  },

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  async listMessages(sessionId: string) {
    await ensureReady();
    const db = readDb();
    const account = requireAccount(db);
    const session = db.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
    }
    assertIsParticipant(session, account.id);

    return db.messages
      .filter((message) => message.sessionId === sessionId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },

  async sendMessage(sessionId: string, body: string) {
    await ensureReady();
    const clean = validateMessageBody(body);

    const result = mutate((db) => {
      const account = requireAccount(db);
      const session = db.sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        throw new DomainError(DomainErrorCode.NOT_FOUND, 'That session no longer exists.');
      }
      assertCanMessage(session, account.id);

      const message: Message = {
        id: newId(),
        sessionId,
        senderUserId: account.id,
        body: clean,
        createdAt: new Date().toISOString(),
      };
      db.messages.push(message);

      const otherUserId =
        account.id === session.tutorUserId ? session.studentUserId : session.tutorUserId;
      pushNotification(db, {
        userId: otherUserId,
        type: 'MESSAGE_RECEIVED',
        title: `Message from ${account.displayName}`,
        body: clean.length > 90 ? `${clean.slice(0, 90)}...` : clean,
        linkTo: '/dashboard/messages',
      });

      return message;
    });

    return delay(result);
  },

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  async listMyNotifications() {
    await ensureReady();
    const db = readDb();
    const account = requireAccount(db);
    return db.notifications
      .filter((notification) => notification.userId === account.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) as AppNotification[];
  },

  async markNotificationRead(notificationId: string) {
    await ensureReady();
    mutate((db) => {
      const account = requireAccount(db);
      const notification = db.notifications.find(
        (candidate) => candidate.id === notificationId,
      );
      if (notification && notification.userId === account.id) {
        notification.read = true;
      }
    });
  },

  async markAllNotificationsRead() {
    await ensureReady();
    mutate((db) => {
      const account = requireAccount(db);
      for (const notification of db.notifications) {
        if (notification.userId === account.id) notification.read = true;
      }
    });
  },
};
